// src/attacks.ts — leaper tables + fancy per-square Black Magic sliding
// (lazily loaded from generated base64 blobs) via bench/magic-tables
// MIT gigachess, clean-room from specs + FIDE notes (no G P L)

import * as sq from "./squareSet.js";
import type { SquareSet } from "./squareSet.js";
import { Color } from "./types.js";
import { squareFile, squareRank } from "./util.js";

// ---------- low-level 32-bit helpers for 64-bit multiply without 64-bit type ----------
function mul32To64(a: number, b: number): { lo: number; hi: number } {
  const aLow = a & 0xffff;
  const aHigh = a >>> 16;
  const bLow = b & 0xffff;
  const bHigh = b >>> 16;
  const p0 = aLow * bLow;
  const p1 = aLow * bHigh;
  const p2 = aHigh * bLow;
  const p3 = aHigh * bHigh;
  const mid = p1 + p2;
  const midLow = mid & 0xffff;
  const midHigh = mid >>> 16;
  // lo = p0 + (midLow <<16), with carry to hi
  const loAdd = (midLow << 16) >>> 0;
  const lo = (p0 + loAdd) >>> 0;
  const carry = lo < (p0 >>> 0) ? 1 : 0;
  const hi = (p3 + midHigh + carry) >>> 0;
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

function wrappingMul64(aLo: number, aHi: number, bLo: number, bHi: number): { lo: number; hi: number } {
  // low 64 bits of 64x64 -> 64
  // a = aHi*2^32 + aLo, b = bHi*2^32 + bLo
  // product = aLo*bLo + (aHi*bLo + aLo*bHi)*2^32 + aHi*bHi*2^64 (overflow beyond 64 discards)
  const pLL = mul32To64(aLo >>> 0, bLo >>> 0);
  const pHL = mul32To64(aHi >>> 0, bLo >>> 0);
  const pLH = mul32To64(aLo >>> 0, bHi >>> 0);
  // pLL.lo is final lo, pLL.hi + pHL.lo + pLH.lo is final hi (plus carry from lo addition? already inside pLL)
  // Need to add cross terms to hi with carry handling
  let hi = (pLL.hi + pHL.lo + pLH.lo) >>> 0;
  // carry from adding pHL.lo + pLH.lo overflow is wrapped via >>>0, fine for 32-bit wrapping
  // Note: pHL.hi and pLH.hi are beyond 64 bits (shift 64) so discarded
  return { lo: pLL.lo >>> 0, hi: hi >>> 0 };
}

function mul64Shift(occLo: number, occHi: number, magLo: number, magHi: number, shift: number): number {
  const prod = wrappingMul64(occLo >>> 0, occHi >>> 0, magLo >>> 0, magHi >>> 0);
  if (shift < 32) {
    // product >> shift, low 32 bits
    const res = (prod.lo >>> shift) | (prod.hi << (32 - shift));
    return res >>> 0;
  } else {
    const res = prod.hi >>> (shift - 32);
    return res >>> 0;
  }
}

// ---------- Leaper tables ----------
const KNIGHT_DELTAS: [number, number][] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_DELTAS: [number, number][] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

function makeKnightTable(): SquareSet[] {
  const t: SquareSet[] = new Array(64);
  for (let sqIdx = 0; sqIdx < 64; sqIdx++) {
    const f = squareFile(sqIdx);
    const r = squareRank(sqIdx);
    let lo = 0, hi = 0;
    for (const [df, dr] of KNIGHT_DELTAS) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        const ns = nr * 8 + nf;
        if (ns < 32) lo |= (1 << ns) >>> 0;
        else hi |= (1 << (ns - 32)) >>> 0;
      }
    }
    t[sqIdx] = { lo: lo >>> 0, hi: hi >>> 0 };
  }
  return t;
}

function makeKingTable(): SquareSet[] {
  const t: SquareSet[] = new Array(64);
  for (let sqIdx = 0; sqIdx < 64; sqIdx++) {
    const f = squareFile(sqIdx);
    const r = squareRank(sqIdx);
    let lo = 0, hi = 0;
    for (const [df, dr] of KING_DELTAS) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        const ns = nr * 8 + nf;
        if (ns < 32) lo |= (1 << ns) >>> 0;
        else hi |= (1 << (ns - 32)) >>> 0;
      }
    }
    t[sqIdx] = { lo: lo >>> 0, hi: hi >>> 0 };
  }
  return t;
}

function makePawnTable(): SquareSet[][] {
  // pawnAttacks[color][sq] -> SquareSet of squares attacked by pawn on sq
  const t: SquareSet[][] = [[], []];
  for (let c = 0; c < 2; c++) {
    const arr: SquareSet[] = new Array(64);
    for (let sqIdx = 0; sqIdx < 64; sqIdx++) {
      const f = squareFile(sqIdx);
      const r = squareRank(sqIdx);
      let lo = 0, hi = 0;
      const dir = c === Color.White ? 1 : -1;
      const nr = r + dir;
      if (nr >= 0 && nr < 8) {
        for (const df of [-1, 1]) {
          const nf = f + df;
          if (nf >= 0 && nf < 8) {
            const ns = nr * 8 + nf;
            if (ns < 32) lo |= (1 << ns) >>> 0;
            else hi |= (1 << (ns - 32)) >>> 0;
          }
        }
      }
      arr[sqIdx] = { lo: lo >>> 0, hi: hi >>> 0 };
    }
    t[c] = arr;
  }
  return t;
}

const knightTable: SquareSet[] = makeKnightTable();
const kingTable: SquareSet[] = makeKingTable();
const pawnTable: SquareSet[][] = makePawnTable();

export function knightAttacks(sqIdx: number): SquareSet {
  return knightTable[sqIdx];
}
export function kingAttacks(sqIdx: number): SquareSet {
  return kingTable[sqIdx];
}
export function pawnAttacks(color: Color, sqIdx: number): SquareSet {
  return pawnTable[color][sqIdx];
}

// ---------- Black Magic sliding (fancy per-square, lazily loaded) ----------
// The shipped tables are FANCY per-square variable-shift Black Magic
// (measured per-square shifts: rook 52–54, bishop 55–59; flat tables
// rook 102,400 + bishop 5,248 = 107,648 entries — the classic fancy totals;
// the earlier "plain fixed-shift uniform 11" comment was stale). They are
// stored as base64 Uint8Array blobs decoded into Uint32Array lo/hi views at
// load time (task 3.1/3.2, change purechess-gates-green):
//   - size: ~841 KB raw / ~26 KB gz binary vs 3,373 KB of object-literal text
//   - load: ~0.1 ms typed-array decode vs 82 ms materializing 107,648 objects
//   - speed: 35.1 vs 30.0 MAttacks/s (indexed typed-array reads beat object
//     property loads) — see bench/results/real-2026-08-30.md appendix.
//
// The table modules are NEVER in the static import graph of `gigachess/core`
// (bundle gate): they load via dynamic `import()` behind
// `ensureMagicTablesLoaded()`. Until loaded — or if loading fails — the naive
// ray-walk fallback serves; it is measured at 1.66× baseline, so a
// baseline-beating guarantee holds from the very first call. Each attack call
// returns a FRESH `{lo, hi}` object: typed-array storage removes the
// shared-mutable-entry aliasing hazard of the old object table (ADR-012 §4)
// and is measured faster despite the per-call allocation.
//
// Endianness: the blob is emitted/decoded as native little-endian uint32
// words (all supported platforms: x86-64 and arm64 are little-endian).

type MagicViews = { meta: Uint32Array; attacks: Uint32Array };
const MAGIC_META_STRIDE = 6; // per square: maskLo, maskHi, magicLo, magicHi, shift, offset
const MAGIC_META_WORDS = 64 * MAGIC_META_STRIDE;

let rookViews: MagicViews | null = null;
let bishopViews: MagicViews | null = null;
let tablesLoadPromise: Promise<void> | null = null;

function decodeMagicViews(b64: string): Promise<MagicViews> {
  const bin = atob(b64);
  const gzBytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) gzBytes[i] = bin.charCodeAt(i);
  // gzip-decompress via DecompressionStream (Node 18+/all modern browsers —
  // the package requires Node ≥22.5). On the rare platform without it, the
  // load fails and the naive fallback keeps serving (never slower than
  // baseline), so no hard dependency is introduced.
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DS) return Promise.reject(new Error("DecompressionStream unavailable"));
  const stream = new Blob([gzBytes]).stream().pipeThrough(new DS("gzip"));
  return new Response(stream).arrayBuffer().then((buf) => {
    const words = new Uint32Array(buf);
    return {
      meta: words.subarray(0, MAGIC_META_WORDS),
      attacks: words.subarray(MAGIC_META_WORDS),
    };
  });
}

/**
 * Lazy-load hook (task 3.3): dynamically imports the generated blob modules,
 * decodes them into Uint32Array views, and swaps the sliding-attack path from
 * the naive fallback to the magic tables. Idempotent and concurrency-safe:
 * concurrent callers share one in-flight load. Callers may `await` it or
 * fire-and-forget (pre-warm at app startup, non-blocking); until it resolves,
 * the naive ray-walk fallback serves and stays ≥1.5× baseline.
 */
export function ensureMagicTablesLoaded(): Promise<void> {
  if (tablesLoadPromise === null) {
    tablesLoadPromise = Promise.all([
      import("./rookMagicBlob.js"),
      import("./bishopMagicBlob.js"),
    ])
      .then(([r, b]) => Promise.all([decodeMagicViews(r.rookMagicBlob), decodeMagicViews(b.bishopMagicBlob)]))
      .then(([rv, bv]) => {
        rookViews = rv;
        bishopViews = bv;
      });
    // fire-and-forget callers must not trigger an unhandled-rejection warning;
    // awaiting callers still observe the original rejection via the returned
    // promise (same reference).
    tablesLoadPromise.catch(() => {});
  }
  return tablesLoadPromise;
}

/** Whether the magic tables are loaded (false ⇒ naive fallback in use). */
export function magicTablesLoaded(): boolean {
  return rookViews !== null && bishopViews !== null;
}

// ---------- sliding attacks via magic (blob views) or naive fallback ----------
export function bishopAttacks(sqIdx: number, occupied: SquareSet): SquareSet {
  // Until the blob tables load (ensureMagicTablesLoaded), the naive ray-walk
  // fallback serves — measured 1.66× baseline, never slower than baseline.
  const v = bishopViews;
  if (v === null) return bishopAttacksNaive(sqIdx, occupied);
  const b = sqIdx * MAGIC_META_STRIDE;
  // inline mask intersection (no intermediate SquareSet allocation)
  const occLo = occupied.lo & v.meta[b];
  const occHi = occupied.hi & v.meta[b + 1];
  const idx = (mul64Shift(occLo, occHi, v.meta[b + 2], v.meta[b + 3], v.meta[b + 4]) + v.meta[b + 5]) >>> 0;
  // fresh {lo, hi} per call — no shared mutable table entries (ADR-012 §4)
  return { lo: v.attacks[idx * 2], hi: v.attacks[idx * 2 + 1] };
}

export function rookAttacks(sqIdx: number, occupied: SquareSet): SquareSet {
  const v = rookViews;
  if (v === null) return rookAttacksNaive(sqIdx, occupied);
  const b = sqIdx * MAGIC_META_STRIDE;
  const occLo = occupied.lo & v.meta[b];
  const occHi = occupied.hi & v.meta[b + 1];
  const idx = (mul64Shift(occLo, occHi, v.meta[b + 2], v.meta[b + 3], v.meta[b + 4]) + v.meta[b + 5]) >>> 0;
  return { lo: v.attacks[idx * 2], hi: v.attacks[idx * 2 + 1] };
}

export function queenAttacks(sqIdx: number, occupied: SquareSet): SquareSet {
  return sq.or(bishopAttacks(sqIdx, occupied), rookAttacks(sqIdx, occupied));
}

// Naive fallback for correctness verification and when tables missing
function slidingNaive(sqIdx: number, occupied: SquareSet, deltas: [number, number][]): SquareSet {
  const f0 = squareFile(sqIdx);
  const r0 = squareRank(sqIdx);
  let lo = 0, hi = 0;
  for (const [df, dr] of deltas) {
    let f = f0 + df, r = r0 + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const ns = r * 8 + f;
      if (ns < 32) lo |= (1 << ns) >>> 0;
      else hi |= (1 << (ns - 32)) >>> 0;
      if (sq.has(occupied, ns)) break;
      f += df; r += dr;
    }
  }
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

const ROOK_DELTAS: [number, number][] = [[1,0],[-1,0],[0,1],[0,-1]];
const BISHOP_DELTAS: [number, number][] = [[1,1],[1,-1],[-1,1],[-1,-1]];

function bishopAttacksNaive(sqIdx: number, occ: SquareSet): SquareSet {
  return slidingNaive(sqIdx, occ, BISHOP_DELTAS);
}
function rookAttacksNaive(sqIdx: number, occ: SquareSet): SquareSet {
  return slidingNaive(sqIdx, occ, ROOK_DELTAS);
}

// Export naive for testing parity
export const _naive = { bishopAttacksNaive, rookAttacksNaive };

// ---------- ray / between (precomputed 64x64 flat tables) ----------
function rayNaive(from: number, to: number): SquareSet {
  const ff = squareFile(from), rf = squareRank(from);
  const tf = squareFile(to), rt = squareRank(to);
  const df = tf - ff, dr = rt - rf;
  // check aligned: rank, file, diagonal
  if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return sq.empty();
  const stepF = df === 0 ? 0 : df > 0 ? 1 : -1;
  const stepR = dr === 0 ? 0 : dr > 0 ? 1 : -1;
  let lo = 0, hi = 0;
  let f = ff, r = rf;
  while (true) {
    const ns = r * 8 + f;
    if (ns < 32) lo |= (1 << ns) >>> 0;
    else hi |= (1 << (ns - 32)) >>> 0;
    if (f === tf && r === rt) break;
    f += stepF; r += stepR;
    if (f < 0 || f >= 8 || r < 0 || r >= 8) break;
  }
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

const RAY_LO = new Uint32Array(4096);
const RAY_HI = new Uint32Array(4096);
const BETWEEN_LO = new Uint32Array(4096);
const BETWEEN_HI = new Uint32Array(4096);

for (let i = 0; i < 64; i++) {
  for (let j = 0; j < 64; j++) {
    const idx = (i << 6) | j;
    const r = rayNaive(i, j);
    RAY_LO[idx] = r.lo;
    RAY_HI[idx] = r.hi;
    if (r.lo !== 0 || r.hi !== 0) {
      const b = sq.minus(sq.minus(r, sq.singleton(i)), sq.singleton(j));
      BETWEEN_LO[idx] = b.lo;
      BETWEEN_HI[idx] = b.hi;
    }
  }
}

export function ray(from: number, to: number): SquareSet {
  const idx = ((from & 63) << 6) | (to & 63);
  return { lo: RAY_LO[idx], hi: RAY_HI[idx] };
}

export function between(from: number, to: number): SquareSet {
  const idx = ((from & 63) << 6) | (to & 63);
  return { lo: BETWEEN_LO[idx], hi: BETWEEN_HI[idx] };
}

export const LINE_RAY_LO = new Uint32Array(4096);
export const LINE_RAY_HI = new Uint32Array(4096);

for (let i = 0; i < 64; i++) {
  const f1 = i & 7, r1 = i >> 3;
  for (let j = 0; j < 64; j++) {
    if (i === j) continue;
    const f2 = j & 7, r2 = j >> 3;
    const df = f2 - f1, dr = r2 - r1;
    if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) continue;
    const stepF = df === 0 ? 0 : df > 0 ? 1 : -1;
    const stepR = dr === 0 ? 0 : dr > 0 ? 1 : -1;
    let lo = 0, hi = 0;
    let f = f1, r = r1;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const s = (r << 3) | f;
      if (s < 32) lo |= (1 << s) >>> 0;
      else hi |= (1 << (s - 32)) >>> 0;
      f += stepF; r += stepR;
    }
    f = f1 - stepF; r = r1 - stepR;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const s = (r << 3) | f;
      if (s < 32) lo |= (1 << s) >>> 0;
      else hi |= (1 << (s - 32)) >>> 0;
      f -= stepF; r -= stepR;
    }
    const idx = (i << 6) | j;
    LINE_RAY_LO[idx] = lo >>> 0;
    LINE_RAY_HI[idx] = hi >>> 0;
  }
}

export function lineRay(from: number, to: number): SquareSet {
  const idx = ((from & 63) << 6) | (to & 63);
  return { lo: LINE_RAY_LO[idx], hi: LINE_RAY_HI[idx] };
}

// ---------- isAttacked / kingAttackers ----------
/**
 * All pieces of `attacker` color attacking `square`. `occ` overrides the
 * occupancy used for slider rays (hot-loop variant: king-safety masks
 * evaluate attackedness with the moving king removed from the occupancy so
 * that sliders x-raying the king stay "attacking" through its old square).
 */
export function attackersTo(
  board: import("./board.js").BoardLike,
  square: number,
  attacker: Color,
  occ: SquareSet = board.occupied,
): SquareSet {
  // Inlined 32-bit {lo,hi} bitwise math (spec: zero intermediate SquareSet
  // allocations in the attack hot paths). Semantics identical to the previous
  // sq.and/sq.or composition: attackers = attackerOcc & roleSet & attackSet.
  const w = attacker === Color.White;
  const aLo = (w ? board.white.lo : board.black.lo) >>> 0;
  const aHi = (w ? board.white.hi : board.black.hi) >>> 0;
  // pawn origins: pawnAttacks(opposite, square) mirrors the attacker pawns that hit square
  const pAtt = pawnAttacks(w ? Color.Black : Color.White, square);
  let lo = (aLo & board.pawn.lo & pAtt.lo) >>> 0;
  let hi = (aHi & board.pawn.hi & pAtt.hi) >>> 0;
  const nAtt = knightAttacks(square);
  lo = (lo | (aLo & board.knight.lo & nAtt.lo)) >>> 0;
  hi = (hi | (aHi & board.knight.hi & nAtt.hi)) >>> 0;
  const bqLo = (board.bishop.lo | board.queen.lo) >>> 0;
  const bqHi = (board.bishop.hi | board.queen.hi) >>> 0;
  const bAtt = bishopAttacks(square, occ);
  lo = (lo | (aLo & bqLo & bAtt.lo)) >>> 0;
  hi = (hi | (aHi & bqHi & bAtt.hi)) >>> 0;
  const rqLo = (board.rook.lo | board.queen.lo) >>> 0;
  const rqHi = (board.rook.hi | board.queen.hi) >>> 0;
  const rAtt = rookAttacks(square, occ);
  lo = (lo | (aLo & rqLo & rAtt.lo)) >>> 0;
  hi = (hi | (aHi & rqHi & rAtt.hi)) >>> 0;
  const kAtt = kingAttacks(square);
  lo = (lo | (aLo & board.king.lo & kAtt.lo)) >>> 0;
  hi = (hi | (aHi & board.king.hi & kAtt.hi)) >>> 0;
  return { lo, hi };
}

export function isAttacked(board: import("./board.js").BoardLike, square: number, attacker: Color): boolean {
  // Inlined bitwise attack test (spec: no intermediate SquareSet allocations).
  // A pawn of `attacker` attacks `square` iff it stands on a square returned by
  // pawnAttacks(opposite color, square) (the mirror of the forward attack set).
  const w = attacker === Color.White;
  const aLo = (w ? board.white.lo : board.black.lo) >>> 0;
  const aHi = (w ? board.white.hi : board.black.hi) >>> 0;
  const pAtt = pawnAttacks(w ? Color.Black : Color.White, square);
  if ((((aLo & board.pawn.lo & pAtt.lo) | (aHi & board.pawn.hi & pAtt.hi)) >>> 0) !== 0) return true;
  const nAtt = knightAttacks(square);
  if ((((aLo & board.knight.lo & nAtt.lo) | (aHi & board.knight.hi & nAtt.hi)) >>> 0) !== 0) return true;
  const occ = board.occupied;
  const bqLo = (board.bishop.lo | board.queen.lo) >>> 0;
  const bqHi = (board.bishop.hi | board.queen.hi) >>> 0;
  const bAtt = bishopAttacks(square, occ);
  if ((((aLo & bqLo & bAtt.lo) | (aHi & bqHi & bAtt.hi)) >>> 0) !== 0) return true;
  const rqLo = (board.rook.lo | board.queen.lo) >>> 0;
  const rqHi = (board.rook.hi | board.queen.hi) >>> 0;
  const rAtt = rookAttacks(square, occ);
  if ((((aLo & rqLo & rAtt.lo) | (aHi & rqHi & rAtt.hi)) >>> 0) !== 0) return true;
  const kAtt = kingAttacks(square);
  if ((((aLo & board.king.lo & kAtt.lo) | (aHi & board.king.hi & kAtt.hi)) >>> 0) !== 0) return true;
  return false;
}

export function kingAttackers(board: import("./board.js").BoardLike, kingColor: Color): SquareSet {
  const ks = kingColor === Color.White ? sq.and(board.white, board.king) : sq.and(board.black, board.king);
  const ksq = sq.first(ks);
  if (ksq === undefined) return sq.empty();
  const attacker = kingColor === Color.White ? Color.Black : Color.White;
  // Inlined delegation: the attacker-set composition is exactly attackersTo
  // over the full occupancy (no intermediate SquareSet allocations here).
  return attackersTo(board, ksq, attacker);
}

// For testing sliding correctness
export function rookAttacksForTest(sqIdx: number, occ: SquareSet): SquareSet {
  return rookAttacks(sqIdx, occ);
}
export function bishopAttacksForTest(sqIdx: number, occ: SquareSet): SquareSet {
  return bishopAttacks(sqIdx, occ);
}
