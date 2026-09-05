// src/baseline/board.ts — baseline-exact Board class (ADR-014). Mutability
// matches baseline (set/take/clear/reset mutate this instance); the wrapper
// delegates to the immutable engine board, so caller-provided boards are
// never mutated by engine operations.
import * as engine from "../board.js";
import { Role as ERole, Color as EColor } from "../types.js";
import { INITIAL_FEN, engineBoardFromPlacement } from "./fenInternal.js";
import { SquareSet } from "./squareSet.js";
import type { ByColor, ByRole, Color, Piece, Role, Square } from "./types.js";

const COLORS: Color[] = ["white", "black"];
const ROLES: Role[] = ["pawn", "knight", "bishop", "rook", "queen", "king"];

export class Board implements Iterable<[Square, Piece]>, ByRole<SquareSet>, ByColor<SquareSet> {
  /** Internal engine (immutable) board. Mutating methods replace it wholesale. */
  _b: engine.BoardLike;

  private constructor(b: engine.BoardLike) {
    this._b = b;
  }

  static empty(): Board {
    return new Board(engine.emptyBoard());
  }
  static default(): Board {
    return new Board(engineBoardFromPlacement(INITIAL_FEN.split(" ")[0]));
  }
  reset(): void {
    this._b = Board.default()._b;
  }
  clear(): void {
    this._b = engine.emptyBoard();
  }
  clone(): Board {
    return new Board(this._b);
  }

  get occupied(): SquareSet {
    return new SquareSet(this._b.occupied.lo | 0, this._b.occupied.hi | 0);
  }
  get promoted(): SquareSet {
    return new SquareSet(this._b.promoted.lo | 0, this._b.promoted.hi | 0);
  }
  get white(): SquareSet {
    return new SquareSet(this._b.white.lo | 0, this._b.white.hi | 0);
  }
  get black(): SquareSet {
    return new SquareSet(this._b.black.lo | 0, this._b.black.hi | 0);
  }
  get pawn(): SquareSet {
    return new SquareSet(this._b.pawn.lo | 0, this._b.pawn.hi | 0);
  }
  get knight(): SquareSet {
    return new SquareSet(this._b.knight.lo | 0, this._b.knight.hi | 0);
  }
  get bishop(): SquareSet {
    return new SquareSet(this._b.bishop.lo | 0, this._b.bishop.hi | 0);
  }
  get rook(): SquareSet {
    return new SquareSet(this._b.rook.lo | 0, this._b.rook.hi | 0);
  }
  get queen(): SquareSet {
    return new SquareSet(this._b.queen.lo | 0, this._b.queen.hi | 0);
  }
  get king(): SquareSet {
    return new SquareSet(this._b.king.lo | 0, this._b.king.hi | 0);
  }
  // Write-through property setters (baseline allows direct field mutation);
  // each setter replaces the role/color field in the engine board.
  private replace(name: keyof engine.BoardLike, s: SquareSet): void {
    // normalize to unsigned before handing bits to the engine
    this._b = { ...this._b, [name]: { lo: s.lo >>> 0, hi: s.hi >>> 0 } };
  }
  set occupied(s: SquareSet) { this.replace("occupied", s); }
  set promoted(s: SquareSet) { this.replace("promoted", s); }
  set white(s: SquareSet) { this.replace("white", s); }
  set black(s: SquareSet) { this.replace("black", s); }
  set pawn(s: SquareSet) { this.replace("pawn", s); }
  set knight(s: SquareSet) { this.replace("knight", s); }
  set bishop(s: SquareSet) { this.replace("bishop", s); }
  set rook(s: SquareSet) { this.replace("rook", s); }
  set queen(s: SquareSet) { this.replace("queen", s); }
  set king(s: SquareSet) { this.replace("king", s); }

  getColor(square: Square): Color | undefined {
    const p = engine.pieceAt(this._b, square);
    return p === undefined ? undefined : p.color === EColor.White ? "white" : "black";
  }
  getRole(square: Square): Role | undefined {
    const p = engine.pieceAt(this._b, square);
    return p === undefined ? undefined : ROLES[p.role];
  }
  get(square: Square): Piece | undefined {
    const p = engine.pieceAt(this._b, square);
    return p === undefined ? undefined : { role: ROLES[p.role], color: COLORS[p.color] };
  }
  take(square: Square): Piece | undefined {
    const p = this.get(square);
    if (p === undefined) return undefined;
    this._b = engine.removePiece(this._b, square);
    return p;
  }
  set(square: Square, piece: Piece): Piece | undefined {
    const existing = this.get(square);
    this._b = engine.setPiece(this._b, square, {
      color: piece.color === "white" ? EColor.White : EColor.Black,
      role: ROLES.indexOf(piece.role) as unknown as ERole,
    });
    return existing;
  }
  has(square: Square): boolean {
    return engine.pieceAt(this._b, square) !== undefined;
  }
  *[Symbol.iterator](): Iterator<[Square, Piece]> {
    const occupied = new SquareSet(this._b.occupied.lo, this._b.occupied.hi);
    for (const s of occupied) {
      const p = this.get(s);
      if (p) yield [s, p];
    }
  }
  pieces(color: Color, role: Role): SquareSet {
    const c = color === "white" ? this.white : this.black;
    const r = this[role as keyof ByRole<SquareSet>] as SquareSet;
    return c.intersect(r);
  }
  rooksAndQueens(): SquareSet {
    return this.rook.union(this.queen);
  }
  bishopsAndQueens(): SquareSet {
    return this.bishop.union(this.queen);
  }
  steppers(): SquareSet {
    return this.knight.union(this.king).union(this.pawn);
  }
  sliders(): SquareSet {
    return this.rooksAndQueens().union(this.bishopsAndQueens());
  }
  kingOf(color: Color): Square | undefined {
    const ks = color === "white"
      ? new SquareSet(this._b.white.lo & this._b.king.lo, this._b.white.hi & this._b.king.hi)
      : new SquareSet(this._b.black.lo & this._b.king.lo, this._b.black.hi & this._b.king.hi);
    return ks.singleSquare();
  }
}

export const boardEquals = (left: Board, right: Board): boolean =>
  engine.boardEquals(left._b, right._b);
