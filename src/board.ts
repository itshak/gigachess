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

/**
 * Pure Board construction helpers.
 *
 * Contract (per purechess-board-movegen spec): Board is an immutable value —
 * every public op takes a Board and returns a NEW Board; the input is never
 * mutated. The *implementation* uses the spec-sanctioned clone→mutate-clone
 * technique via `WritableBoard` (see below), which keeps types honest without
 * `as any` casts.
 */

/**
 * Writable view of a Board. HOT-LOOP-ONLY escape hatch, per the FP policy:
 * in-place board mutation is permitted exclusively inside leaf functions that
 * own a private scratch buffer (legality testing, move application) where
 * allocation churn dominates. Rules:
 *  1. A WritableBoard must NEVER escape the function that created/borrowed it.
 *  2. While a borrowed scratch is live, only leaf helpers may be called
 *     (SquareSet ops, attacks lookups) — nothing that re-enters movegen.
 *  3. Public APIs must keep the observable pure contract: inputs unmodified.
 *
 * Unlike Board, a WritableBoard's field objects are MUTABLE bitfields
 * (MutableSquareSet): the owning scratch copies bits in place instead of
 * allocating fresh {lo,hi} objects per edit. This is sound because the scratch
 * objects never alias any Board's (immutable) field objects — see
 * newScratchBoard/copyBoardInto — and never escape rule 1.
 */
export type WritableBoard = { [K in keyof Board]: sq.MutableSquareSet };

export function newScratchBoard(): WritableBoard {
  // Each field gets its OWN object: the fields are mutable now, so sharing one
  // empty object across all ten would alias them together.
  return {
    white: { lo: 0, hi: 0 },
    black: { lo: 0, hi: 0 },
    pawn: { lo: 0, hi: 0 },
    knight: { lo: 0, hi: 0 },
    bishop: { lo: 0, hi: 0 },
    rook: { lo: 0, hi: 0 },
    queen: { lo: 0, hi: 0 },
    king: { lo: 0, hi: 0 },
    occupied: { lo: 0, hi: 0 },
    promoted: { lo: 0, hi: 0 },
  };
}

export function cloneAsWritable(board: Board): WritableBoard {
  // fresh mutable objects (the result escapes as a new Board); SquareSet
  // values are immutable so a field-bit copy suffices
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

/** Copy `src`'s ten fields into `dst`. Zero-allocation: the scratch owns its
 * field objects, so only the 64-bit values are assigned (no {lo,hi} churn). */
export function copyBoardInto(dst: WritableBoard, src: Board): void {
  dst.white.lo = src.white.lo; dst.white.hi = src.white.hi;
  dst.black.lo = src.black.lo; dst.black.hi = src.black.hi;
  dst.pawn.lo = src.pawn.lo; dst.pawn.hi = src.pawn.hi;
  dst.knight.lo = src.knight.lo; dst.knight.hi = src.knight.hi;
  dst.bishop.lo = src.bishop.lo; dst.bishop.hi = src.bishop.hi;
  dst.rook.lo = src.rook.lo; dst.rook.hi = src.rook.hi;
  dst.queen.lo = src.queen.lo; dst.queen.hi = src.queen.hi;
  dst.king.lo = src.king.lo; dst.king.hi = src.king.hi;
  dst.occupied.lo = src.occupied.lo; dst.occupied.hi = src.occupied.hi;
  dst.promoted.lo = src.promoted.lo; dst.promoted.hi = src.promoted.hi;
}

/** In-place: remove the piece (any color/role) at sqIdx. Hot-loop only.
 * Zero-allocation: raw bitmasks instead of sq.not/singleton/and objects. */
export function clearSquareInPlace(b: WritableBoard, sqIdx: number): void {
  if (sqIdx < 32) {
    const inv = ~(1 << sqIdx);
    b.white.lo &= inv; b.black.lo &= inv; b.pawn.lo &= inv; b.knight.lo &= inv;
    b.bishop.lo &= inv; b.rook.lo &= inv; b.queen.lo &= inv; b.king.lo &= inv;
    b.occupied.lo &= inv; b.promoted.lo &= inv;
  } else {
    const inv = ~(1 << (sqIdx - 32));
    b.white.hi &= inv; b.black.hi &= inv; b.pawn.hi &= inv; b.knight.hi &= inv;
    b.bishop.hi &= inv; b.rook.hi &= inv; b.queen.hi &= inv; b.king.hi &= inv;
    b.occupied.hi &= inv; b.promoted.hi &= inv;
  }
}

/** In-place: place a piece at sqIdx. Hot-loop only. Zero-allocation. */
export function putPieceInPlace(b: WritableBoard, sqIdx: number, piece: { color: Color; role: Role }): void {
  if (sqIdx < 32) {
    const bit = (1 << sqIdx) >>> 0;
    if (piece.color === Color.White) b.white.lo |= bit;
    else b.black.lo |= bit;
    switch (piece.role) {
      case Role.Pawn: b.pawn.lo |= bit; break;
      case Role.Knight: b.knight.lo |= bit; break;
      case Role.Bishop: b.bishop.lo |= bit; break;
      case Role.Rook: b.rook.lo |= bit; break;
      case Role.Queen: b.queen.lo |= bit; break;
      case Role.King: b.king.lo |= bit; break;
    }
    b.occupied.lo |= bit;
  } else {
    const bit = (1 << (sqIdx - 32)) >>> 0;
    if (piece.color === Color.White) b.white.hi |= bit;
    else b.black.hi |= bit;
    switch (piece.role) {
      case Role.Pawn: b.pawn.hi |= bit; break;
      case Role.Knight: b.knight.hi |= bit; break;
      case Role.Bishop: b.bishop.hi |= bit; break;
      case Role.Rook: b.rook.hi |= bit; break;
      case Role.Queen: b.queen.hi |= bit; break;
      case Role.King: b.king.hi |= bit; break;
    }
    b.occupied.hi |= bit;
  }
}

export function setPiece(board: Board, sqIdx: number, piece: { color: Color; role: Role }): Board {
  const nb = cloneAsWritable(board);
  putPieceInPlace(nb, sqIdx, piece);
  return nb;
}

export function removePiece(board: Board, sqIdx: number): Board {
  const nb = cloneAsWritable(board);
  clearSquareInPlace(nb, sqIdx);
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
