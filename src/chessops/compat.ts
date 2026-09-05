// src/baseline/compat.ts — thin conversion layer over gigachess/board-movegen.
// Converts facade movegen output (`Position.allDests()` → Map<Square,
// SquareSet>) into board-renderer `Dests` shapes (Map<Key, Key[]> of
// algebraic square names). NO move generation happens here — every legal-move
// question is delegated to the engine per openspec/specs/purechess-board-movegen
// (purechess-rules for castling rights). Pure functions only: pure {lo,hi}
// pairs (no 64-bit integer math), no state, inputs never mutated. Clean-room:
// built from the gigachess-* specs only (see proposal FORBIDDEN/ALLOWED sources).
import type { Position } from "./chess.js";
import { makeSquare } from "./util.js";

/** Algebraic square key, e.g. "e2" (board-renderer Key). */
export type Key = string;

/** Board-renderer `Dests`: from-key -> list of to-keys. */
export type Dests = Map<Key, Key[]>;

/**
 * Converts `pos.allDests()` (one entry per own piece, including empty dest
 * sets) into `Dests`. Byte-identical mapping: from-keys in allDests iteration
 * order, to-keys in SquareSet ascending-bit order.
 */
export function chessToDests(pos: Position): Dests {
  const out: Dests = new Map();
  for (const [from, set] of pos.allDests()) {
    const tos: Key[] = [];
    for (const to of set) tos.push(makeSquare(to));
    out.set(makeSquare(from), tos);
  }
  return out;
}

/** Number of legal destination squares across all own pieces. */
export function destsSize(pos: Position): number {
  let n = 0;
  for (const set of pos.allDests().values()) n += set.size();
  return n;
}

/** Convenience bundle — `import { compat }` from the package's baseline entry. */
export const compat = { chessToDests, destsSize };
