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
 */
export type WritableBoard = { -readonly [K in keyof Board]: Board[K] };

export function newScratchBoard(): WritableBoard {
  const e = sq.empty();
  return {
    white: e, black: e, pawn: e, knight: e, bishop: e,
    rook: e, queen: e, king: e, occupied: e, promoted: e,
  };
}

export function cloneAsWritable(board: Board): WritableBoard {
  // fresh object, safe to write; SquareSet values are immutable so field copy suffices
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

/** Copy `src`'s ten fields into `dst` (scratch reuse — no allocation). */
export function copyBoardInto(dst: WritableBoard, src: Board): void {
  dst.white = src.white;
  dst.black = src.black;
  dst.pawn = src.pawn;
  dst.knight = src.knight;
  dst.bishop = src.bishop;
  dst.rook = src.rook;
  dst.queen = src.queen;
  dst.king = src.king;
  dst.occupied = src.occupied;
  dst.promoted = src.promoted;
}

/** In-place: remove the piece (any color/role) at sqIdx. Hot-loop only. */
export function clearSquareInPlace(b: WritableBoard, sqIdx: number): void {
  const mask = sq.not(sq.singleton(sqIdx));
  b.white = sq.and(b.white, mask);
  b.black = sq.and(b.black, mask);
  b.pawn = sq.and(b.pawn, mask);
  b.knight = sq.and(b.knight, mask);
  b.bishop = sq.and(b.bishop, mask);
  b.rook = sq.and(b.rook, mask);
  b.queen = sq.and(b.queen, mask);
  b.king = sq.and(b.king, mask);
  b.occupied = sq.and(b.occupied, mask);
  b.promoted = sq.and(b.promoted, mask);
}

/** In-place: place a piece at sqIdx. Hot-loop only. */
export function putPieceInPlace(b: WritableBoard, sqIdx: number, piece: { color: Color; role: Role }): void {
  const bit = sq.singleton(sqIdx);
  if (piece.color === Color.White) b.white = sq.or(b.white, bit);
  else b.black = sq.or(b.black, bit);
  switch (piece.role) {
    case Role.Pawn: b.pawn = sq.or(b.pawn, bit); break;
    case Role.Knight: b.knight = sq.or(b.knight, bit); break;
    case Role.Bishop: b.bishop = sq.or(b.bishop, bit); break;
    case Role.Rook: b.rook = sq.or(b.rook, bit); break;
    case Role.Queen: b.queen = sq.or(b.queen, bit); break;
    case Role.King: b.king = sq.or(b.king, bit); break;
  }
  b.occupied = sq.or(b.occupied, bit);
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
