// src/types.ts — language-neutral chess types, const enum inlined per ADR-012

export const enum Color {
  White = 0,
  Black = 1,
}

export const enum Role {
  Pawn = 0,
  Knight = 1,
  Bishop = 2,
  Rook = 3,
  Queen = 4,
  King = 5,
}

export const enum Square {
  A1 = 0, B1 = 1, C1 = 2, D1 = 3, E1 = 4, F1 = 5, G1 = 6, H1 = 7,
  A2 = 8, B2 = 9, C2 = 10, D2 = 11, E2 = 12, F2 = 13, G2 = 14, H2 = 15,
  A3 = 16, B3 = 17, C3 = 18, D3 = 19, E3 = 20, F3 = 21, G3 = 22, H3 = 23,
  A4 = 24, B4 = 25, C4 = 26, D4 = 27, E4 = 28, F4 = 29, G4 = 30, H4 = 31,
  A5 = 32, B5 = 33, C5 = 34, D5 = 35, E5 = 36, F5 = 37, G5 = 38, H5 = 39,
  A6 = 40, B6 = 41, C6 = 42, D6 = 43, E6 = 44, F6 = 45, G6 = 46, H6 = 47,
  A7 = 48, B7 = 49, C7 = 50, D7 = 51, E7 = 52, F7 = 53, G7 = 54, H7 = 55,
  A8 = 56, B8 = 57, C8 = 58, D8 = 59, E8 = 60, F8 = 61, G8 = 62, H8 = 63,
}

export type Piece = {
  readonly color: Color;
  readonly role: Role;
};

export type CastlingSide = "king" | "queen";
export type CastlingRights = {
  readonly white: ReadonlySet<number>;
  readonly black: ReadonlySet<number>;
  // legacy booleans for standard compatibility (derived from sets)
  readonly whiteKing: boolean;
  readonly whiteQueen: boolean;
  readonly blackKing: boolean;
  readonly blackQueen: boolean;
};

// Setup/Position are immutable value types (ADR-012 §4): the public API is
// functional — every op returns a new value and never mutates its input.
// `readonly` here is compile-time only (TS erases it), so it costs nothing at
// runtime; it makes accidental field writes and Set mutations of shared
// sub-objects a type error instead of a silent corruption.
export type Setup = {
  readonly board: import("./board.js").Board;
  readonly turn: Color;
  readonly castling: CastlingRights;
  readonly epSquare: number | null;
  readonly halfmoves: number;
  readonly fullmoves: number;
  // aliases for spec naming
  readonly halfmove?: number;
  readonly fullmove?: number;
  // 64-bit Zobrist key (zero-BigInt {lo,hi} halves; see src/zobrist.ts).
  // Optional: present only when the Zobrist tables are loaded — makeMove
  // maintains these fields incrementally whenever the input position has them.
  readonly zobristLo?: number;
  readonly zobristHi?: number;
};

export type Position = Setup;

export type NormalMove = {
  from: number;
  to: number;
  capture?: number | null;
  promotion?: Role | null;
};

export type DropMove = NormalMove;

export type Move = NormalMove & {
  // flags for special moves
  isEnPassant?: boolean;
  isCastling?: boolean;
  isPromotion?: boolean;
};

export type Outcome = "white" | "black" | "draw" | "*";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function Ok<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}
export function Err<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}

// Error codes → i18n keys turbochess.<module>.<code> (renamed from turbochess.*, ADR-015)
export type FenError = { code: string; message?: string };
export type SanError = { code: string; message?: string };
export type UciError = { code: string; message?: string };
export type PgnError = { code: string; message?: string };
export type MoveError = { code: string; message?: string };
