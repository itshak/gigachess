// src/baseline/transform.ts — pure Board transforms as {lo,hi} SquareSet bit ops.
// Vertical mirror (rank flip) = byte-reverse across the lo/hi halves; 180°
// rotation = rank mirror + file mirror (bit-reversal within each rank byte);
// color flip = white<->black set swap. NO move generation, no mutable state,
// inputs never mutated, pure {lo,hi} pairs (no 64-bit integer math). Clean-room:
// built from openspec/specs/purechess-board-movegen only (see proposal
// FORBIDDEN/ALLOWED sources). Double-mirror is the identity (board.equals holds).
import type { Board as EngineBoard } from "../board.js";
import type { SquareSet as EngineSet } from "../squareSet.js";
import { boardFromEngine, boardToEngine } from "./convert.js";
import type { Board } from "./board.js";

/**
 * Reverses the byte order of a 32-bit word: rank b of the half maps to rank
 * 3-b of the opposite half (square s -> s ^ 56 across the whole 64-bit board).
 */
function byteReverse32(x: number): number {
  x = x >>> 0;
  return (((x & 0xff) << 24) | ((x & 0xff00) << 8) | ((x >>> 8) & 0xff00) | ((x >>> 24) & 0xff)) >>> 0;
}

/** Vertical (rank) mirror via the {lo,hi} cross-byte swap. */
function rankMirror(set: EngineSet): EngineSet {
  return { lo: byteReverse32(set.hi >>> 0), hi: byteReverse32(set.lo >>> 0) };
}

/** Horizontal (file) mirror: square s -> s ^ 7, bit-reversal within each rank byte. */
function fileMirror32(x: number): number {
  x = x >>> 0;
  x = ((x & 0x55555555) << 1) | ((x >>> 1) & 0x55555555);
  x = ((x & 0x33333333) << 2) | ((x >>> 2) & 0x33333333);
  x = ((x & 0x0f0f0f0f) << 4) | ((x >>> 4) & 0x0f0f0f0f);
  return x >>> 0;
}

function fileMirror(set: EngineSet): EngineSet {
  return { lo: fileMirror32(set.lo >>> 0), hi: fileMirror32(set.hi >>> 0) };
}

const IDENTITY = (s: EngineSet): EngineSet => ({ lo: s.lo >>> 0, hi: s.hi >>> 0 });

function transformBoard(
  b: Board,
  f: (s: EngineSet) => EngineSet,
  swapColors: boolean,
): Board {
  const src = boardToEngine(b);
  const white = f(src.white);
  const black = f(src.black);
  const out: EngineBoard = {
    white: swapColors ? black : white,
    black: swapColors ? white : black,
    pawn: f(src.pawn),
    knight: f(src.knight),
    bishop: f(src.bishop),
    rook: f(src.rook),
    queen: f(src.queen),
    king: f(src.king),
    occupied: f(src.occupied),
    promoted: f(src.promoted),
  };
  return boardFromEngine(out);
}

/**
 * Vertical mirror + color swap: the position seen from the opposite side's
 * perspective. `mirrorBoard(b).black` is the rank-mirror of `b.white`; the
 * start position maps to itself and `mirrorBoard(mirrorBoard(b))` equals `b`.
 */
export const mirrorBoard = (b: Board): Board => transformBoard(b, rankMirror, true);

/** 180° rotation (rank + file mirror), colors unchanged. */
export const rotateBoard = (b: Board): Board =>
  transformBoard(b, (s) => fileMirror(rankMirror(s)), false);

/** Color swap in place: white<->black piece sets swap, squares unchanged. */
export const flipColor = (b: Board): Board => transformBoard(b, IDENTITY, true);
