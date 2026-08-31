// src/chessjs.ts — mutable drop-in façade over the turbochess core for chessjs
// consumers. Clean-room: implements the documented public surface from the
// purechess-rules / purechess-board-movegen / purechess-pgn-fen specs and the
// already-shipped functional core (src/chess.ts, src/fen.ts, src/san.ts) only —
// no external chess library source was read or copied. Every method delegates
// to the functional API (parseFen/makeFen, parseSan/makeSan, makeMove,
// allDests) and mutates the instance's internal position (class façade over
// the immutable engine). SAN `+`/`#`/`O-O`/`0-0`/`=Q` output comes straight
// from makeSan, so screen-reader announcements (AriaLiveAnnouncer) stay
// byte-identical regardless of which façade drives the board.
// MIT turbochess (formerly turbochess, ADR-015).

import { Color, Role } from "./types.js";
import type { Move, Position } from "./types.js";
import { parseFen, makeFen } from "./fen.js";
import { parseSan, makeSan, makeUci, parseUci } from "./san.js";
import {
  makeMove,
  allDests,
  dests,
  isLegal,
  isCheck,
  isCheckmate,
  isStalemate,
  isInsufficientMaterial,
  isFiftyMoveDraw,
  isThreefoldRepetition,
  detectCastling,
} from "./chess.js";
import { pieceAt } from "./board.js";
import { parseSquare, squareName, roleToChar } from "./util.js";

export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Baseline-style color name. */
export type ColorName = "w" | "b";
/** Baseline-style piece type char. */
export type PieceChar = "p" | "n" | "b" | "r" | "q" | "k";

/** Verbose move object (chessjs-consumer `Move` shape). */
export type VerboseMove = {
  color: ColorName;
  from: string;
  to: string;
  piece: PieceChar;
  captured?: PieceChar;
  promotion?: PieceChar;
  flags: string;
  san: string;
  lan: string;
  before: string;
  after: string;
};

const ROLE_CHARS: Record<number, PieceChar> = {
  [Role.Pawn]: "p",
  [Role.Knight]: "n",
  [Role.Bishop]: "b",
  [Role.Rook]: "r",
  [Role.Queen]: "q",
  [Role.King]: "k",
};

const PROMO_ORDER = [Role.Queen, Role.Rook, Role.Bishop, Role.Knight];

function colorName(turn: Color): ColorName {
  return turn === Color.White ? "w" : "b";
}

type HistoryEntry = { before: Position; after: Position; move: Move; san: string };

export class Chess {
  #pos: Position;
  #startFen: string;
  #history: HistoryEntry[] = [];

  constructor(fen: string = INITIAL_FEN) {
    const r = parseFen(fen);
    if (!r.ok) throw new Error(`Invalid FEN: ${fen}`);
    this.#pos = r.value;
    this.#startFen = this.#fenOf(r.value);
  }

  /** Replaces the current position (throws on an invalid FEN). */
  load(fen: string): void {
    const r = parseFen(fen);
    if (!r.ok) throw new Error(`Invalid FEN: ${fen}`);
    this.#pos = r.value;
    this.#startFen = this.#fenOf(r.value);
    this.#history = [];
  }

  /** Resets to the initial position and clears history. */
  reset(): void {
    this.load(INITIAL_FEN);
  }

  /** Current FEN (byte-identical to the engine's makeFen modulo ep filtering). */
  fen(): string {
    return this.#fenOf(this.#pos);
  }

  /** Side to move: "w" | "b". */
  turn(): ColorName {
    return colorName(this.#pos.turn);
  }

  /** Current fullmove number (starts at 1). */
  moveNumber(): number {
    return this.#pos.fullmoves ?? this.#pos.fullmove ?? 1;
  }

  /**
   * Plays a move given as SAN (tolerant: `+`/`#` suffixes, `x` on quiet moves,
   * `0-0`/`O-O`) or as UCI (`e2e4`, `e7e8q`). Returns the verbose move, or
   * null when the move is illegal.
   */
  move(input: string): VerboseMove | null {
    const pos = this.#pos;
    let mv: Move | null = null;
    const sanRes = parseSan(input, pos);
    if (sanRes.ok) {
      mv = sanRes.value;
    } else {
      const uciRes = parseUci(input);
      if (uciRes.ok && isLegal(pos, uciRes.value)) mv = uciRes.value;
    }
    if (!mv) return null;
    const san = makeSan(mv, pos);
    const after = makeMove(pos, mv);
    this.#pos = after;
    this.#history.push({ before: pos, after, move: mv, san });
    return this.#describe(pos, mv, after, san);
  }

  /**
   * Legal moves. Default: SAN strings. `{ verbose: true }`: VerboseMove[]
   * (shape-compatible with the chessjs consumer baseline). `{ square }` filters
   * by origin square ("e2").
   */
  moves(options: { square?: string; verbose: true }): VerboseMove[];
  moves(options?: { square?: string; verbose?: false }): string[];
  moves(options?: { square?: string; verbose?: boolean }): string[] | VerboseMove[] {
    const pos = this.#pos;
    const out: (string | VerboseMove)[] = [];
    const emit = (from: number, set: { lo: number; hi: number }) => {
      const piece = pieceAt(pos.board, from);
      if (!piece) return;
      for (const to of iterSet(set)) {
        for (const mv of buildMoves(pos, piece.role, from, to)) {
          const san = makeSan(mv, pos);
          if (options?.verbose) out.push(this.#describe(pos, mv, makeMove(pos, mv), san));
          else out.push(san);
        }
      }
    };
    if (options?.square !== undefined) {
      const sq = parseSquare(options.square);
      if (sq === undefined) return [];
      emit(sq, dests(pos, sq));
    } else {
      for (const [from, set] of allDests(pos)) emit(from, set);
    }
    return out as string[] | VerboseMove[];
  }

  /** SAN history by default; `{ verbose: true }` for full move objects. */
  history(options: { verbose: true }): VerboseMove[];
  history(options?: { verbose?: false }): string[];
  history(options?: { verbose?: boolean }): string[] | VerboseMove[] {
    if (options?.verbose) {
      return this.#history.map((h) => this.#describe(h.before, h.move, h.after, h.san));
    }
    return this.#history.map((h) => h.san);
  }

  /** Reverts the last move; returns it in verbose shape, or null if none. */
  undo(): VerboseMove | null {
    const last = this.#history.pop();
    if (!last) return null;
    this.#pos = last.before;
    return this.#describe(last.before, last.move, last.after, last.san);
  }

  isCheck(): boolean {
    return isCheck(this.#pos);
  }

  isCheckmate(): boolean {
    return isCheckmate(this.#pos);
  }

  isStalemate(): boolean {
    return isStalemate(this.#pos);
  }

  /** Draw by insufficient material, the fifty-move rule, or threefold repetition. */
  isDraw(): boolean {
    if (isInsufficientMaterial(this.#pos)) return true;
    if (isFiftyMoveDraw(this.#pos)) return true;
    if (isThreefoldRepetition(this.#positions())) return true;
    return false;
  }

  /** Draw by the fifty-move rule. */
  isDrawByFiftyMoves(): boolean {
    return isFiftyMoveDraw(this.#pos);
  }

  /** Draw by insufficient material. */
  isInsufficientMaterial(): boolean {
    return isInsufficientMaterial(this.#pos);
  }

  /** Draw by threefold repetition over the game's position history. */
  isThreefoldRepetition(): boolean {
    return isThreefoldRepetition(this.#positions());
  }

  /** Game over: checkmate, stalemate, or draw. */
  isGameOver(): boolean {
    return this.isCheckmate() || this.isStalemate() || this.isDraw();
  }

  /** Piece on a square ("e2"), or undefined. */
  get(square: string): { type: PieceChar; color: ColorName } | undefined {
    const sq = parseSquare(square);
    if (sq === undefined) return undefined;
    const p = pieceAt(this.#pos.board, sq);
    if (!p) return undefined;
    return { type: ROLE_CHARS[p.role], color: colorName(p.color) };
  }

  /** 8x8 board, rank 8 first; null on empty squares. */
  board(): ({ square: string; type: PieceChar; color: ColorName } | null)[][] {
    const rows: ({ square: string; type: PieceChar; color: ColorName } | null)[][] = [];
    for (let rank = 7; rank >= 0; rank--) {
      const row: ({ square: string; type: PieceChar; color: ColorName } | null)[] = [];
      for (let file = 0; file < 8; file++) {
        const sq = rank * 8 + file;
        const p = pieceAt(this.#pos.board, sq);
        row.push(p ? { square: squareName(sq), type: ROLE_CHARS[p.role], color: colorName(p.color) } : null);
      }
      rows.push(row);
    }
    return rows;
  }

  /** "light" | "dark" square color ("a1" is light, like the consumer baseline). */
  squareColor(square: string): "light" | "dark" | undefined {
    const sq = parseSquare(square);
    if (sq === undefined) return undefined;
    return (((sq & 7) + (sq >> 3)) & 1) === 0 ? "light" : "dark";
  }

  /** PGN: Seven Tag Roster defaults, FEN/SetUp for non-default starts, numbered movetext. */
  pgn(): string {
    const headers = new Map<string, string>([
      ["Event", "?"],
      ["Site", "?"],
      ["Date", "????.??.??"],
      ["Round", "?"],
      ["White", "?"],
      ["Black", "?"],
      ["Result", "*"],
    ]);
    if (this.#startFen !== INITIAL_FEN) {
      headers.set("SetUp", "1");
      headers.set("FEN", this.#startFen);
    }
    let out = "";
    for (const [k, v] of headers) out += `[${k} "${v}"]\n`;
    out += "\n";
    out += this.#movetext();
    return out;
  }

  #movetext(): string {
    const sans = this.#history.map((h) => h.san);
    let fullmove = parseFullmove(this.#startFen);
    const blackToStart = this.#startFen.split(/\s+/)[1] === "b";
    let s = "";
    let ply = 0;
    if (blackToStart && sans.length > 0) {
      s += `${fullmove}... ${sans[0]} `;
      ply = 1;
      fullmove++;
    }
    while (ply < sans.length) {
      s += `${fullmove}. ${sans[ply]} `;
      ply++;
      if (ply < sans.length) {
        s += `${sans[ply]} `;
        ply++;
      }
      fullmove++;
    }
    s = s.trimEnd();
    return s + (s ? " " : "") + "*";
  }

  #positions(): Position[] {
    const out: Position[] = [];
    if (this.#history.length > 0) out.push(this.#history[0].before);
    for (const h of this.#history) out.push(h.after);
    return out;
  }

  #describe(pos: Position, mv: Move, after: Position, san: string): VerboseMove {
    const piece = pieceAt(pos.board, mv.from);
    if (!piece) throw new Error("corrupt move: missing origin piece");
    const target = pieceAt(pos.board, mv.to);
    const isEp =
      !!mv.isEnPassant ||
      (piece.role === Role.Pawn && pos.epSquare !== null && mv.to === pos.epSquare && (mv.to & 7) !== (mv.from & 7));
    const isCapture = !!target && target.color !== pos.turn && !isEp;
    const isDoublePush = piece.role === Role.Pawn && Math.abs((mv.to >> 3) - (mv.from >> 3)) === 2;
    let castlingKingside: boolean | null = null;
    if (mv.isCastling) {
      const plan = detectCastling(pos, mv.from, mv.to);
      castlingKingside = plan ? plan.side === "king" : (mv.to & 7) === 6;
    }
    // Baseline flag semantics: castling is exclusively "k"/"q"; otherwise one
    // base flag — "e" (en passant), "c" (capture), "b" (double pawn push) or
    // "n" (quiet) — plus "p" appended for promotions ("np"/"cp").
    const flags: string[] = [];
    if (castlingKingside !== null) {
      flags.push(castlingKingside ? "k" : "q");
    } else {
      if (isEp) flags.push("e");
      else if (isCapture) flags.push("c");
      else if (isDoublePush) flags.push("b");
      else flags.push("n");
      if (mv.promotion) flags.push("p");
    }
    // consumer-baseline parity: castling reports the king's landing square
    // ("e1g1") for both `to` and `lan`, not the engine's rook-capture form
    const landingSq = castlingKingside !== null ? (mv.from >> 3) * 8 + (castlingKingside ? 6 : 2) : null;
    const lan =
      landingSq !== null ? squareName(mv.from) + squareName(landingSq) : makeUci(mv);
    const out: VerboseMove = {
      color: colorName(pos.turn),
      from: squareName(mv.from),
      to: landingSq !== null ? squareName(landingSq) : squareName(mv.to),
      piece: ROLE_CHARS[piece.role],
      flags: flags.join(""),
      san,
      lan,
      before: this.#fenOf(pos),
      after: this.#fenOf(after),
    };
    if (isCapture || isEp) out.captured = isEp || !target ? "p" : ROLE_CHARS[target.role];
    if (mv.promotion) out.promotion = ROLE_CHARS[mv.promotion];
    return out;
  }

  /**
   * FEN with consumer-baseline ep semantics: the ep square is emitted only
   * when a LEGAL en passant capture exists (pseudo-legal-but-pinned captures
   * are suppressed). The core makeFen keeps the raw ep square
   * (engine-compatible); the chessjs-facing surface filters it.
   */
  #fenOf(pos: Position): string {
    const fen = makeFen(pos);
    const ep = pos.epSquare;
    if (ep === null || ep === undefined) return fen;
    const fields = fen.split(" ");
    if (fields[3] !== squareName(ep)) return fen; // engine already suppressed it
    if (!hasLegalEpCapture(pos)) {
      fields[3] = "-";
    }
    return fields.join(" ");
  }
}

/** Ascending square iteration over a {lo,hi} pair. */
function* iterSet(set: { lo: number; hi: number }): Generator<number> {
  let lo = set.lo >>> 0;
  let hi = set.hi >>> 0;
  while (lo !== 0) {
    const lsb = (lo & -lo) >>> 0;
    yield 31 - Math.clz32(lsb);
    lo ^= lsb;
  }
  while (hi !== 0) {
    const lsb = (hi & -hi) >>> 0;
    yield 32 + (31 - Math.clz32(lsb));
    hi ^= lsb;
  }
}

/** Expands pawn back-rank destinations into the four promotions. */
function buildMoves(pos: Position, role: number, from: number, to: number): Move[] {
  const toRank = to >> 3;
  if (role === Role.Pawn && (toRank === 7 || toRank === 0)) {
    return PROMO_ORDER.map((promotion) => ({
      from,
      to,
      promotion,
      isPromotion: true,
      isEnPassant: false,
      isCastling: false,
    }));
  }
  const isEp =
    role === Role.Pawn &&
    pos.epSquare !== null &&
    to === pos.epSquare &&
    (to & 7) !== (from & 7);
  const isCastling = role === Role.King ? detectCastling(pos, from, to) !== null : false;
  return [{ from, to, promotion: null, isPromotion: false, isEnPassant: isEp, isCastling }];
}

function parseFullmove(fen: string): number {
  const fields = fen.split(/\s+/);
  const n = Number(fields[5]);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** True when a LEGAL en passant capture onto `pos.epSquare` exists. */
function hasLegalEpCapture(pos: Position): boolean {
  const ep = pos.epSquare;
  if (ep === null || ep === undefined) return false;
  for (const [from, set] of allDests(pos)) {
    if ((from & 7) === (ep & 7)) continue; // ep capture is diagonal
    const p = pieceAt(pos.board, from);
    if (!p || p.role !== Role.Pawn) continue;
    for (const to of iterSet(set)) {
      if (to === ep) return true; // allDests is fully legal, no re-test needed
    }
  }
  return false;
}
