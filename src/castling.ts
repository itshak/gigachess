// src/castling.ts — Standard Chess 4-bit castling mask, O(1) clear table, and precomputed rights
import type { CastlingRights, Position } from "./types.js";
import type { CastlingPlan } from "./chess.js";

export const CASTLE_WK = 1; // 0b0001
export const CASTLE_WQ = 2; // 0b0010
export const CASTLE_BK = 4; // 0b0100
export const CASTLE_BQ = 8; // 0b1000

/**
 * Precomputed 64-entry lookup table for single-cycle rights clearing.
 * Clears rights when king or rook moves or is captured on standard squares.
 */
export const CASTLE_CLEAR_STD = new Uint8Array(64);
CASTLE_CLEAR_STD.fill(0x0F);
CASTLE_CLEAR_STD[4] = 0x0C;  // e1 (White King) -> clears WK | WQ (12)
CASTLE_CLEAR_STD[60] = 0x03; // e8 (Black King) -> clears BK | BQ (3)
CASTLE_CLEAR_STD[7] = 0x0E;  // h1 (White King Rook) -> clears WK (14)
CASTLE_CLEAR_STD[0] = 0x0D;  // a1 (White Queen Rook) -> clears WQ (13)
CASTLE_CLEAR_STD[63] = 0x0B; // h8 (Black King Rook) -> clears BK (11)
CASTLE_CLEAR_STD[56] = 0x07; // a8 (Black Queen Rook) -> clears BQ (7)

/** Standard castling plans (immutable/frozen singletons) */
export const PLAN_WHITE_K: CastlingPlan = Object.freeze({
  side: "king",
  kingFrom: 4,
  kingTo: 6,
  rookFrom: 7,
  rookTo: 5,
});

export const PLAN_WHITE_Q: CastlingPlan = Object.freeze({
  side: "queen",
  kingFrom: 4,
  kingTo: 2,
  rookFrom: 0,
  rookTo: 3,
});

export const PLAN_BLACK_K: CastlingPlan = Object.freeze({
  side: "king",
  kingFrom: 60,
  kingTo: 62,
  rookFrom: 63,
  rookTo: 61,
});

export const PLAN_BLACK_Q: CastlingPlan = Object.freeze({
  side: "queen",
  kingFrom: 60,
  kingTo: 58,
  rookFrom: 56,
  rookTo: 59,
});

/** Precomputed 16-entry FEN castling string lookup table */
export const CASTLING_FEN_STR: readonly string[] = [
  "-", "K", "Q", "KQ", "k", "Kk", "Qk", "KQk",
  "q", "Kq", "Qq", "KQq", "kq", "Kkq", "Qkq", "KQkq"
];

const S0 = new Set<number>();
const S7 = new Set<number>([7]);
const S0_2 = new Set<number>([0]);
const S0_7 = new Set<number>([0, 7]);
const WHITE_SETS: readonly ReadonlySet<number>[] = [S0, S7, S0_2, S0_7];

const S63 = new Set<number>([63]);
const S56 = new Set<number>([56]);
const S56_63 = new Set<number>([56, 63]);
const BLACK_SETS: readonly ReadonlySet<number>[] = [S0, S63, S56, S56_63];

/** Precomputed 16-entry CastlingRights table for standard chess (zero allocations) */
export const CASTLING_RIGHTS_TABLE: readonly CastlingRights[] = (() => {
  const table: CastlingRights[] = [];
  for (let mask = 0; mask < 16; mask++) {
    table.push({
      white: WHITE_SETS[mask & 3],
      black: BLACK_SETS[(mask >> 2) & 3],
      whiteKing: (mask & CASTLE_WK) !== 0,
      whiteQueen: (mask & CASTLE_WQ) !== 0,
      blackKing: (mask & CASTLE_BK) !== 0,
      blackQueen: (mask & CASTLE_BQ) !== 0,
      mask,
    });
  }
  return table;
})();

export function getCastlingMask(pos: Position): number {
  if (pos.castlingMask !== undefined) return pos.castlingMask;
  let mask = 0;
  if (pos.castling.white.has(7)) mask |= CASTLE_WK;
  if (pos.castling.white.has(0)) mask |= CASTLE_WQ;
  if (pos.castling.black.has(63)) mask |= CASTLE_BK;
  if (pos.castling.black.has(56)) mask |= CASTLE_BQ;
  return mask;
}

/**
 * Precomputed 128-entry tables for rank-0 (White: 0..63) and rank-7 (Black: 64..127)
 * castling path clearance in Chess960 and standard chess.
 * Single-cycle check: ((CASTLE_PATH_LO[idx] & occ.lo) | (CASTLE_PATH_HI[idx] & occ.hi)) === 0
 */
export const CASTLE_PATH_LO = new Uint32Array(128);
export const CASTLE_PATH_HI = new Uint32Array(128);

export const CASTLE_TRAVERSAL_WHITE: (readonly number[])[] = new Array(64);
export const CASTLE_TRAVERSAL_BLACK: (readonly number[])[] = new Array(64);

for (let kFile = 0; kFile < 8; kFile++) {
  for (let rFile = 0; rFile < 8; rFile++) {
    const idx = (kFile << 3) | rFile;
    if (kFile === rFile) {
      CASTLE_TRAVERSAL_WHITE[idx] = [];
      CASTLE_TRAVERSAL_BLACK[idx] = [];
      continue;
    }
    const isKingSide = rFile > kFile;
    const kLanding = isKingSide ? 6 : 2;
    const rLanding = isKingSide ? 5 : 3;

    // Path clearance: all squares between king/rook and their landings must be empty,
    // excluding initial king and rook squares.
    let rank0Mask = 0;
    const minK = Math.min(kFile, kLanding);
    const maxK = Math.max(kFile, kLanding);
    const minR = Math.min(rFile, rLanding);
    const maxR = Math.max(rFile, rLanding);
    for (let f = 0; f < 8; f++) {
      if (f === kFile || f === rFile) continue;
      if ((f >= minK && f <= maxK) || (f >= minR && f <= maxR)) {
        rank0Mask |= (1 << f) >>> 0;
      }
    }
    // White (index 0..63): rank 0 in lo
    CASTLE_PATH_LO[idx] = rank0Mask >>> 0;
    CASTLE_PATH_HI[idx] = 0;

    // Black (index 64..127): rank 7 in hi (shifted by 24)
    CASTLE_PATH_LO[64 + idx] = 0;
    CASTLE_PATH_HI[64 + idx] = (rank0Mask << 24) >>> 0;

    // Traversal squares: squares king traverses towards landing (excluding kFile)
    const travW: number[] = [];
    const travB: number[] = [];
    if (kLanding !== kFile) {
      const step = kLanding > kFile ? 1 : -1;
      for (let f = kFile + step; ; f += step) {
        travW.push(f);
        travB.push(56 + f);
        if (f === kLanding) break;
      }
    }
    CASTLE_TRAVERSAL_WHITE[idx] = travW;
    CASTLE_TRAVERSAL_BLACK[idx] = travB;
  }
}
