// src/board.ts — immutable Board value of ten SquareSets, clone→mutate clone

import type { SquareSet } from "./squareSet.js";
import * as sq from "./squareSet.js";
import { Color, Role } from "./types.js";

export type Board = {
  readonly white: SquareSet;
  readonly black: SquareSet;
  readonly pawn: SquareSet;
  readonly knight: SquareSet;
  readonly bishop: SquareSet;
  readonly rook: SquareSet;
  readonly queen: SquareSet;
  readonly king: SquareSet;
  readonly occupied: SquareSet;
  readonly promoted: SquareSet;
};

export function emptyBoard(): Board {
  const e = sq.empty();
  return {
    white: e,
    black: e,
    pawn: e,
    knight: e,
    bishop: e,
    rook: e,
    queen: e,
    king: e,
    occupied: e,
    promoted: e,
  };
}

export function cloneBoard(board: Board): Board {
  // pure clone — SquareSet are immutable values, but we return new object
  return {
    white: { lo: board.white.lo >>> 0, hi: board.white.hi >>> 0 },
    black: { lo: board.black.lo >>> 0, hi: board.black.hi >>> 0 },
    pawn: { lo: board.pawn.lo >>> 0, hi: board.pawn.hi >>> 0 },
    knight: { lo: board.knight.lo >>> 0, hi: board.knight.hi >>> 0 },
    bishop: { lo: board.bishop.lo >>> 0, hi: board.bishop.hi >>> 0 },
    rook: { lo: board.rook.lo >>> 0, hi: board.rook.hi >>> 0 },
    queen: { lo: board.queen.lo >>> 0, hi: board.queen.hi >>> 0 },
    king: { lo: board.king.lo >>> 0, hi: board.king.hi >>> 0 },
    occupied: { lo: board.occupied.lo >>> 0, hi: board.occupied.hi >>> 0 },
    promoted: { lo: board.promoted.lo >>> 0, hi: board.promoted.hi >>> 0 },
  };
}

function recomputeOccupied(b: Board): void {
  // mutates internal b (already cloned) — caller must have cloned
  (b as any).occupied = sq.or(b.white, b.black);
}

export function setPiece(board: Board, sqIdx: number, piece: { color: Color; role: Role }): Board {
  const nb = cloneBoard(board);
  const bit = sq.singleton(sqIdx);
  // add to color
  if (piece.color === Color.White) (nb as any).white = sq.or(nb.white, bit);
  else (nb as any).black = sq.or(nb.black, bit);
  // add to role
  switch (piece.role) {
    case Role.Pawn: (nb as any).pawn = sq.or(nb.pawn, bit); break;
    case Role.Knight: (nb as any).knight = sq.or(nb.knight, bit); break;
    case Role.Bishop: (nb as any).bishop = sq.or(nb.bishop, bit); break;
    case Role.Rook: (nb as any).rook = sq.or(nb.rook, bit); break;
    case Role.Queen: (nb as any).queen = sq.or(nb.queen, bit); break;
    case Role.King: (nb as any).king = sq.or(nb.king, bit); break;
  }
  recomputeOccupied(nb);
  return nb;
}

export function removePiece(board: Board, sqIdx: number): Board {
  const nb = cloneBoard(board);
  const mask = sq.not(sq.singleton(sqIdx));
  (nb as any).white = sq.and(nb.white, mask);
  (nb as any).black = sq.and(nb.black, mask);
  (nb as any).pawn = sq.and(nb.pawn, mask);
  (nb as any).knight = sq.and(nb.knight, mask);
  (nb as any).bishop = sq.and(nb.bishop, mask);
  (nb as any).rook = sq.and(nb.rook, mask);
  (nb as any).queen = sq.and(nb.queen, mask);
  (nb as any).king = sq.and(nb.king, mask);
  (nb as any).promoted = sq.and(nb.promoted, mask);
  recomputeOccupied(nb);
  return nb;
}

export function pieceAt(board: Board, sqIdx: number): { color: Color; role: Role } | undefined {
  const bit = sq.singleton(sqIdx);
  if (sq.isEmpty(sq.and(board.occupied, bit))) return undefined;
  const color = sq.has(board.white, sqIdx) ? Color.White : Color.Black;
  let role: Role | undefined;
  if (sq.has(board.pawn, sqIdx)) role = Role.Pawn;
  else if (sq.has(board.knight, sqIdx)) role = Role.Knight;
  else if (sq.has(board.bishop, sqIdx)) role = Role.Bishop;
  else if (sq.has(board.rook, sqIdx)) role = Role.Rook;
  else if (sq.has(board.queen, sqIdx)) role = Role.Queen;
  else if (sq.has(board.king, sqIdx)) role = Role.King;
  if (role === undefined) return undefined;
  return { color, role };
}

export function hasPiece(board: Board, sqIdx: number): boolean {
  return sq.has(board.occupied, sqIdx);
}

export function kingSquare(board: Board, color: Color): number | undefined {
  const ks = color === Color.White ? sq.and(board.white, board.king) : sq.and(board.black, board.king);
  return sq.first(ks);
}

export function occupiedEqualsWhiteBlack(board: Board): boolean {
  return sq.equals(board.occupied, sq.or(board.white, board.black));
}

export function rolePartitionEqualsOccupied(board: Board): boolean {
  const roles = sq.or(
    sq.or(sq.or(board.pawn, board.knight), sq.or(board.bishop, board.rook)),
    sq.or(board.queen, board.king),
  );
  return sq.equals(roles, board.occupied);
}

// For testing immutability
export function boardEquals(a: Board, b: Board): boolean {
  return (
    sq.equals(a.white, b.white) &&
    sq.equals(a.black, b.black) &&
    sq.equals(a.pawn, b.pawn) &&
    sq.equals(a.knight, b.knight) &&
    sq.equals(a.bishop, b.bishop) &&
    sq.equals(a.rook, b.rook) &&
    sq.equals(a.queen, b.queen) &&
    sq.equals(a.king, b.king) &&
    sq.equals(a.occupied, b.occupied) &&
    sq.equals(a.promoted, b.promoted)
  );
}
