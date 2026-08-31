// src/baseline/chess.ts — baseline-exact Position/Chess/Castles classes (ADR-014).
// The facade keeps the baseline mutable-instance semantics (play() mutates the
// position, exactly like baseline) while delegating all rules to the immutable
// purechess engine. Caller-provided values (Setup, Move) are never mutated.
import { Result } from "@badrap/result";
import * as engine from "../chess.js";
import * as engineAttacks from "../attacks.js";
import type { Position as EnginePosition } from "../types.js";
import { Board, boardEquals } from "./board.js";
import { SquareSet } from "./squareSet.js";
import type { Setup } from "./setup.js";
import { moveFromFacade, setupToEngine, boardToEngine } from "./convert.js";
import { isDrop } from "./types.js";
import type { ByCastlingSide, ByColor, CastlingSide, Color, Move, Rules, Square } from "./types.js";
import { makeFen as makeFenInternal, parseFen as parseFenInternal } from "./fen.js";
import { INITIAL_FEN } from "./fenInternal.js";

export enum IllegalSetup {
  Empty = "ERR_EMPTY",
  OppositeCheck = "ERR_OPPOSITE_CHECK",
  PawnsOnBackrank = "ERR_PAWNS_ON_BACKRANK",
  Kings = "ERR_KINGS",
  Variant = "ERR_VARIANT",
}

export class PositionError extends Error {}

export interface Context {
  king: Square | undefined;
  blockers: SquareSet;
  checkers: SquareSet;
  variantEnd: boolean;
  mustCapture: boolean;
}

const between = (a: number, b: number): SquareSet => {
  const r = engineAttacks.between(a, b);
  return new SquareSet(r.lo, r.hi);
};

const toFacadeSet = (s: { lo: number; hi: number }): SquareSet => new SquareSet(s.lo | 0, s.hi | 0);

export class Castles {
  castlingRights: SquareSet;
  path: ByColor<ByCastlingSide<SquareSet>>;
  rook: ByColor<ByCastlingSide<Square | undefined>>;

  private constructor(castlingRights: SquareSet) {
    this.castlingRights = castlingRights;
    this.path = {
      white: { a: SquareSet.empty(), h: SquareSet.empty() },
      black: { a: SquareSet.empty(), h: SquareSet.empty() },
    };
    this.rook = {
      white: { a: undefined, h: undefined },
      black: { a: undefined, h: undefined },
    };
  }

  static default(): Castles {
    const c = new Castles(new SquareSet(0x81, 0x81000000)); // a1, h1, a8, h8
    c.rook = { white: { a: 0, h: 7 }, black: { a: 56, h: 63 } };
    c.path = {
      white: { a: between(4, 0), h: between(4, 7) }, // b1c1d1 / f1g1
      black: { a: between(60, 56), h: between(60, 63) }, // b8c8d8 / f8g8
    };
    return c;
  }

  static empty(): Castles {
    return new Castles(SquareSet.empty());
  }

  clone(): Castles {
    const c = new Castles(this.castlingRights);
    c.rook = {
      white: { a: this.rook.white.a, h: this.rook.white.h },
      black: { a: this.rook.black.a, h: this.rook.black.h },
    };
    c.path = {
      white: { a: this.path.white.a, h: this.path.white.h },
      black: { a: this.path.black.a, h: this.path.black.h },
    };
    return c;
  }

  static fromSetup(setup: Setup): Castles {
    const c = new Castles(setup.castlingRights);
    for (const color of ["white", "black"] as Color[]) {
      const king = setup.board.kingOf(color);
      for (const square of setup.castlingRights) {
        const piece = setup.board.get(square);
        if (!piece || piece.role !== "rook" || piece.color !== color) continue;
        const side: CastlingSide = king !== undefined && (square & 7) > (king & 7) ? "h" : "a";
        c.rook[color][side] = square;
        c.path[color][side] = king === undefined ? SquareSet.empty() : between(king, square);
      }
    }
    return c;
  }

  discardRook(square: Square): void {
    this.castlingRights = this.castlingRights.without(square);
    for (const color of ["white", "black"] as Color[]) {
      for (const side of ["a", "h"] as CastlingSide[]) {
        if (this.rook[color][side] === square) this.rook[color][side] = undefined;
      }
    }
  }

  discardColor(color: Color): void {
    for (const side of ["a", "h"] as CastlingSide[]) {
      const rook = this.rook[color][side];
      if (rook !== undefined) this.castlingRights = this.castlingRights.without(rook);
      this.rook[color][side] = undefined;
      this.path[color][side] = SquareSet.empty();
    }
  }
}

export abstract class Position {
  readonly rules: Rules;
  board: Board;
  pockets: undefined;
  turn: Color;
  castles: Castles;
  epSquare: Square | undefined;
  remainingChecks: undefined;
  halfmoves: number;
  fullmoves: number;

  private _epos: EnginePosition | null = null;

  protected constructor(rules: Rules) {
    this.rules = rules;
    this.board = Board.empty();
    this.pockets = undefined;
    this.turn = "white";
    this.castles = Castles.empty();
    this.epSquare = undefined;
    this.remainingChecks = undefined;
    this.halfmoves = 0;
    this.fullmoves = 1;
  }

  reset(): void {
    const d = Chess.default();
    this.board = d.board.clone();
    this.turn = d.turn;
    this.castles = d.castles.clone();
    this.epSquare = d.epSquare;
    this.halfmoves = d.halfmoves;
    this.fullmoves = d.fullmoves;
    this.invalidate();
  }

  protected setupUnchecked(setup: Setup): void {
    this.board = setup.board.clone();
    this.turn = setup.turn;
    this.castles = Castles.fromSetup(setup);
    this.epSquare = setup.epSquare;
    this.halfmoves = setup.halfmoves;
    this.fullmoves = setup.fullmoves;
    this.invalidate();
  }

  /** Lazily rebuilt engine position (rebuilt after every mutation). Built
   * directly from the raw fields — NOT via toSetup(), whose legalEpSquare
   * filter would recurse. The raw ep square is what baseline keeps on the
   * position too; the legal-ep filter only applies to toSetup(). */
  private epos(): EnginePosition {
    if (this._epos === null) {
      const sets = { white: new Set<number>(), black: new Set<number>() };
      for (const s of this.castles.castlingRights) {
        const p = this.board.get(s);
        if (p && p.role === "rook") (p.color === "white" ? sets.white : sets.black).add(s);
      }
      this._epos = setupToEngine(this.toSetupRaw());
    }
    return this._epos;
  }

  /** baseline keeps the RAW ep square on the position (toSetup() applies the
   * legalEpSquare filter); this internal view mirrors that. */
  private toSetupRaw(): Setup {
    return {
      board: this.board,
      pockets: undefined,
      turn: this.turn,
      castlingRights: this.castles.castlingRights,
      epSquare: this.epSquare,
      remainingChecks: undefined,
      halfmoves: this.halfmoves,
      fullmoves: this.fullmoves,
    };
  }
  private invalidate(): void {
    this._epos = null;
  }

  toSetup(): Setup {
    return {
      board: this.board.clone(),
      pockets: undefined,
      turn: this.turn,
      castlingRights: this.castles.castlingRights,
      epSquare: this.legalEpSquare(),
      remainingChecks: undefined,
      halfmoves: Math.min(this.halfmoves, 150),
      fullmoves: Math.min(Math.max(this.fullmoves, 1), 9999),
    };
  }

  /** baseline legalEpSquare: the ep square survives into a Setup only when a
   * legal ep capture exists. */
  private legalEpSquare(): Square | undefined {
    if (this.epSquare === undefined) return undefined;
    const epos = this.epos();
    const them: import("./types.js").Color = this.turn === "white" ? "black" : "white";
    const themColor = them === "white" ? (0 as never) : (1 as never);
    const attackers = engineAttacks.pawnAttacks(themColor, this.epSquare);
    const ourPawns = this.board.pieces(this.turn, "pawn");
    const candidates = toFacadeSet({ lo: attackers.lo & ourPawns.lo, hi: attackers.hi & ourPawns.hi });
    for (const from of candidates) {
      const d = engine.dests(epos, from);
      const has = this.epSquare < 32
        ? ((d.lo >>> this.epSquare) & 1) === 1
        : ((d.hi >>> (this.epSquare - 32)) & 1) === 1;
      if (has) return this.epSquare;
    }
    return undefined;
  }

  kingAttackers(square: Square, attacker: Color, occupied: SquareSet): SquareSet {
    const r = engineAttacks.attackersTo(
      boardToEngine(this.board),
      square,
      attacker === "white" ? (0 as never) : (1 as never),
      { lo: occupied.lo >>> 0, hi: occupied.hi >>> 0 },
    );
    return toFacadeSet(r);
  }

  ctx(): Context {
    const us = this.turn;
    const them: Color = us === "white" ? "black" : "white";
    const king = this.board.kingOf(us);
    const occupied = this.board.occupied;
    let checkers = SquareSet.empty();
    let blockers = SquareSet.empty();
    if (king !== undefined) {
      checkers = this.kingAttackers(king, them, occupied);
      // pinned own pieces: enemy sliders x-raying our king with exactly one
      // blocker between (same definition as the engine's pin analysis)
      const occWithoutKing = occupied.without(king);
      const themRQ = this.board.rooksAndQueens().intersect(this.board[them]);
      const themBQ = this.board.bishopsAndQueens().intersect(this.board[them]);
      const snipers = toFacadeSet(engineAttacks.rookAttacks(king, occWithoutKing))
        .intersect(themRQ)
        .union(toFacadeSet(engineAttacks.bishopAttacks(king, occWithoutKing)).intersect(themBQ));
      for (const sniper of snipers) {
        const btwn = between(king, sniper).intersect(occupied);
        if (btwn.size() === 1 && btwn.intersect(this.board[us]).nonEmpty()) {
          blockers = blockers.union(btwn);
        }
      }
    }
    return { king, blockers, checkers, variantEnd: false, mustCapture: false };
  }

  clone(): Position {
    const c = Object.create(Object.getPrototypeOf(this)) as Position;
    this.copyInto(c);
    return c;
  }

  protected copyInto(target: Position): void {
    target.board = this.board.clone();
    target.turn = this.turn;
    target.castles = this.castles.clone();
    target.epSquare = this.epSquare;
    target.halfmoves = this.halfmoves;
    target.fullmoves = this.fullmoves;
    target.dropCache();
  }

  /** Internal: drop the cached engine position after any mutation. */
  dropCache(): void {
    (this as unknown as { _epos: EnginePosition | null })._epos = null;
  }

  /** Internal: engine position for sibling facade modules (san/fen/debug). */
  eposInternal(): EnginePosition {
    return this.epos();
  }

  dropDests(_ctx?: Context): SquareSet {
    return SquareSet.empty();
  }

  dests(square: Square, _ctx?: Context): SquareSet {
    return toFacadeSet(engine.dests(this.epos(), square));
  }

  isVariantEnd(): boolean {
    return false;
  }

  variantOutcome(_ctx?: Context): { winner: Color | undefined } | undefined {
    return undefined;
  }

  hasInsufficientMaterial(color: Color): boolean {
    const own = (r: "pawn" | "knight" | "bishop" | "rook" | "queen" | "king") => this.board.pieces(color, r);
    if (own("pawn").nonEmpty() || own("rook").nonEmpty() || own("queen").nonEmpty()) return false;
    const knights = own("knight");
    const bishops = own("bishop");
    if (knights.isEmpty() && bishops.isEmpty()) return true; // bare king
    if (knights.size() + bishops.size() === 1) return true; // single minor
    if (bishops.isEmpty()) return false; // knights can mate with cooperation
    // only bishops: insufficient unless they cover both square colors
    let dark = false;
    let light = false;
    for (const s of bishops) {
      if (((s >> 3) + (s & 7)) % 2 === 1) dark = true;
      else light = true;
    }
    return !(dark && light);
  }

  isInsufficientMaterial(): boolean {
    return engine.isInsufficientMaterial(this.epos());
  }

  hasDests(_ctx?: Context): boolean {
    const epos = this.epos();
    for (const [s, piece] of this.board) {
      if (piece.color !== this.turn) continue;
      const d = engine.dests(epos, s);
      if (d.lo !== 0 || d.hi !== 0) return true;
    }
    return false;
  }

  isLegal(move: Move, _ctx?: Context): boolean {
    if (isDrop(move)) return false;
    const piece = this.board.get(move.from);
    if (!piece || piece.color !== this.turn) return false;
    if (!this.dests(move.from).has(move.to)) return false;
    if (piece.role === "pawn" && (move.to >= 56 || move.to < 8) && !move.promotion) return false;
    return true;
  }

  isCheck(): boolean {
    return engine.isCheck(this.epos());
  }

  isEnd(_ctx?: Context): boolean {
    return this.isVariantEnd() || this.isCheckmate() || this.isStalemate();
  }

  isCheckmate(_ctx?: Context): boolean {
    return engine.isCheckmate(this.epos());
  }

  isStalemate(_ctx?: Context): boolean {
    return engine.isStalemate(this.epos());
  }

  outcome(_ctx?: Context): { winner: Color | undefined } | undefined {
    if (this.isVariantEnd()) return this.variantOutcome();
    if (this.isCheckmate()) return { winner: this.turn === "white" ? "black" : "white" };
    if (this.isStalemate() || this.isInsufficientMaterial()) return { winner: undefined };
    return undefined;
  }

  allDests(_ctx?: Context): Map<Square, SquareSet> {
    // baseline-exact: one entry per OWN piece, including empty dests for
    // pieces with no legal moves (e.g. the black backrank after 1.d4).
    const epos = this.epos();
    const out = new Map<Square, SquareSet>();
    for (const [s, piece] of this.board) {
      if (piece.color !== this.turn) continue;
      out.set(s, toFacadeSet(engine.dests(epos, s)));
    }
    return out;
  }

  play(move: Move): void {
    if (isDrop(move)) throw new Error("Drops are not supported in standard chess");
    const epos = this.epos();
    const emove = moveFromFacade(epos, move);
    const next = engine.makeMove(epos, emove);
    this.board._b = next.board;
    this.turn = next.turn === (0 as never) ? "white" : "black";
    this.castles = this.castlesFromSets(next.castling);
    this.epSquare = next.epSquare === null ? undefined : next.epSquare;
    this.halfmoves = next.halfmoves ?? 0;
    this.fullmoves = next.fullmoves ?? 1;
    this.invalidate();
  }

  private castlesFromSets(castling: {
    white: ReadonlySet<number>;
    black: ReadonlySet<number>;
    whiteKing: boolean;
    whiteQueen: boolean;
    blackKing: boolean;
    blackQueen: boolean;
  }): Castles {
    const rights = new SquareSet(
      [...castling.white].reduce((a, s) => a | (1 << s), 0) >>> 0,
      [...castling.black].reduce((a, s) => a | (1 << (s - 32)), 0) >>> 0,
    );
    return Castles.fromSetup({
      board: this.board,
      pockets: undefined,
      turn: this.turn,
      castlingRights: rights,
      epSquare: undefined,
      remainingChecks: undefined,
      halfmoves: 0,
      fullmoves: 1,
    });
  }
}

export class Chess extends Position {
  private constructor() {
    super("chess");
  }

  static default(): Chess {
    const parsed = parseFenInternal(INITIAL_FEN);
    if (parsed.isErr) throw new PositionError(parsed.error.message);
    return Chess.fromSetupUnchecked(parsed.unwrap());
  }

  static fromSetup(setup: Setup): Result<Chess, PositionError> {
    const pos = new Chess();
    pos.setupUnchecked(setup);
    // validate via the engine's FEN round-trip (single source of truth for
    // the position legality rules: kings, pawns on backrank, opposite check)
    const r = parseFenInternal(makeFenInternal(pos.toSetup()));
    if (r.isErr) return Result.err(new PositionError(r.error.message));
    return Result.ok(pos);
  }

  private static fromSetupUnchecked(setup: Setup): Chess {
    const pos = new Chess();
    pos.setupUnchecked(setup);
    return pos;
  }

  clone(): Chess {
    const c = Object.create(Object.getPrototypeOf(this)) as Chess;
    this.copyInto(c);
    return c;
  }
}

export const pseudoDests = (pos: Position, square: Square, _ctx: Context): SquareSet => pos.dests(square);

export const equalsIgnoreMoves = (left: Position, right: Position): boolean =>
  boardEquals(left.board, right.board) &&
  left.turn === right.turn &&
  left.castles.castlingRights.equals(right.castles.castlingRights) &&
  left.epSquare === right.epSquare;

export const castlingSide = (pos: Position, move: Move): CastlingSide | undefined => {
  if (isDrop(move)) return undefined;
  const piece = pos.board.get(move.from);
  if (!piece || piece.role !== "king") return undefined;
  const df = (move.to & 7) - (move.from & 7);
  if (Math.abs(df) < 2) return undefined;
  return df > 0 ? "h" : "a";
};

export const normalizeMove = (pos: Position, move: Move): Move => {
  if (isDrop(move)) return move;
  const side = castlingSide(pos, move);
  if (side) {
    const rook = pos.castles.rook[pos.turn][side];
    if (rook !== undefined) return { from: move.from, to: rook, promotion: move.promotion };
  }
  return move;
};

export const isStandardMaterialSide = (board: Board, color: Color): boolean =>
  board.pieces(color, "pawn").isEmpty() &&
  board.pieces(color, "knight").isEmpty() &&
  board.pieces(color, "bishop").isEmpty() &&
  board.pieces(color, "rook").size() === 2 &&
  board.pieces(color, "queen").size() === 1 &&
  board.kingOf(color) !== undefined;

export const isStandardMaterial = (pos: Chess): boolean =>
  isStandardMaterialSide(pos.board, "white") && isStandardMaterialSide(pos.board, "black");
