// src/chess.ts — core chess rules, Position/Setup, dests, isLegal, isCheck, perft etc
// MIT turbochess, clean-room from specs + FIDE notes (no G P L)

import * as sq from "./squareSet.js";
import type { SquareSet } from "./squareSet.js";
import * as board from "./board.js";
import type { Board } from "./board.js";
import * as attacks from "./attacks.js";
import { Color, Role } from "./types.js";
import type { Setup, Move, Result, CastlingRights, Position } from "./types.js";
import { opposite, squareFile, squareRank, parseSquare, squareName } from "./util.js";
import { zobristTablesLoaded, zobristAfterMove, calculateZobrist, zobristHex } from "./zobrist.js";
import type { ZobristKey } from "./zobrist.js";
import { parseFen, makeFen } from "./fen.js";
import { parseSan, makeSan, parseUci, makeUci } from "./san.js";
import {
  packOf,
  packedToMoves,
  PROMO_NONE,
  PROMO_KNIGHT,
  PROMO_BISHOP,
  PROMO_ROOK,
  PROMO_QUEEN,
} from "./packedMove.js";
import { build as buildTreeWrapper, pgnImport as pgnImportData } from "./chesstree.js";
import type { TreeNode, TreeWrapper } from "./chesstree.js";
import { pieceAt } from "./board.js";
import {
  CASTLE_WK,
  CASTLE_WQ,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_CLEAR_STD,
  CASTLING_RIGHTS_TABLE,
  PLAN_WHITE_K,
  PLAN_WHITE_Q,
  PLAN_BLACK_K,
  PLAN_BLACK_Q,
  getCastlingMask,
  CASTLE_PATH_LO,
  CASTLE_PATH_HI,
  CASTLE_TRAVERSAL_WHITE,
  CASTLE_TRAVERSAL_BLACK,
} from "./castling.js";


// helpers

export function isCheck(pos: Position): boolean {
  if (pos.checkers !== undefined) {
    return ((pos.checkers.lo | pos.checkers.hi) !== 0);
  }
  const ksq = board.kingSquare(pos.board, pos.turn);
  if (ksq === undefined) return false;
  const attacker = opposite(pos.turn);
  return attacks.isAttacked(pos.board, ksq, attacker);
}

export function kingAttackers(pos: Position, color: Color): SquareSet {
  return attacks.kingAttackers(pos.board, color);
}

// insufficient material per spec
export function isInsufficientMaterial(pos: Position): boolean {
  const b = pos.board;
  // only kings
  if (sq.equals(b.occupied, b.king)) return true;
  // count pieces
  const whitePawns = sq.popcnt(sq.and(b.white, b.pawn));
  const blackPawns = sq.popcnt(sq.and(b.black, b.pawn));
  const whiteRooks = sq.popcnt(sq.and(b.white, b.rook));
  const blackRooks = sq.popcnt(sq.and(b.black, b.rook));
  const whiteQueens = sq.popcnt(sq.and(b.white, b.queen));
  const blackQueens = sq.popcnt(sq.and(b.black, b.queen));
  if (whitePawns > 0 || blackPawns > 0 || whiteRooks > 0 || blackRooks > 0 || whiteQueens > 0 || blackQueens > 0) {
    return false;
  }
  const whiteKnights = sq.popcnt(sq.and(b.white, b.knight));
  const blackKnights = sq.popcnt(sq.and(b.black, b.knight));
  const whiteBishops = sq.popcnt(sq.and(b.white, b.bishop));
  const blackBishops = sq.popcnt(sq.and(b.black, b.bishop));

  const totalKnights = whiteKnights + blackKnights;
  const totalBishops = whiteBishops + blackBishops;

  // K vs K already handled
  // K+B vs K, K+N vs K
  if (totalKnights === 1 && totalBishops === 0) return true;
  if (totalBishops === 1 && totalKnights === 0) return true;

  // K+B vs K+B same color bishops
  if (totalBishops === 2 && totalKnights === 0) {
    // find bishop squares
    let firstB = sq.first(sq.or(sq.and(b.white, b.bishop), sq.and(b.black, b.bishop)));
    // Actually need both bishops
    const bishops = sq.or(sq.and(b.white, b.bishop), sq.and(b.black, b.bishop));
    const iter = [...sq.iter(bishops)];
    if (iter.length === 2) {
      const c1 = (squareFile(iter[0]) + squareRank(iter[0])) % 2;
      const c2 = (squareFile(iter[1]) + squareRank(iter[1])) % 2;
      if (c1 === c2) return true;
    }
  }

  // K+B vs K+B same color insufficient, opposite color sufficient -> false
  // K+N vs K+N etc not insufficient
  return false;
}

export function isFiftyMoveDraw(pos: Position): boolean {
  return (pos.halfmoves ?? pos.halfmove ?? 0) >= 100;
}
export function isSeventyFiveMoveDraw(pos: Position): boolean {
  return (pos.halfmoves ?? pos.halfmove ?? 0) >= 150;
}

export function isThreefoldRepetition(history: Position[]): boolean {
  if (history.length < 3) return false;
  const last = history[history.length - 1];
  let count = 0;
  for (const h of history) {
    if (positionsEqualForRepetition(h, last)) count++;
    if (count >= 3) return true;
  }
  return false;
}
export function isFivefoldRepetition(history: Position[]): boolean {
  if (history.length < 5) return false;
  const last = history[history.length - 1];
  let count = 0;
  for (const h of history) if (positionsEqualForRepetition(h, last)) count++;
  return count >= 5;
}

function positionsEqualForRepetition(a: Position, b: Position): boolean {
  if (a.turn !== b.turn) return false;
  if (a.epSquare !== b.epSquare) return false;
  if (!board.boardEquals(a.board, b.board)) return false;
  // castling sets equality
  if (a.castling.white.size !== b.castling.white.size) return false;
  if (a.castling.black.size !== b.castling.black.size) return false;
  for (const s of a.castling.white) if (!b.castling.white.has(s)) return false;
  for (const s of a.castling.black) if (!b.castling.black.has(s)) return false;
  return true;
}

// ---------- castling: one detect/apply path (ADR-013 as amended) ----------
// ADR-013 bake-off result (change purechess-gates-green, task 1.1): the
// baseline-style king-captures-rook representation (e1h1) is the single
// canonical OUTPUT encoding used by dests/allDests/genLegalMoves (and hence
// makeUci). It measured equal-or-faster than the normalized-landing encoding
// (perft d3 11.26 vs 11.42 ms median; makeMove walk 425 vs 430 ms; allDests
// 6.27 vs 6.39 ms — see bench/castling-bakeoff.mjs) and deletes the
// canonicalization layer: standard-chess and Chess960 handling converge and
// dests are byte-identical to baseline. Both INPUT forms are still accepted
// by detectCastling (king→rook square e1h1, and king→landing e1g1 as a
// two-file step) so `parseUci("e1g1")` in standard chess and 960 `e1h1`
// input keep working (UCI protocol boundary documented in ADR-013: engines
// are sent e1g1 for standard castling; conversion belongs to the engine
// boundary, not to makeUci).
export type CastlingPlan = {
  side: "king" | "queen";
  kingFrom: number;
  kingTo: number; // normalized landing square (6/2/62/58)
  rookFrom: number;
  rookTo: number; // 5/3/61/59
};

function castlingPlanFor(color: Color, ks: number, rs: number): CastlingPlan {
  const rank = squareRank(ks);
  const isKingSide = squareFile(rs) > squareFile(ks);
  return {
    side: isKingSide ? "king" : "queen",
    kingFrom: ks,
    kingTo: isKingSide ? (rank << 3) | 6 : (rank << 3) | 2,
    rookFrom: rs,
    rookTo: isKingSide ? (rank << 3) | 5 : (rank << 3) | 3,
  };
}

/** Finds the position's castling plan (if any) targeting square `to` (either
 * the rook origin or the normalized landing square). Shared by the hot loops. */
function planForDest(plans: CastlingPlan[], to: number): CastlingPlan | null {
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    if (p.rookFrom === to || p.kingTo === to) return p;
  }
  return null;
}

/**
 * Single source of truth for castling detection, shared by makeMove, isLegal,
 * makeSan, destsFast and genLegalMoves (design D2). Accepts both input
 * representations:
 *  - king→own-rook square (baseline / 960 input, e1h1), and
 *  - king→normalized landing square (e1g1; a two-file king step),
 * provided the corresponding castling right exists and the rook is actually
 * on its origin square. Returns null for every non-castling move — in
 * particular for an ordinary one-square king step to g1/c1/g8/c8, which the
 * previous per-call-site heuristics misclassified when ANY color (even the
 * opponent) held castling rights (root cause of the perft parity defect).
 */
export function detectCastling(pos: Position, from: number, to: number): CastlingPlan | null {
  if (!pos.isChess960) {
    const mask = pos.castlingMask ?? getCastlingMask(pos);
    if (mask === 0) return null;
    if (pos.turn === Color.White) {
      if ((mask & (CASTLE_WK | CASTLE_WQ)) === 0 || from !== 4) return null;
      if (to === 7 || to === 6) {
        if ((mask & CASTLE_WK) === 0) return null;
        if (to === 6 && board.pieceAt(pos.board, 6)) return null;
        const rp = board.pieceAt(pos.board, 7);
        if (rp && rp.color === Color.White && rp.role === Role.Rook) return PLAN_WHITE_K;
      } else if (to === 0 || to === 2) {
        if ((mask & CASTLE_WQ) === 0) return null;
        if (to === 2 && board.pieceAt(pos.board, 2)) return null;
        const rp = board.pieceAt(pos.board, 0);
        if (rp && rp.color === Color.White && rp.role === Role.Rook) return PLAN_WHITE_Q;
      }
      return null;
    } else {
      if ((mask & (CASTLE_BK | CASTLE_BQ)) === 0 || from !== 60) return null;
      if (to === 63 || to === 62) {
        if ((mask & CASTLE_BK) === 0) return null;
        if (to === 62 && board.pieceAt(pos.board, 62)) return null;
        const rp = board.pieceAt(pos.board, 63);
        if (rp && rp.color === Color.Black && rp.role === Role.Rook) return PLAN_BLACK_K;
      } else if (to === 56 || to === 58) {
        if ((mask & CASTLE_BQ) === 0) return null;
        if (to === 58 && board.pieceAt(pos.board, 58)) return null;
        const rp = board.pieceAt(pos.board, 56);
        if (rp && rp.color === Color.Black && rp.role === Role.Rook) return PLAN_BLACK_Q;
      }
      return null;
    }
  }

  // Chess960 fallback
  if (pos.castling.white.size === 0 && pos.castling.black.size === 0) return null;
  const piece = board.pieceAt(pos.board, from);
  if (!piece || piece.role !== Role.King || piece.color !== pos.turn) return null;
  const rights = piece.color === Color.White ? pos.castling.white : pos.castling.black;
  if (rights.size === 0) return null;
  const rank = squareRank(from);
  // Input form 1: king captures own rook on its origin square (baseline/960).
  if (rights.has(to) && squareRank(to) === rank) {
    const target = board.pieceAt(pos.board, to);
    if (target && target.color === piece.color && target.role === Role.Rook) {
      return castlingPlanFor(piece.color, from, to);
    }
  }
  // Input form 2: normalized landing square — a two-file step on the same rank.
  if (squareRank(to) === rank && Math.abs(squareFile(to) - squareFile(from)) === 2) {
    // The landing square must be empty for castling.
    if (!board.pieceAt(pos.board, to)) {
      for (const rs of rights) {
        const plan = castlingPlanFor(piece.color, from, rs);
        if (plan.kingTo !== to) continue;
        // The right's rook must actually be present on its origin square.
        const rp = board.pieceAt(pos.board, rs);
        if (rp && rp.color === piece.color && rp.role === Role.Rook) return plan;
      }
    }
  }
  return null;
}

// ---------- move execution (play) ----------
/**
 * Shared board-edit sequence used by BOTH the pure `makeMove` and the
 * hot-loop scratch tester below — a single source of truth so the fast path
 * can never drift from the pure path.
 */
function computeCaptured(
  pos: Position,
  origTo: number,
  to: number,
  isCastling: boolean,
  piece: { color: Color; role: Role },
): { color: Color; role: Role } | undefined {
  // capture handling (re-evaluate after normalization; for castling, captured is the rook but we handle rook move separately)
  // if we normalized 960 castling, original captured is rook but normalized to is now empty dest, so captured should be undefined for that case
  if (isCastling && piece.role === Role.King) {
    // For 960 normalized, the original rook capture is not a capture in normal sense; we should not treat as capture
    // Check if original move was king-captures-rook: then captured was rook, but after normalization we don't want to treat as capture of piece on dest (dest is empty)
    const origTarget = board.pieceAt(pos.board, origTo);
    if (origTarget && origTarget.color === piece.color && origTarget.role === Role.Rook) {
      return undefined;
    }
    return board.pieceAt(pos.board, to);
  }
  return board.pieceAt(pos.board, to);
}

function applyBoardEdits(
  nb: board.WritableBoard,
  pos: Position,
  from: number,
  to: number, // normalized dest (castling → G1/C1/G8/C8)
  origTo: number, // move.to before normalization (for capture removal)
  piece: { color: Color; role: Role },
  isEnPassant: boolean,
  plan: CastlingPlan | null, // non-null ⇒ castling, with the full king+rook plan
  isPromotion: boolean,
  promotion: Role | null,
  captured: { color: Color; role: Role } | undefined,
): void {
  // remove moving piece from from
  board.clearSquareInPlace(nb, from);
  // if en passant, remove captured pawn which is not on to square
  if (isEnPassant) {
    const epCaptureRank = pos.turn === Color.White ? squareRank(to) - 1 : squareRank(to) + 1;
    const epCaptureSq = epCaptureRank * 8 + squareFile(to);
    board.clearSquareInPlace(nb, epCaptureSq);
  } else if (captured) {
    // captured is only ever non-undefined when to === origTo (capture removal
    // square), so removing at origTo is exactly equivalent to the original
    // `removePiece(nb, to)`.
    board.clearSquareInPlace(nb, origTo);
  }

  // handle castling: king + rook relocation + rights context all come from the
  // single detectCastling plan (design D2) — no per-site rook scanning left.
  if (plan) {
    board.clearSquareInPlace(nb, plan.rookFrom);
    board.putPieceInPlace(nb, plan.rookTo, { color: pos.turn, role: Role.Rook });
    // place king on destination (to)
    board.putPieceInPlace(nb, to, { color: pos.turn, role: Role.King });
  } else {
    // normal move: place moving piece (with promotion)
    let role = piece.role;
    if (isPromotion && promotion !== undefined && promotion !== null) {
      role = promotion;
    }
    board.putPieceInPlace(nb, to, { color: piece.color, role });
  }
}

export function makeMove(pos: Position, move: Move): Position {
  let from = move.from;
  let to = move.to;
  let piece = board.pieceAt(pos.board, from);
  if (!piece) throw new Error("no piece at from");
  // Single castling detection for BOTH input representations (normalized
  // landing e1g1 and baseline/960 king-captures-rook e1h1) — fixes the defect
  // where `makeMove(pos, {from: king, to: landing})` moved only the king and
  // left the rook behind.
  let isEnPassant = !!move.isEnPassant;
  // Robust ep derivation: a pawn moving DIAGONALLY onto the ep square is an
  // en-passant capture even when the caller did not set the flag (external
  // move objects) — keeps the board edit AND the Zobrist delta correct.
  if (
    !isEnPassant &&
    piece.role === Role.Pawn &&
    pos.epSquare !== null &&
    move.to === pos.epSquare &&
    squareFile(move.from) !== squareFile(move.to)
  ) {
    isEnPassant = true;
  }
  // Single castling detection for BOTH input representations (normalized
  // landing e1g1 and baseline/960 king-captures-rook e1h1) — fixes the defect
  // where `makeMove(pos, {from: king, to: landing})` moved only the king and
  // left the rook behind. detectCastling is the ONLY castling apply path
  // (design D2: no second castling code path); a move explicitly flagged
  // isCastling whose rights no longer support detection is not castling.
  let plan: CastlingPlan | null = null;
  if (piece.role === Role.King) {
    plan = detectCastling(pos, from, to);
  }
  const isCastling = plan !== null;
  if (plan) to = plan.kingTo;
  const isPromotion = !!move.isPromotion || move.promotion !== undefined && move.promotion !== null;
  // Board construction: clone→mutate-clone (spec-sanctioned technique). `nb`
  // is a fresh writable board owned locally and returned as a read-only Board;
  // the input position is never touched, so the observable contract stays pure.
  // The edit sequence itself lives in applyBoardEdits (shared with the
  // hot-loop scratch tester).
  const nb = board.cloneAsWritable(pos.board);
  const captured = computeCaptured(pos, move.to, to, isCastling, piece);
  applyBoardEdits(nb, pos, from, to, move.to, piece, isEnPassant, plan, isPromotion, move.promotion ?? null, captured);

  // handle promotion: pawn must promote if reaching back rank
  // Already handled via move.promotion

  // update castling rights — standard chess uses 4-bit integer mask and O(1) table lookup
  let newCastling: CastlingRights;
  let newMask: number | undefined;
  if (!pos.isChess960) {
    const mask = pos.castlingMask ?? getCastlingMask(pos);
    newMask = (mask & CASTLE_CLEAR_STD[from] & CASTLE_CLEAR_STD[to]) >>> 0;
    newCastling = CASTLING_RIGHTS_TABLE[newMask];
  } else {
    let newWhite: ReadonlySet<number> = pos.castling.white;
    let newBlack: ReadonlySet<number> = pos.castling.black;
    if (piece.role === Role.King) {
      if (pos.turn === Color.White) {
        if (newWhite.size > 0) newWhite = new Set<number>();
      } else {
        if (newBlack.size > 0) newBlack = new Set<number>();
      }
    }
    if (piece.role === Role.Rook) {
      if (pos.turn === Color.White) {
        if (newWhite.has(from)) { const next = new Set(newWhite); next.delete(from); newWhite = next; }
      } else {
        if (newBlack.has(from)) { const next = new Set(newBlack); next.delete(from); newBlack = next; }
      }
    }
    if (captured && captured.role === Role.Rook) {
      if (captured.color === Color.White) {
        if (newWhite.has(to)) { const next = new Set(newWhite); next.delete(to); newWhite = next; }
      } else {
        if (newBlack.has(to)) { const next = new Set(newBlack); next.delete(to); newBlack = next; }
      }
    }
    newCastling = {
      white: newWhite,
      black: newBlack,
      whiteKing: newWhite.has(7),
      whiteQueen: newWhite.has(0),
      blackKing: newBlack.has(63),
      blackQueen: newBlack.has(56),
    };
  }

  // en passant square for next position
  let newEp: number | null = null;
  if (piece.role === Role.Pawn && Math.abs(squareRank(to) - squareRank(from)) === 2) {
    // double push
    const epRank = pos.turn === Color.White ? squareRank(from) + 1 : squareRank(from) - 1;
    newEp = epRank * 8 + squareFile(from);
  }

  // halfmove
  const isCapture = !!captured || isEnPassant;
  const isPawnMove = piece.role === Role.Pawn;
  const newHalf = isCapture || isPawnMove ? 0 : (pos.halfmoves ?? pos.halfmove ?? 0) + 1;
  // fullmove
  const newFull = pos.turn === Color.Black ? (pos.fullmoves ?? pos.fullmove ?? 1) + 1 : (pos.fullmoves ?? pos.fullmove ?? 1);

  const newTurn = opposite(pos.turn);
  const nextKingSq: [number, number] = pos.kingSq
    ? [pos.kingSq[0], pos.kingSq[1]]
    : [board.kingSquare(pos.board, Color.White) ?? -1, board.kingSquare(pos.board, Color.Black) ?? -1];
  if (piece.role === Role.King) {
    nextKingSq[pos.turn] = to;
  }
  (nb as { kingSq?: readonly [number, number] }).kingSq = nextKingSq;
  const newCheckers = attacks.kingAttackers(nb, newTurn);
  const newPos: Position = {
    board: nb,
    turn: newTurn,
    castling: newCastling,
    castlingMask: newMask,
    isChess960: pos.isChess960 ?? false,
    epSquare: newEp,
    halfmoves: newHalf,
    fullmoves: newFull,
    halfmove: newHalf,
    fullmove: newFull,
    kingSq: nextKingSq,
    checkers: newCheckers,
  };
  // Incremental O(1) Zobrist maintenance (design D2). Skipped (positions
  // carry no zobrist fields) until the Polyglot key tables have loaded via
  // ensureZobristLoaded() — the same lazy-loading contract as the magic
  // tables. The input position is never mutated: the key is attached to the
  // freshly built newPos before it escapes.
  if (zobristTablesLoaded()) {
    const zk = zobristAfterMove(pos, move, plan, isEnPassant, captured, newPos);
    (newPos as { zobristLo?: number; zobristHi?: number }).zobristLo = zk.lo;
    (newPos as { zobristLo?: number; zobristHi?: number }).zobristHi = zk.hi;
  }
  return newPos;
}

// alias play
export const play = makeMove;

// ---------- pseudo-legal generation ----------
const P_W_P = { color: Color.White, role: Role.Pawn };
const P_W_N = { color: Color.White, role: Role.Knight };
const P_W_B = { color: Color.White, role: Role.Bishop };
const P_W_R = { color: Color.White, role: Role.Rook };
const P_W_Q = { color: Color.White, role: Role.Queen };
const P_W_K = { color: Color.White, role: Role.King };

const P_B_P = { color: Color.Black, role: Role.Pawn };
const P_B_N = { color: Color.Black, role: Role.Knight };
const P_B_B = { color: Color.Black, role: Role.Bishop };
const P_B_R = { color: Color.Black, role: Role.Rook };
const P_B_Q = { color: Color.Black, role: Role.Queen };
const P_B_K = { color: Color.Black, role: Role.King };

function whitePawnPseudoDests(pos: Position, from: number): SquareSet {
  const occ = pos.board.occupied;
  const them = pos.board.black;
  let lo = 0, hi = 0;
  const to1 = from + 8;
  if (!sq.has(occ, to1)) {
    if (to1 < 32) lo |= (1 << to1) >>> 0; else hi |= (1 << (to1 - 32)) >>> 0;
    if (from >= 8 && from <= 15) {
      const to2 = from + 16;
      if (!sq.has(occ, to2)) {
        lo |= (1 << to2) >>> 0;
      }
    }
  }
  const f = from & 7;
  if (f > 0) {
    const capL = from + 7;
    if (sq.has(them, capL) || pos.epSquare === capL) {
      if (capL < 32) lo |= (1 << capL) >>> 0; else hi |= (1 << (capL - 32)) >>> 0;
    }
  }
  if (f < 7) {
    const capR = from + 9;
    if (sq.has(them, capR) || pos.epSquare === capR) {
      if (capR < 32) lo |= (1 << capR) >>> 0; else hi |= (1 << (capR - 32)) >>> 0;
    }
  }
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

function blackPawnPseudoDests(pos: Position, from: number): SquareSet {
  const occ = pos.board.occupied;
  const them = pos.board.white;
  let lo = 0, hi = 0;
  const to1 = from - 8;
  if (!sq.has(occ, to1)) {
    if (to1 < 32) lo |= (1 << to1) >>> 0; else hi |= (1 << (to1 - 32)) >>> 0;
    if (from >= 48 && from <= 55) {
      const to2 = from - 16;
      if (!sq.has(occ, to2)) {
        hi |= (1 << (to2 - 32)) >>> 0;
      }
    }
  }
  const f = from & 7;
  if (f > 0) {
    const capL = from - 9;
    if (sq.has(them, capL) || pos.epSquare === capL) {
      if (capL < 32) lo |= (1 << capL) >>> 0; else hi |= (1 << (capL - 32)) >>> 0;
    }
  }
  if (f < 7) {
    const capR = from - 7;
    if (sq.has(them, capR) || pos.epSquare === capR) {
      if (capR < 32) lo |= (1 << capR) >>> 0; else hi |= (1 << (capR - 32)) >>> 0;
    }
  }
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

function genPseudoDests(pos: Position, from: number, piece?: { color: Color; role: Role }): SquareSet {
  const p = piece ?? board.pieceAt(pos.board, from);
  if (!p || p.color !== pos.turn) return sq.empty();
  const occ = pos.board.occupied;
  const own = p.color === Color.White ? pos.board.white : pos.board.black;
  let pseudo: SquareSet;
  switch (p.role) {
    case Role.Pawn:
      pseudo = p.color === Color.White ? whitePawnPseudoDests(pos, from) : blackPawnPseudoDests(pos, from);
      break;
    case Role.Knight:
      pseudo = attacks.knightAttacks(from);
      pseudo = sq.minus(pseudo, own);
      break;
    case Role.Bishop:
      pseudo = attacks.bishopAttacks(from, occ);
      pseudo = sq.minus(pseudo, own);
      break;
    case Role.Rook:
      pseudo = attacks.rookAttacks(from, occ);
      pseudo = sq.minus(pseudo, own);
      break;
    case Role.Queen:
      pseudo = attacks.queenAttacks(from, occ);
      pseudo = sq.minus(pseudo, own);
      break;
    case Role.King: {
      pseudo = attacks.kingAttacks(from);
      pseudo = sq.minus(pseudo, own);
      // castling destinations
      const ks = from;
      // `from` IS this color's king square by definition (invariant: exactly
      // one king per color), so no kingSquare lookup is needed here.
      // Conditions to add castling dest: rights exist, between empty, not in check, traversal not attacked
      if (!pos.isChess960) {
        const mask = pos.castlingMask ?? getCastlingMask(pos);
        if (p.color === Color.White) {
          if (ks === 4 && (mask & (CASTLE_WK | CASTLE_WQ)) !== 0 && !isCheck(pos)) {
            const occLo = occ.lo;
            if ((mask & CASTLE_WK) !== 0 && (occLo & 0x60) === 0) {
              const rp = board.pieceAt(pos.board, 7);
              if (rp && rp.color === Color.White && rp.role === Role.Rook) {
                if (!attacks.isAttacked(pos.board, 5, Color.Black) && !attacks.isAttacked(pos.board, 6, Color.Black)) {
                  pseudo = sq.or(pseudo, sq.singleton(7));
                }
              }
            }
            if ((mask & CASTLE_WQ) !== 0 && (occLo & 0x0E) === 0) {
              const rp = board.pieceAt(pos.board, 0);
              if (rp && rp.color === Color.White && rp.role === Role.Rook) {
                if (!attacks.isAttacked(pos.board, 3, Color.Black) && !attacks.isAttacked(pos.board, 2, Color.Black)) {
                  pseudo = sq.or(pseudo, sq.singleton(0));
                }
              }
            }
          }
        } else {
          if (ks === 60 && (mask & (CASTLE_BK | CASTLE_BQ)) !== 0 && !isCheck(pos)) {
            const occHi = occ.hi;
            if ((mask & CASTLE_BK) !== 0 && (occHi & 0x60000000) === 0) {
              const rp = board.pieceAt(pos.board, 63);
              if (rp && rp.color === Color.Black && rp.role === Role.Rook) {
                if (!attacks.isAttacked(pos.board, 61, Color.White) && !attacks.isAttacked(pos.board, 62, Color.White)) {
                  pseudo = sq.or(pseudo, sq.singleton(63));
                }
              }
            }
            if ((mask & CASTLE_BQ) !== 0 && (occHi & 0x0E000000) === 0) {
              const rp = board.pieceAt(pos.board, 56);
              if (rp && rp.color === Color.Black && rp.role === Role.Rook) {
                if (!attacks.isAttacked(pos.board, 59, Color.White) && !attacks.isAttacked(pos.board, 58, Color.White)) {
                  pseudo = sq.or(pseudo, sq.singleton(56));
                }
              }
            }
          }
        }
      } else {
        // Chess960 fallback using precomputed CASTLE_PATH and traversal tables
        if (p.color === Color.White) {
          if (pos.castling.white.size > 0 && !isCheck(pos)) {
            const kingFile = ks & 7;
            for (const rs of pos.castling.white) {
              const rp = board.pieceAt(pos.board, rs);
              if (!rp || rp.color !== p.color || rp.role !== Role.Rook) continue;
              const rookFile = rs & 7;
              const idx = (kingFile << 3) | rookFile;
              if (((CASTLE_PATH_LO[idx] & occ.lo) | (CASTLE_PATH_HI[idx] & occ.hi)) !== 0) continue;
              const trav = CASTLE_TRAVERSAL_WHITE[idx];
              let attacked = false;
              for (let ti = 0; ti < trav.length; ti++) {
                if (attacks.isAttacked(pos.board, trav[ti], Color.Black)) { attacked = true; break; }
              }
              if (attacked) continue;
              pseudo = sq.or(pseudo, sq.singleton(rs));
            }
          }
        } else {
          if (pos.castling.black.size > 0 && !isCheck(pos)) {
            const kingFile = ks & 7;
            for (const rs of pos.castling.black) {
              const rp = board.pieceAt(pos.board, rs);
              if (!rp || rp.color !== p.color || rp.role !== Role.Rook) continue;
              const rookFile = rs & 7;
              const idx = 64 | (kingFile << 3) | rookFile;
              if (((CASTLE_PATH_LO[idx] & occ.lo) | (CASTLE_PATH_HI[idx] & occ.hi)) !== 0) continue;
              const trav = CASTLE_TRAVERSAL_BLACK[idx & 63];
              let attacked = false;
              for (let ti = 0; ti < trav.length; ti++) {
                if (attacks.isAttacked(pos.board, trav[ti], Color.White)) { attacked = true; break; }
              }
              if (attacked) continue;
              pseudo = sq.or(pseudo, sq.singleton(rs));
            }
          }
        }
      }
      break;
    }
    default:
      pseudo = sq.empty();
  }
  return pseudo;
}

// ---------- dests filtered for legality ----------
// ---- Hot-loop scratch (see FP policy in board.ts) ---------------------------
// `destScratch` is owned exclusively by moveLeavesKingSafe, a leaf function:
// while the scratch is live it only calls board/attacks helpers that never
// re-enter movegen, so no re-entrant caller can observe intermediate state.
// The public API remains pure — the scratch never escapes and its state is
// fully rewritten from the input position before each use.
const destScratch: board.WritableBoard = board.newScratchBoard();

/**
 * Hot-loop legality tester: applies the shared board-edit sequence
 * (applyBoardEdits — same code path as makeMove) to the reusable scratch
 * board, then checks whether our king is left attacked. Semantically
 * identical to `makeMove(pos, mv)` + `!isAttacked(our king)`, minus all the
 * per-pseudo-move allocation (Position, Sets, Move object, 3 board spreads).
 * Mutation is sanctioned here per the FP policy: hot loop, locally owned
 * scratch, inputs never mutated.
 */
function moveLeavesKingSafe(
  pos: Position,
  piece: { color: Color; role: Role },
  from: number,
  to: number, // normalized dest
  origTo: number, // move.to before normalization
  isEnPassant: boolean,
  plan: CastlingPlan | null, // non-null ⇒ castling (exact king+rook apply)
  isPromotion: boolean,
  promotion: Role | null,
): boolean {
  board.copyBoardInto(destScratch, pos.board);
  const captured = computeCaptured(pos, origTo, to, plan !== null, piece);
  applyBoardEdits(destScratch, pos, from, to, origTo, piece, isEnPassant, plan, isPromotion, promotion, captured);
  const ksq = board.kingSquare(destScratch, pos.turn);
  if (ksq === undefined) return false;
  return !attacks.isAttacked(destScratch, ksq, opposite(pos.turn));
}

// ---- Per-position check/pin-mask analysis (baseline-style legality) --------
// Computed ONCE per position, then reused for every piece's dests. This
// replaces per-pseudo-move play-and-test for the common cases; the exact
// play-and-test (moveLeavesKingSafe) remains only for the rare trap cases:
// en-passant (double horizontal pawn removal can expose the king along the
// rank) and castling (the rook's landing square can block back-rank attacks
// on the king destination).

type CheckContext = {
  us: Color;
  ksq: number;
  doubleCheck: boolean;
  /** squares that resolve a single check (block or capture); FULL when not in check */
  checkMask: SquareSet;
  /** squares the king may move to (not attacked with our king removed from occupancy) */
  kingSafe: SquareSet;
  /** pinned own pieces bitmask */
  pinned: SquareSet;
  /**
   * Castling plans for the side to move (empty when no rights / kingless),
   * computed once per position so the hot loops never re-run detectCastling
   * per king move. Legality is still filtered exactly in destsFast.
   */
  castlingPlans: CastlingPlan[];
};

export type { CheckContext };

// Reused castling plan scratch (same ownership discipline): avoids allocating
// two plan objects per analyzed position in the perft/movegen hot loop. The
// referenced position data is read-only and consumed within the same call.
const scratchCastlingPlans: CastlingPlan[] = [];
const scratchCastlingPlanA: CastlingPlan = { side: "king", kingFrom: 0, kingTo: 0, rookFrom: 0, rookTo: 0 };
const scratchCastlingPlanB: CastlingPlan = { side: "king", kingFrom: 0, kingTo: 0, rookFrom: 0, rookTo: 0 };

export function analyzeCheckContext(pos: Position): CheckContext {
  const us = pos.turn;
  const them = opposite(us);
  const ksq = board.kingSquare(pos.board, us);
  if (ksq === undefined) {
    // degenerate (kingless) position: no pins, no masks
    return { us, ksq: -1, doubleCheck: false, checkMask: sq.FULL, kingSafe: sq.EMPTY, pinned: sq.EMPTY, castlingPlans: [] };
  }
  const ctx: CheckContext = { us, ksq, doubleCheck: false, checkMask: sq.FULL, kingSafe: sq.EMPTY, pinned: sq.EMPTY, castlingPlans: [] };
  // Precompute the position's castling plans once (design D2): the hot loops
  // (destsFast king branch, genLegalMoves) look them up instead of re-running
  // the full detectCastling per king move. Plans are written into the reused
  // scratch array — no allocation in the hot loop.
  ctx.castlingPlans = scratchCastlingPlans;
  ctx.castlingPlans.length = 0;
  if (!pos.isChess960) {
    const mask = pos.castlingMask ?? getCastlingMask(pos);
    if (us === Color.White) {
      if ((mask & CASTLE_WK) !== 0 && ksq === 4) {
        const rp = board.pieceAt(pos.board, 7);
        if (rp && rp.color === Color.White && rp.role === Role.Rook) ctx.castlingPlans.push(PLAN_WHITE_K);
      }
      if ((mask & CASTLE_WQ) !== 0 && ksq === 4) {
        const rp = board.pieceAt(pos.board, 0);
        if (rp && rp.color === Color.White && rp.role === Role.Rook) ctx.castlingPlans.push(PLAN_WHITE_Q);
      }
    } else {
      if ((mask & CASTLE_BK) !== 0 && ksq === 60) {
        const rp = board.pieceAt(pos.board, 63);
        if (rp && rp.color === Color.Black && rp.role === Role.Rook) ctx.castlingPlans.push(PLAN_BLACK_K);
      }
      if ((mask & CASTLE_BQ) !== 0 && ksq === 60) {
        const rp = board.pieceAt(pos.board, 56);
        if (rp && rp.color === Color.Black && rp.role === Role.Rook) ctx.castlingPlans.push(PLAN_BLACK_Q);
      }
    }
  } else {
    const rights = us === Color.White ? pos.castling.white : pos.castling.black;
    if (rights.size > 0) {
      for (const rs of rights) {
        const rp = board.pieceAt(pos.board, rs);
        if (rp && rp.color === us && rp.role === Role.Rook) {
          const slot = ctx.castlingPlans.length === 0 ? scratchCastlingPlanA : scratchCastlingPlanB;
          const next = castlingPlanFor(us, ksq, rs);
          slot.side = next.side; slot.kingFrom = next.kingFrom; slot.kingTo = next.kingTo;
          slot.rookFrom = next.rookFrom; slot.rookTo = next.rookTo;
          ctx.castlingPlans.push(slot);
        }
      }
    }
  }
  const checkers = pos.checkers ?? attacks.kingAttackers(pos.board, us);
  const nCheckers = sq.popcount(checkers);
  if (nCheckers === 1) {
    const c = sq.first(checkers)!;
    ctx.checkMask = sq.or(attacks.between(ksq, c), sq.singleton(c));
  } else if (nCheckers >= 2) {
    ctx.doubleCheck = true;
  }
  // Pinned pieces: enemy slider "snipers" x-raying our king with exactly one
  // blocker between; if the blocker is ours, it is pinned to the sniper's ray.
  const themOcc = them === Color.White ? pos.board.white : pos.board.black;
  const themBQ = sq.or(sq.and(themOcc, pos.board.bishop), sq.and(themOcc, pos.board.queen));
  const themRQ = sq.or(sq.and(themOcc, pos.board.rook), sq.and(themOcc, pos.board.queen));
  const noOcc = sq.EMPTY;
  const snipers = sq.or(
    sq.and(themRQ, attacks.rookAttacks(ksq, noOcc)),
    sq.and(themBQ, attacks.bishopAttacks(ksq, noOcc)),
  );
  let pinnedLo = 0, pinnedHi = 0;
  let sLo = snipers.lo >>> 0, sHi = snipers.hi >>> 0;
  while (sLo !== 0) {
    const lsb = (sLo & -sLo) >>> 0;
    const sniper = Math.clz32(lsb) ^ 31;
    sLo = (sLo ^ lsb) >>> 0;
    const b = attacks.between(ksq, sniper);
    const bLo = (b.lo & pos.board.occupied.lo) >>> 0;
    const bHi = (b.hi & pos.board.occupied.hi) >>> 0;
    const nBlockers = sq.popcount({ lo: bLo, hi: bHi });
    if (nBlockers === 1) {
      const blockerSq = bLo !== 0 ? (Math.clz32((bLo & -bLo) >>> 0) ^ 31) : (32 + (Math.clz32((bHi & -bHi) >>> 0) ^ 31));
      if (!sq.has(themOcc, blockerSq)) {
        if (blockerSq < 32) pinnedLo |= (1 << blockerSq) >>> 0;
        else pinnedHi |= (1 << (blockerSq - 32)) >>> 0;
      }
    }
  }
  while (sHi !== 0) {
    const lsb = (sHi & -sHi) >>> 0;
    const sniper = 32 + (Math.clz32(lsb) ^ 31);
    sHi = (sHi ^ lsb) >>> 0;
    const b = attacks.between(ksq, sniper);
    const bLo = (b.lo & pos.board.occupied.lo) >>> 0;
    const bHi = (b.hi & pos.board.occupied.hi) >>> 0;
    const nBlockers = sq.popcount({ lo: bLo, hi: bHi });
    if (nBlockers === 1) {
      const blockerSq = bLo !== 0 ? (Math.clz32((bLo & -bLo) >>> 0) ^ 31) : (32 + (Math.clz32((bHi & -bHi) >>> 0) ^ 31));
      if (!sq.has(themOcc, blockerSq)) {
        if (blockerSq < 32) pinnedLo |= (1 << blockerSq) >>> 0;
        else pinnedHi |= (1 << (blockerSq - 32)) >>> 0;
      }
    }
  }
  ctx.pinned = { lo: pinnedLo >>> 0, hi: pinnedHi >>> 0 };

  // King-safe mask: attackedness evaluated with our king removed from the
  // occupancy, so sliders x-raying the king keep it attacked on the far side.
  const occWithoutKing = sq.minus(pos.board.occupied, sq.singleton(ksq));
  const usOcc = us === Color.White ? pos.board.white : pos.board.black;
  let kingLo = 0, kingHi = 0;
  sq.forEachSquare(attacks.kingAttacks(ksq), (d) => {
    if (sq.has(usOcc, d)) return;
    if (sq.isEmpty(attacks.attackersTo(pos.board, d, them, occWithoutKing))) {
      if (d < 32) kingLo |= (1 << d) >>> 0;
      else kingHi |= (1 << (d - 32)) >>> 0;
    }
  });
  ctx.kingSafe = { lo: kingLo >>> 0, hi: kingHi >>> 0 };
  return ctx;
}
/**
 * dests for one piece, given the per-position CheckContext. Legality is a
 * pure set intersection for all cases except the trap cases listed above.
 */
export function destsFast(pos: Position, from: number, piece: { color: Color; role: Role }, ctx: CheckContext): SquareSet {
  const pseudo = genPseudoDests(pos, from, piece);
  if (sq.isEmpty(pseudo)) return pseudo;
  if (piece.role === Role.King) {
    // Castling dests (detected by the shared detectCastling path — fixes the
    // defect where ANY king move to {6,2,62,58} was treated as castling while
    // ANY color held rights, corrupting the scratch board via fallback rook
    // placement) keep the exact play-and-test semantics; other king dests come
    // from the precomputed king-safe mask.
    let lo = 0, hi = 0;
    const plans = ctx.castlingPlans;
    sq.forEachSquare(pseudo, (to) => {
      // Castling dests (precomputed per-position plans — the shared
      // detectCastling semantics, without the per-move cost) keep the exact
      // play-and-test semantics; other king dests come from the precomputed
      // king-safe mask.
      const plan = planForDest(plans, to);
      if (plan) {
        if (moveLeavesKingSafe(pos, piece, from, plan.kingTo, to, false, plan, false, null)) {
          if (to < 32) lo |= (1 << to) >>> 0;
          else hi |= (1 << (to - 32)) >>> 0;
        }
      } else if (sq.has(ctx.kingSafe, to)) {
        if (to < 32) lo |= (1 << to) >>> 0;
        else hi |= (1 << (to - 32)) >>> 0;
      }
    });
    return { lo: lo >>> 0, hi: hi >>> 0 };
  }
  // Any single non-king move can never resolve a double check.
  if (ctx.doubleCheck) return { lo: 0, hi: 0 };
  let nonEp = pseudo;
  let epLegal = false;
  const epSquare = pos.epSquare;
  if (piece.role === Role.Pawn && epSquare !== null && sq.has(pseudo, epSquare)) {
    nonEp = sq.minus(pseudo, sq.singleton(epSquare));
    epLegal = moveLeavesKingSafe(pos, piece, from, epSquare, epSquare, true, null, false, null);
  }
  let result = sq.and(nonEp, ctx.checkMask);
  if (sq.has(ctx.pinned, from)) {
    const pIdx = (ctx.ksq << 6) | from;
    result = {
      lo: (result.lo & attacks.LINE_RAY_LO[pIdx]) >>> 0,
      hi: (result.hi & attacks.LINE_RAY_HI[pIdx]) >>> 0,
    };
  }
  if (epLegal && epSquare !== null) result = sq.or(result, sq.singleton(epSquare));
  return result;
}

export function dests(pos: Position, from: number): SquareSet {
  const piece = board.pieceAt(pos.board, from);
  if (!piece) return { lo: 0, hi: 0 };
  return destsFast(pos, from, piece, analyzeCheckContext(pos));
}

export function allDests(pos: Position): Map<number, SquareSet> {
  const m = new Map<number, SquareSet>();
  const ctx = analyzeCheckContext(pos);
  const isWhite = pos.turn === Color.White;
  const own = isWhite ? pos.board.white : pos.board.black;

  // 1. King
  const ksq = ctx.ksq;
  if (ksq >= 0) {
    const kingPiece = isWhite ? P_W_K : P_B_K;
    const d = destsFast(pos, ksq, kingPiece, ctx);
    if (!sq.isEmpty(d)) m.set(ksq, d);
  }
  if (ctx.doubleCheck) return m;

  const addRole = (roleBB: SquareSet, piece: { color: Color; role: Role }) => {
    sq.forEachSquare(sq.and(own, roleBB), (sqIdx) => {
      const d = destsFast(pos, sqIdx, piece, ctx);
      if (!sq.isEmpty(d)) m.set(sqIdx, d);
    });
  };

  addRole(pos.board.pawn, isWhite ? P_W_P : P_B_P);
  addRole(pos.board.knight, isWhite ? P_W_N : P_B_N);
  addRole(pos.board.bishop, isWhite ? P_W_B : P_B_B);
  addRole(pos.board.rook, isWhite ? P_W_R : P_B_R);
  addRole(pos.board.queen, isWhite ? P_W_Q : P_B_Q);
  return m;
}

export function isLegal(pos: Position, move: Move): boolean {
  // Single castling path (design D2): both the normalized (e1g1) and the
  // baseline/960 (e1h1) input forms resolve through detectCastling.
  const castling = detectCastling(pos, move.from, move.to);
  if (castling) {
    const d = dests(pos, move.from);
    // dests emits the rook-square representation (ADR-013 as amended); the
    // normalized e1g1 input form is accepted via the plan's rook square.
    return sq.has(d, castling.rookFrom);
  }
  const piece = board.pieceAt(pos.board, move.from);
  const to = move.to;
  const d = dests(pos, move.from);
  if (!sq.has(d, to)) return false;
  if (piece && piece.role === Role.Pawn) {
    const destRank = squareRank(to);
    const isPromoRank = (piece.color === Color.White && destRank === 7) || (piece.color === Color.Black && destRank === 0);
    if (isPromoRank && !move.promotion) return false;
  }
  return true;
}

// helpers for checkmate/stalemate
function hasAnyLegalMove(pos: Position): boolean {
  const ctx = analyzeCheckContext(pos);
  const ksq = ctx.ksq;
  if (ksq >= 0) {
    const kd = destsFast(pos, ksq, { color: pos.turn, role: Role.King }, ctx);
    if (!sq.isEmpty(kd)) return true;
  }
  if (ctx.doubleCheck) return false;

  const own = pos.turn === Color.White ? pos.board.white : pos.board.black;
  let ownLo = own.lo >>> 0, ownHi = own.hi >>> 0;
  while (ownLo !== 0 || ownHi !== 0) {
    let from: number;
    if (ownLo !== 0) {
      const lsb = (ownLo & -ownLo) >>> 0;
      from = Math.clz32(lsb) ^ 31;
      ownLo = (ownLo ^ lsb) >>> 0;
    } else {
      const lsb = (ownHi & -ownHi) >>> 0;
      from = 32 + (Math.clz32(lsb) ^ 31);
      ownHi = (ownHi ^ lsb) >>> 0;
    }
    if (from === ksq) continue;
    const piece = board.pieceAt(pos.board, from);
    if (!piece) continue;
    const d = destsFast(pos, from, piece, ctx);
    if (!sq.isEmpty(d)) return true;
  }
  return false;
}

export function isCheckmate(pos: Position): boolean {
  return isCheck(pos) && !hasAnyLegalMove(pos);
}
export function isStalemate(pos: Position): boolean {
  return !isCheck(pos) && !hasAnyLegalMove(pos);
}

// ---------- perft ----------
export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  if (depth === 1) {
    return countLegalMoves(pos);
  }
  let nodes = 0;
  const moves = genLegalMoves(pos);
  for (const m of moves) {
    const next = makeMove(pos, m);
    nodes += perft(next, depth - 1);
  }
  return nodes;
}

export class MoveCounter {
  count = 0;
  add(set: SquareSet): void {
    this.count += sq.popcount(set);
  }
  addPawns(legal: SquareSet, isWhite: boolean): void {
    const total = sq.popcount(legal);
    const promos = isWhite
      ? sq.popcount({ lo: 0, hi: (legal.hi & 0xff000000) >>> 0 })
      : sq.popcount({ lo: (legal.lo & 0x000000ff) >>> 0, hi: 0 });
    this.count += total + promos * 3;
  }
  reset(): void {
    this.count = 0;
  }
}

export function countLegalMoves(pos: Position): number {
  const ctx = analyzeCheckContext(pos);
  const us = pos.turn;
  const isWhite = us === Color.White;
  const own = isWhite ? pos.board.white : pos.board.black;
  let count = 0;

  // 1. King
  const ksq = ctx.ksq;
  if (ksq >= 0) {
    const kingPiece = isWhite ? P_W_K : P_B_K;
    count += sq.popcount(destsFast(pos, ksq, kingPiece, ctx));
  }
  if (ctx.doubleCheck) return count;

  // 2. Pawns (bulk popcount without inner destination loops)
  const pawnPiece = isWhite ? P_W_P : P_B_P;
  let pLo = (own.lo & pos.board.pawn.lo) >>> 0;
  let pHi = (own.hi & pos.board.pawn.hi) >>> 0;
  while (pLo !== 0) {
    const lsb = (pLo & -pLo) >>> 0;
    const from = Math.clz32(lsb) ^ 31;
    pLo = (pLo ^ lsb) >>> 0;
    const legal = destsFast(pos, from, pawnPiece, ctx);
    const total = sq.popcount(legal);
    const promos = isWhite
      ? sq.popcount({ lo: 0, hi: (legal.hi & 0xff000000) >>> 0 })
      : sq.popcount({ lo: (legal.lo & 0x000000ff) >>> 0, hi: 0 });
    count += total + promos * 3;
  }
  while (pHi !== 0) {
    const lsb = (pHi & -pHi) >>> 0;
    const from = 32 + (Math.clz32(lsb) ^ 31);
    pHi = (pHi ^ lsb) >>> 0;
    const legal = destsFast(pos, from, pawnPiece, ctx);
    const total = sq.popcount(legal);
    const promos = isWhite
      ? sq.popcount({ lo: 0, hi: (legal.hi & 0xff000000) >>> 0 })
      : sq.popcount({ lo: (legal.lo & 0x000000ff) >>> 0, hi: 0 });
    count += total + promos * 3;
  }

  // 3. Knights, Bishops, Rooks, Queens (bulk popcount on legal dests)
  const countPieces = (roleBB: SquareSet, piece: { color: Color; role: Role }) => {
    let rLo = (own.lo & roleBB.lo) >>> 0;
    let rHi = (own.hi & roleBB.hi) >>> 0;
    while (rLo !== 0) {
      const lsb = (rLo & -rLo) >>> 0;
      const from = Math.clz32(lsb) ^ 31;
      rLo = (rLo ^ lsb) >>> 0;
      count += sq.popcount(destsFast(pos, from, piece, ctx));
    }
    while (rHi !== 0) {
      const lsb = (rHi & -rHi) >>> 0;
      const from = 32 + (Math.clz32(lsb) ^ 31);
      rHi = (rHi ^ lsb) >>> 0;
      count += sq.popcount(destsFast(pos, from, piece, ctx));
    }
  };

  countPieces(pos.board.knight, isWhite ? P_W_N : P_B_N);
  countPieces(pos.board.bishop, isWhite ? P_W_B : P_B_B);
  countPieces(pos.board.rook, isWhite ? P_W_R : P_B_R);
  countPieces(pos.board.queen, isWhite ? P_W_Q : P_B_Q);

  return count;
}

export function legalMovesInto(pos: Position, out: Uint16Array | Uint32Array): number {
  let count = 0;
  const ctx = analyzeCheckContext(pos);
  const us = pos.turn;
  const isWhite = us === Color.White;
  const own = isWhite ? pos.board.white : pos.board.black;

  // 1. King
  const ksq = ctx.ksq;
  if (ksq >= 0) {
    const kingPiece = isWhite ? P_W_K : P_B_K;
    const kd = destsFast(pos, ksq, kingPiece, ctx);
    let dLo = kd.lo >>> 0, dHi = kd.hi >>> 0;
    while (dLo !== 0) {
      const lsb = (dLo & -dLo) >>> 0;
      const to = Math.clz32(lsb) ^ 31;
      dLo = (dLo ^ lsb) >>> 0;
      out[count++] = (ksq | (to << 6)) >>> 0;
    }
    while (dHi !== 0) {
      const lsb = (dHi & -dHi) >>> 0;
      const to = 32 + (Math.clz32(lsb) ^ 31);
      dHi = (dHi ^ lsb) >>> 0;
      out[count++] = (ksq | (to << 6)) >>> 0;
    }
  }

  if (ctx.doubleCheck) return count;

  // 2. Pawns
  const pawnPiece = isWhite ? P_W_P : P_B_P;
  let pLo = (own.lo & pos.board.pawn.lo) >>> 0;
  let pHi = (own.hi & pos.board.pawn.hi) >>> 0;
  const promoRank = isWhite ? 7 : 0;

  const emitPawnDests = (from: number) => {
    const legal = destsFast(pos, from, pawnPiece, ctx);
    let dLo = legal.lo >>> 0, dHi = legal.hi >>> 0;
    while (dLo !== 0) {
      const lsb = (dLo & -dLo) >>> 0;
      const to = Math.clz32(lsb) ^ 31;
      dLo = (dLo ^ lsb) >>> 0;
      if ((to >> 3) === promoRank) {
        out[count++] = (from | (to << 6) | (PROMO_QUEEN << 12)) >>> 0;
        out[count++] = (from | (to << 6) | (PROMO_ROOK << 12)) >>> 0;
        out[count++] = (from | (to << 6) | (PROMO_BISHOP << 12)) >>> 0;
        out[count++] = (from | (to << 6) | (PROMO_KNIGHT << 12)) >>> 0;
      } else {
        out[count++] = (from | (to << 6)) >>> 0;
      }
    }
    while (dHi !== 0) {
      const lsb = (dHi & -dHi) >>> 0;
      const to = 32 + (Math.clz32(lsb) ^ 31);
      dHi = (dHi ^ lsb) >>> 0;
      if ((to >> 3) === promoRank) {
        out[count++] = (from | (to << 6) | (PROMO_QUEEN << 12)) >>> 0;
        out[count++] = (from | (to << 6) | (PROMO_ROOK << 12)) >>> 0;
        out[count++] = (from | (to << 6) | (PROMO_BISHOP << 12)) >>> 0;
        out[count++] = (from | (to << 6) | (PROMO_KNIGHT << 12)) >>> 0;
      } else {
        out[count++] = (from | (to << 6)) >>> 0;
      }
    }
  };

  while (pLo !== 0) {
    const lsb = (pLo & -pLo) >>> 0;
    const from = Math.clz32(lsb) ^ 31;
    pLo = (pLo ^ lsb) >>> 0;
    emitPawnDests(from);
  }
  while (pHi !== 0) {
    const lsb = (pHi & -pHi) >>> 0;
    const from = 32 + (Math.clz32(lsb) ^ 31);
    pHi = (pHi ^ lsb) >>> 0;
    emitPawnDests(from);
  }

  // 3. Knights, Bishops, Rooks, Queens
  const emitRole = (roleBB: SquareSet, piece: { color: Color; role: Role }) => {
    let rLo = (own.lo & roleBB.lo) >>> 0;
    let rHi = (own.hi & roleBB.hi) >>> 0;
    while (rLo !== 0) {
      const lsb = (rLo & -rLo) >>> 0;
      const from = Math.clz32(lsb) ^ 31;
      rLo = (rLo ^ lsb) >>> 0;
      const d = destsFast(pos, from, piece, ctx);
      let dLo = d.lo >>> 0, dHi = d.hi >>> 0;
      while (dLo !== 0) {
        const lsbD = (dLo & -dLo) >>> 0;
        const to = Math.clz32(lsbD) ^ 31;
        dLo = (dLo ^ lsbD) >>> 0;
        out[count++] = (from | (to << 6)) >>> 0;
      }
      while (dHi !== 0) {
        const lsbD = (dHi & -dHi) >>> 0;
        const to = 32 + (Math.clz32(lsbD) ^ 31);
        dHi = (dHi ^ lsbD) >>> 0;
        out[count++] = (from | (to << 6)) >>> 0;
      }
    }
    while (rHi !== 0) {
      const lsb = (rHi & -rHi) >>> 0;
      const from = 32 + (Math.clz32(lsb) ^ 31);
      rHi = (rHi ^ lsb) >>> 0;
      const d = destsFast(pos, from, piece, ctx);
      let dLo = d.lo >>> 0, dHi = d.hi >>> 0;
      while (dLo !== 0) {
        const lsbD = (dLo & -dLo) >>> 0;
        const to = Math.clz32(lsbD) ^ 31;
        dLo = (dLo ^ lsbD) >>> 0;
        out[count++] = (from | (to << 6)) >>> 0;
      }
      while (dHi !== 0) {
        const lsbD = (dHi & -dHi) >>> 0;
        const to = 32 + (Math.clz32(lsbD) ^ 31);
        dHi = (dHi ^ lsbD) >>> 0;
        out[count++] = (from | (to << 6)) >>> 0;
      }
    }
  };

  emitRole(pos.board.knight, isWhite ? P_W_N : P_B_N);
  emitRole(pos.board.bishop, isWhite ? P_W_B : P_B_B);
  emitRole(pos.board.rook, isWhite ? P_W_R : P_B_R);
  emitRole(pos.board.queen, isWhite ? P_W_Q : P_B_Q);

  return count;
}

export function forEachLegalMove(
  pos: Position,
  fn: (from: number, to: number, promo: number) => void,
): void {
  const ctx = analyzeCheckContext(pos);
  const us = pos.turn;
  const isWhite = us === Color.White;
  const own = isWhite ? pos.board.white : pos.board.black;

  // 1. King
  const ksq = ctx.ksq;
  if (ksq >= 0) {
    const kingPiece = isWhite ? P_W_K : P_B_K;
    const kd = destsFast(pos, ksq, kingPiece, ctx);
    let dLo = kd.lo >>> 0, dHi = kd.hi >>> 0;
    while (dLo !== 0) {
      const lsb = (dLo & -dLo) >>> 0;
      const to = Math.clz32(lsb) ^ 31;
      dLo = (dLo ^ lsb) >>> 0;
      fn(ksq, to, PROMO_NONE);
    }
    while (dHi !== 0) {
      const lsb = (dHi & -dHi) >>> 0;
      const to = 32 + (Math.clz32(lsb) ^ 31);
      dHi = (dHi ^ lsb) >>> 0;
      fn(ksq, to, PROMO_NONE);
    }
  }

  if (ctx.doubleCheck) return;

  // 2. Pawns
  const pawnPiece = isWhite ? P_W_P : P_B_P;
  let pLo = (own.lo & pos.board.pawn.lo) >>> 0;
  let pHi = (own.hi & pos.board.pawn.hi) >>> 0;
  const promoRank = isWhite ? 7 : 0;

  const visitPawnDests = (from: number) => {
    const legal = destsFast(pos, from, pawnPiece, ctx);
    let dLo = legal.lo >>> 0, dHi = legal.hi >>> 0;
    while (dLo !== 0) {
      const lsb = (dLo & -dLo) >>> 0;
      const to = Math.clz32(lsb) ^ 31;
      dLo = (dLo ^ lsb) >>> 0;
      if ((to >> 3) === promoRank) {
        fn(from, to, PROMO_QUEEN);
        fn(from, to, PROMO_ROOK);
        fn(from, to, PROMO_BISHOP);
        fn(from, to, PROMO_KNIGHT);
      } else {
        fn(from, to, PROMO_NONE);
      }
    }
    while (dHi !== 0) {
      const lsb = (dHi & -dHi) >>> 0;
      const to = 32 + (Math.clz32(lsb) ^ 31);
      dHi = (dHi ^ lsb) >>> 0;
      if ((to >> 3) === promoRank) {
        fn(from, to, PROMO_QUEEN);
        fn(from, to, PROMO_ROOK);
        fn(from, to, PROMO_BISHOP);
        fn(from, to, PROMO_KNIGHT);
      } else {
        fn(from, to, PROMO_NONE);
      }
    }
  };

  while (pLo !== 0) {
    const lsb = (pLo & -pLo) >>> 0;
    const from = Math.clz32(lsb) ^ 31;
    pLo = (pLo ^ lsb) >>> 0;
    visitPawnDests(from);
  }
  while (pHi !== 0) {
    const lsb = (pHi & -pHi) >>> 0;
    const from = 32 + (Math.clz32(lsb) ^ 31);
    pHi = (pHi ^ lsb) >>> 0;
    visitPawnDests(from);
  }

  // 3. Knights, Bishops, Rooks, Queens
  const visitRole = (roleBB: SquareSet, piece: { color: Color; role: Role }) => {
    let rLo = (own.lo & roleBB.lo) >>> 0;
    let rHi = (own.hi & roleBB.hi) >>> 0;
    while (rLo !== 0) {
      const lsb = (rLo & -rLo) >>> 0;
      const from = Math.clz32(lsb) ^ 31;
      rLo = (rLo ^ lsb) >>> 0;
      const d = destsFast(pos, from, piece, ctx);
      let dLo = d.lo >>> 0, dHi = d.hi >>> 0;
      while (dLo !== 0) {
        const lsbD = (dLo & -dLo) >>> 0;
        const to = Math.clz32(lsbD) ^ 31;
        dLo = (dLo ^ lsbD) >>> 0;
        fn(from, to, PROMO_NONE);
      }
      while (dHi !== 0) {
        const lsbD = (dHi & -dHi) >>> 0;
        const to = 32 + (Math.clz32(lsbD) ^ 31);
        dHi = (dHi ^ lsbD) >>> 0;
        fn(from, to, PROMO_NONE);
      }
    }
    while (rHi !== 0) {
      const lsb = (rHi & -rHi) >>> 0;
      const from = 32 + (Math.clz32(lsb) ^ 31);
      rHi = (rHi ^ lsb) >>> 0;
      const d = destsFast(pos, from, piece, ctx);
      let dLo = d.lo >>> 0, dHi = d.hi >>> 0;
      while (dLo !== 0) {
        const lsbD = (dLo & -dLo) >>> 0;
        const to = Math.clz32(lsbD) ^ 31;
        dLo = (dLo ^ lsbD) >>> 0;
        fn(from, to, PROMO_NONE);
      }
      while (dHi !== 0) {
        const lsbD = (dHi & -dHi) >>> 0;
        const to = 32 + (Math.clz32(lsbD) ^ 31);
        dHi = (dHi ^ lsbD) >>> 0;
        fn(from, to, PROMO_NONE);
      }
    }
  };

  visitRole(pos.board.knight, isWhite ? P_W_N : P_B_N);
  visitRole(pos.board.bishop, isWhite ? P_W_B : P_B_B);
  visitRole(pos.board.rook, isWhite ? P_W_R : P_B_R);
  visitRole(pos.board.queen, isWhite ? P_W_Q : P_B_Q);
}

// Promotion pieces in generation order (hoisted module constant — the old
// per-call array literal allocated on every promotion move in the hot loop).
const PROMO_ROLES: Role[] = [Role.Queen, Role.Rook, Role.Bishop, Role.Knight];

function genLegalMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  const ctx = analyzeCheckContext(pos);
  const us = pos.turn;
  const isWhite = us === Color.White;
  const own = isWhite ? pos.board.white : pos.board.black;
  const plans = ctx.castlingPlans;

  // 1. King
  const ksq = ctx.ksq;
  if (ksq >= 0) {
    const kingPiece = isWhite ? P_W_K : P_B_K;
    sq.forEachSquare(destsFast(pos, ksq, kingPiece, ctx), (to) => {
      const isCastling = plans.length > 0 && planForDest(plans, to) !== null;
      moves.push({ from: ksq, to, promotion: null, isEnPassant: false, isCastling, isPromotion: false });
    });
  }

  if (ctx.doubleCheck) return moves;

  // 2. Pawns
  const pawnPiece = isWhite ? P_W_P : P_B_P;
  sq.forEachSquare(sq.and(own, pos.board.pawn), (from) => {
    const legal = destsFast(pos, from, pawnPiece, ctx);
    sq.forEachSquare(legal, (to) => {
      const destRank = to >> 3;
      if ((isWhite && destRank === 7) || (!isWhite && destRank === 0)) {
        for (const promo of PROMO_ROLES) {
          moves.push({ from, to, promotion: promo, isPromotion: true, isEnPassant: false, isCastling: false });
        }
      } else {
        let isEnPassant = false;
        if (pos.epSquare !== null && to === pos.epSquare) {
          const fileDiff = Math.abs((to & 7) - (from & 7));
          const dir = isWhite ? 1 : -1;
          if (fileDiff === 1 && destRank - (from >> 3) === dir) isEnPassant = true;
        }
        moves.push({ from, to, promotion: null, isEnPassant, isCastling: false, isPromotion: false });
      }
    });
  });

  // 3. Knights, Bishops, Rooks, Queens
  const addPieceMoves = (roleBB: SquareSet, piece: { color: Color; role: Role }) => {
    sq.forEachSquare(sq.and(own, roleBB), (from) => {
      sq.forEachSquare(destsFast(pos, from, piece, ctx), (to) => {
        moves.push({ from, to, promotion: null, isEnPassant: false, isCastling: false, isPromotion: false });
      });
    });
  };

  addPieceMoves(pos.board.knight, isWhite ? P_W_N : P_B_N);
  addPieceMoves(pos.board.bishop, isWhite ? P_W_B : P_B_B);
  addPieceMoves(pos.board.rook, isWhite ? P_W_R : P_B_R);
  addPieceMoves(pos.board.queen, isWhite ? P_W_Q : P_B_Q);

  return moves;
}


// Promotion pieces in generation order (hoisted module constant — the old
// per-call array literal allocated on every promotion move in the hot loop).
export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Deterministic unique 2-char node id (same alphabet/contract the
// workstation's `createUniqueMoveNodeId` relies on — mirrors chesstree.ts).
const TREE_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function nextTreeNodeId(siblings: TreeNode[]): string {
  const used = new Set(siblings.map((x) => x.id));
  for (const first of TREE_ID_ALPHABET) {
    for (const second of TREE_ID_ALPHABET) {
      const id = first + second;
      if (!used.has(id)) return id;
    }
  }
  return "zz";
}

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
  0: "p", 1: "n", 2: "b", 3: "r", 4: "q", 5: "k",
};

const PROMO_ORDER = [4, 3, 2, 1]; // Role.Queen, Role.Rook, Role.Bishop, Role.Knight

function colorName(turn: Color): ColorName {
  return turn === Color.White ? "w" : "b";
}

export type Undo = {
  readonly before: Position;
  readonly after: Position;
  readonly move: Move;
  readonly san: string;
  readonly prev_checkers?: SquareSet;
  readonly prev_zobrist?: ZobristKey;
};

export type HistoryEntry = Undo;

/** Expands pawn back-rank destinations into the four promotions. */
function buildMoves(pos: Position, role: number, from: number, to: number): Move[] {
  const toRank = to >> 3;
  if (role === 0 && (toRank === 7 || toRank === 0)) {
    return PROMO_ORDER.map((promotion) => ({
      from,
      to,
      promotion: promotion as Role,
      isPromotion: true,
      isEnPassant: false,
      isCastling: false,
    }));
  }
  const isEp =
    role === 0 &&
    pos.epSquare !== null &&
    to === pos.epSquare &&
    (to & 7) !== (from & 7);
  const isCastling = role === 5 ? detectCastling(pos, from, to) !== null : false;
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
    if (!p || p.role !== 0) continue;
    if (sq.has(set, ep)) return true;
  }
  return false;
}

/**
 * Unified root `Chess` (design D1): the chess.js-ergonomic mutable façade
 * over the immutable engine core, extended with the high-performance
 * bitboard surface, zero-alloc Zobrist hashing and 16-bit packed moves2, and
 * native tree navigation. Lives at the ROOT entrypoint so the tree-shakeable
 * `turbochess/core` graph stays free of FEN/PGN/tree facade code.
 */
export class Chess {
  #startFen: string;
  #history: HistoryEntry[] = [];

  #pos: Position;

  constructor(fen: string | Position = INITIAL_FEN) {
    if (typeof fen === "string") {
      const r = parseFen(fen);
      if (!r.ok) throw new Error(`Invalid FEN: ${fen}`);
      this.#pos = r.value;
    } else {
      this.#pos = fen;
    }
    this.#startFen = this.#fenOf(this.#pos);
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
   * `0-0`/`O-O`), as UCI (`e2e4`, `e7e8q`), or as a {from,to,promotion?}
   * object. Returns the verbose move, or null when the move is illegal.
   */
  move(input: string | { from: string; to: string; promotion?: string }): VerboseMove | null {
    const pos = this.#pos;
    let mv: Move | null = null;
    if (typeof input === "string") {
      const sanRes = parseSan(input, pos);
      if (sanRes.ok) {
        mv = sanRes.value;
      } else {
        const uciRes = parseUci(input);
        if (uciRes.ok && isLegal(pos, uciRes.value)) mv = uciRes.value;
      }
    } else {
      const from = parseSquare(input.from);
      const to = parseSquare(input.to);
      if (from !== undefined && to !== undefined) {
        const piece = pieceAt(pos.board, from);
        const promotion = input.promotion
          ? ({ q: 4, r: 3, b: 2, n: 1 } as Record<string, Role>)[input.promotion.toLowerCase()]
          : undefined;
        for (const cand of buildMoves(pos, piece ? piece.role : -1, from, to)) {
          if (cand.promotion !== null && cand.promotion !== undefined && promotion !== undefined && cand.promotion !== promotion) continue;
          if (isLegal(pos, cand)) { mv = cand; break; }
        }
      }
    }
    if (!mv) return null;
    const san = makeSan(mv, pos);
    const after = makeMove(pos, mv);
    this.#pos = after;
    this.#history.push({
      before: pos,
      after,
      move: mv,
      san,
      prev_checkers: pos.checkers,
      prev_zobrist: pos.zobristLo !== undefined && pos.zobristHi !== undefined ? { lo: pos.zobristLo, hi: pos.zobristHi } : undefined,
    });
    return this.#describe(pos, mv, after, san);
  }

  /**
   * Legal moves. Default: SAN strings. `{ verbose: true }`: VerboseMove[]
   * (shape-compatible with the chessjs consumer baseline). `{ square }`
   * filters by origin square ("e2").
   */
  moves(options: { square?: string; verbose: true }): VerboseMove[];
  moves(options?: { square?: string; verbose?: false }): string[];
  moves(options?: { square?: string; verbose?: boolean }): string[] | VerboseMove[] {
    const pos = this.#pos;
    const out: (string | VerboseMove)[] = [];
    const emit = (from: number, set: { lo: number; hi: number }) => {
      const piece = pieceAt(pos.board, from);
      if (!piece) return;
      sq.forEachSquare(set, (to) => {
        for (const mv of buildMoves(pos, piece.role, from, to)) {
          const san = makeSan(mv, pos);
          if (options?.verbose) out.push(this.#describe(pos, mv, makeMove(pos, mv), san));
          else out.push(san);
        }
      });
    };
    if (options?.square !== undefined) {
      const sqIdx = parseSquare(options.square);
      if (sqIdx === undefined) return [];
      emit(sqIdx, dests(pos, sqIdx));
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

  isCheck(): boolean { return isCheck(this.#pos); }
  inCheck(): boolean { return isCheck(this.#pos); }
  isCheckmate(): boolean { return isCheckmate(this.#pos); }
  isStalemate(): boolean { return isStalemate(this.#pos); }

  /** Draw by insufficient material, the fifty-move rule, or threefold repetition. */
  isDraw(): boolean {
    if (isInsufficientMaterial(this.#pos)) return true;
    if (isFiftyMoveDraw(this.#pos)) return true;
    if (isThreefoldRepetition(this.#positions())) return true;
    return false;
  }

  /** Draw by the fifty-move rule. */
  isDrawByFiftyMoves(): boolean { return isFiftyMoveDraw(this.#pos); }

  /** Draw by insufficient material. */
  isInsufficientMaterial(): boolean { return isInsufficientMaterial(this.#pos); }

  /** Draw by threefold repetition over the game's position history. */
  isThreefoldRepetition(): boolean { return isThreefoldRepetition(this.#positions()); }

  /** Game over: checkmate, stalemate, or draw. */
  isGameOver(): boolean { return this.isCheckmate() || this.isStalemate() || this.isDraw(); }

  /** Piece on a square ("e2"), or undefined. */
  get(square: string): { type: PieceChar; color: ColorName } | undefined {
    const sqIdx = parseSquare(square);
    if (sqIdx === undefined) return undefined;
    const p = pieceAt(this.#pos.board, sqIdx);
    if (!p) return undefined;
    return { type: ROLE_CHARS[p.role], color: colorName(p.color) };
  }

  /** 8x8 board, rank 8 first; null on empty squares. */
  board(): ({ square: string; type: PieceChar; color: ColorName } | null)[][] {
    const rows: ({ square: string; type: PieceChar; color: ColorName } | null)[][] = [];
    for (let rank = 7; rank >= 0; rank--) {
      const row: ({ square: string; type: PieceChar; color: ColorName } | null)[] = [];
      for (let file = 0; file < 8; file++) {
        const sqIdx = rank * 8 + file;
        const p = pieceAt(this.#pos.board, sqIdx);
        row.push(p ? { square: squareName(sqIdx), type: ROLE_CHARS[p.role], color: colorName(p.color) } : null);
      }
      rows.push(row);
    }
    return rows;
  }

  /** "light" | "dark" square color ("a1" is light, like the consumer baseline). */
  squareColor(square: string): "light" | "dark" | undefined {
    const sqIdx = parseSquare(square);
    if (sqIdx === undefined) return undefined;
    return (((sqIdx & 7) + (sqIdx >> 3)) & 1) === 0 ? "light" : "dark";
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

  // ---- unified high-performance surface (design D1) ----

  /** Legal destinations for one square ("e2" or index). */
  dests(square: string | number): SquareSet {
    const sqIdx = typeof square === "number" ? square : parseSquare(square);
    if (sqIdx === undefined) return { lo: 0, hi: 0 };
    return dests(this.#pos, sqIdx);
  }

  /** Legal destinations for every piece of the side to move. */
  allDests(): Map<number, SquareSet> { return allDests(this.#pos); }

  /** True when `move` is legal in the current position. */
  isLegal(move: Move): boolean { return isLegal(this.#pos, move); }

  /** Genuine recursive perft node count (no shortcuts). */
  perft(depth: number): number { return perft(this.#pos, depth); }

  /** Applies an engine move in place (immutable core stays pure underneath). */
  play(move: Move): this {
    const before = this.#pos;
    const san = makeSan(move, before);
    const after = makeMove(before, move);
    this.#pos = after;
    this.#history.push({
      before,
      after,
      move,
      san,
      prev_checkers: before.checkers,
      prev_zobrist: before.zobristLo !== undefined && before.zobristHi !== undefined ? { lo: before.zobristLo, hi: before.zobristHi } : undefined,
    });
    return this;
  }

  /** Current 64-bit Zobrist key (zero-BigInt {lo, hi} halves). */
  zobrist(): ZobristKey {
    if (this.#pos.zobristLo !== undefined && this.#pos.zobristHi !== undefined) {
      return { lo: this.#pos.zobristLo >>> 0, hi: this.#pos.zobristHi >>> 0 };
    }
    return calculateZobrist(this.#pos);
  }

  /** Current Zobrist key as 16 zero-padded hex digits (hi first). */
  zobristHex(): string { return zobristHex(this.zobrist()); }

  /** Packs the game's move history into a 16-bit moves2 stream. */
  toMoves2(): Uint16Array {
    const words = new Uint16Array(this.#history.length);
    for (let i = 0; i < this.#history.length; i++) words[i] = packOf(this.#history[i].move);
    return words;
  }

  /** Replays a moves2 stream (Uint16Array or little-endian Uint8Array) in place. */
  loadMoves2(buffer: Uint16Array | Uint8Array, startFen: string = INITIAL_FEN): void {
    this.load(startFen);
    this.#startFen = startFen;
    for (const mv of packedToMoves(buffer)) {
      if (!isLegal(this.#pos, mv)) throw new Error(`moves2 replay: illegal move ${mv.from}->${mv.to}`);
      this.play(mv);
    }
  }

  /** Builds a Chess game from a moves2 stream (startpos, or a custom start FEN). */
  static fromMoves2(buffer: Uint16Array | Uint8Array, startFen: string = INITIAL_FEN): Chess {
    const game = new Chess(startFen);
    game.loadMoves2(buffer, startFen);
    return game;
  }

  /** Wraps an arbitrary engine Setup. */
  static fromSetup(setup: Setup): Chess {
    return new Chess(setup as Position);
  }

  /** Fresh game from the standard initial position. */
  static default(): Chess {
    return new Chess(INITIAL_FEN);
  }

  /** FEN the game started from (for tree roots / PGN headers). */
  get startFen(): string { return this.#startFen; }

  /** Live engine position (read-only view over the internal state). */
  get pos(): Position { return this.#pos; }
  get _pos(): Position { return this.#pos; }

  /** Internal history log (read-only view; used by toTree). */
  get historyEntries(): readonly HistoryEntry[] { return this.#history; }

  /**
   * Exports the live game as a chesstree wrapper: recursive variation
   * navigation (`nodeAtPath`, `getNodeList`, `addNode`, `setCommentAt`, …)
   * and full recursive PGN rendering via `tree.pgn()`.
   */
  toTree(): TreeWrapper {
    const root: TreeNode = { id: "", ply: 0, fen: this.#startFen, uci: "", children: [] };
    let ply = 0;
    let node = root;
    for (const h of this.#history) {
      const child: TreeNode = {
        id: nextTreeNodeId(node.children),
        ply: ++ply,
        san: h.san,
        fen: makeFen(h.after),
        uci: makeUci(h.move),
        children: [],
      };
      node.children.push(child);
      node = child;
    }
    return buildTreeWrapper(root);
  }

  /**
   * Imports a PGN (headers + recursive variations), loads the mainline into
   * this game, and returns the analysis tree wrapper.
   */
  loadTree(pgn: string): TreeWrapper {
    const data = pgnImportData(pgn);
    const root = data.treeParts[0];
    this.reset();
    if (root && root.fen && root.fen !== INITIAL_FEN) {
      const r = parseFen(root.fen);
      if (r.ok) this.load(root.fen);
    }
    let node: TreeNode | undefined = root?.children[0];
    while (node) {
      if (node.san) this.move(node.san);
      node = node.children[0];
    }
    return buildTreeWrapper(root ?? { id: "", ply: 0, fen: INITIAL_FEN, uci: "", children: [] });
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
      (piece.role === 0 && pos.epSquare !== null && mv.to === pos.epSquare && (mv.to & 7) !== (mv.from & 7));
    const isCapture = !!target && target.color !== pos.turn && !isEp;
    const isDoublePush = piece.role === 0 && Math.abs((mv.to >> 3) - (mv.from >> 3)) === 2;
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
    const lan = landingSq !== null ? squareName(mv.from) + squareName(landingSq) : makeUci(mv);
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
