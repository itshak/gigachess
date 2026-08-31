// src/baseline/setup.ts — baseline-exact Setup interface and helpers (ADR-014).
// Pockets/remainingChecks are always undefined: turbochess implements standard
// chess only (no Crazyhouse/3check — variants are out of project scope).
import { Board } from "./board.js";
import { SquareSet } from "./squareSet.js";
import type { ByColor, ByRole, Color, Role, Square } from "./types.js";

export class MaterialSide implements ByRole<number> {
  pawn = 0;
  knight = 0;
  bishop = 0;
  rook = 0;
  queen = 0;
  king = 0;
  private constructor() {}
  static empty(): MaterialSide {
    return new MaterialSide();
  }
  static fromBoard(board: Board, color: Color): MaterialSide {
    const m = MaterialSide.empty();
    for (const role of ["pawn", "knight", "bishop", "rook", "queen", "king"] as Role[]) {
      m[role] = board.pieces(color, role).size();
    }
    return m;
  }
  clone(): MaterialSide {
    const m = MaterialSide.empty();
    for (const role of ["pawn", "knight", "bishop", "rook", "queen", "king"] as Role[]) m[role] = this[role];
    return m;
  }
  equals(other: MaterialSide): boolean {
    return (["pawn", "knight", "bishop", "rook", "queen", "king"] as Role[]).every((r) => this[r] === other[r]);
  }
  add(other: MaterialSide): MaterialSide {
    const m = this.clone();
    for (const role of ["pawn", "knight", "bishop", "rook", "queen", "king"] as Role[]) m[role] += other[role];
    return m;
  }
  subtract(other: MaterialSide): MaterialSide {
    const m = this.clone();
    for (const role of ["pawn", "knight", "bishop", "rook", "queen", "king"] as Role[]) m[role] -= other[role];
    return m;
  }
  nonEmpty(): boolean {
    return !this.isEmpty();
  }
  isEmpty(): boolean {
    return this.size() === 0;
  }
  hasPawns(): boolean {
    return this.pawn > 0;
  }
  hasNonPawns(): boolean {
    return this.knight + this.bishop + this.rook + this.queen + this.king > 0;
  }
  size(): number {
    return this.pawn + this.knight + this.bishop + this.rook + this.queen + this.king;
  }
}

export class Material implements ByColor<MaterialSide> {
  white: MaterialSide;
  black: MaterialSide;
  constructor(white: MaterialSide, black: MaterialSide) {
    this.white = white;
    this.black = black;
  }
  static empty(): Material {
    return new Material(MaterialSide.empty(), MaterialSide.empty());
  }
  static fromBoard(board: Board): Material {
    return new Material(MaterialSide.fromBoard(board, "white"), MaterialSide.fromBoard(board, "black"));
  }
  clone(): Material {
    return new Material(this.white.clone(), this.black.clone());
  }
  equals(other: Material): boolean {
    return this.white.equals(other.white) && this.black.equals(other.black);
  }
  add(other: Material): Material {
    return new Material(this.white.add(other.white), this.black.add(other.black));
  }
  subtract(other: Material): Material {
    return new Material(this.white.subtract(other.white), this.black.subtract(other.black));
  }
  count(role: Role): number {
    return this.white[role] + this.black[role];
  }
  size(): number {
    return this.white.size() + this.black.size();
  }
  isEmpty(): boolean {
    return this.size() === 0;
  }
  nonEmpty(): boolean {
    return !this.isEmpty();
  }
  hasPawns(): boolean {
    return this.white.hasPawns() || this.black.hasPawns();
  }
  hasNonPawns(): boolean {
    return this.white.hasNonPawns() || this.black.hasNonPawns();
  }
}

export class RemainingChecks implements ByColor<number> {
  white: number;
  black: number;
  constructor(white: number, black: number) {
    this.white = white;
    this.black = black;
  }
  static default(): RemainingChecks {
    return new RemainingChecks(0, 0);
  }
  clone(): RemainingChecks {
    return new RemainingChecks(this.white, this.black);
  }
  equals(other: RemainingChecks): boolean {
    return this.white === other.white && this.black === other.black;
  }
}

/** A not necessarily legal standard-chess position (baseline-exact shape). */
export interface Setup {
  board: Board;
  pockets: Material | undefined;
  turn: Color;
  castlingRights: SquareSet;
  epSquare: Square | undefined;
  remainingChecks: RemainingChecks | undefined;
  halfmoves: number;
  fullmoves: number;
}

export const defaultSetup = (): Setup => ({
  board: Board.default(),
  pockets: undefined,
  turn: "white",
  castlingRights: new SquareSet(0x81, 0x81000000), // a1, h1, a8, h8
  epSquare: undefined,
  remainingChecks: undefined,
  halfmoves: 0,
  fullmoves: 1,
});

export const emptySetup = (): Setup => ({
  board: Board.empty(),
  pockets: undefined,
  turn: "white",
  castlingRights: SquareSet.empty(),
  epSquare: undefined,
  remainingChecks: undefined,
  halfmoves: 0,
  fullmoves: 1,
});

export const setupClone = (setup: Setup): Setup => ({
  board: setup.board.clone(),
  pockets: setup.pockets?.clone(),
  turn: setup.turn,
  castlingRights: setup.castlingRights,
  epSquare: setup.epSquare,
  remainingChecks: setup.remainingChecks?.clone(),
  halfmoves: setup.halfmoves,
  fullmoves: setup.fullmoves,
});

export const setupEquals = (left: Setup, right: Setup): boolean =>
  boardEqualsShallow(left.board, right.board) &&
  left.turn === right.turn &&
  left.castlingRights.equals(right.castlingRights) &&
  left.epSquare === right.epSquare &&
  left.halfmoves === right.halfmoves &&
  left.fullmoves === right.fullmoves;

function boardEqualsShallow(a: Board, b: Board): boolean {
  const fields = ["occupied", "promoted", "white", "black", "pawn", "knight", "bishop", "rook", "queen", "king"] as const;
  return fields.every((f) => a[f].equals(b[f]));
}
