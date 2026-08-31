// src/squareSet.ts — {lo,hi} pair, pure ops, target ES2020
// Language-neutral spec: lo bits 0..31 -> A1..H4, hi bits 0..31 -> A5..H8
// MIT turbochess, clean-room from specs + FIDE notes + magic-bits/RecklessMagics JSON (no G P L)

export type SquareSet = {
  readonly lo: number;
  readonly hi: number;
};

/**
 * Mutable {lo,hi} view for hot-loop scratch buffers (see the WritableBoard FP
 * policy in board.ts). Assignable to SquareSet (readonly is assignability-
 * neutral in TS), so scratch boards flow through Board-typed parameters while
 * their owning hot loop may write the bitfields in place, allocation-free.
 * MutableSquareSet values must NEVER escape the hot loop that owns them.
 */
export type MutableSquareSet = {
  lo: number;
  hi: number;
};

// Constants — note >>>0 ensures unsigned 32
export const EMPTY: SquareSet = { lo: 0, hi: 0 } as const;
export const FULL: SquareSet = { lo: 0xffffffff >>> 0, hi: 0xffffffff >>> 0 } as const;

export function empty(): SquareSet {
  return { lo: 0, hi: 0 };
}

export function full(): SquareSet {
  return { lo: 0xffffffff >>> 0, hi: 0xffffffff >>> 0 };
}

export function singleton(sq: number): SquareSet {
  if (sq < 32) return { lo: (1 << sq) >>> 0, hi: 0 };
  return { lo: 0, hi: (1 << (sq - 32)) >>> 0 };
}

export function has(set: SquareSet, sq: number): boolean {
  if (sq < 32) return (set.lo & (1 << sq)) !== 0;
  return (set.hi & (1 << (sq - 32))) !== 0;
}

export function and(a: SquareSet, b: SquareSet): SquareSet {
  return { lo: (a.lo & b.lo) >>> 0, hi: (a.hi & b.hi) >>> 0 };
}

export function or(a: SquareSet, b: SquareSet): SquareSet {
  return { lo: (a.lo | b.lo) >>> 0, hi: (a.hi | b.hi) >>> 0 };
}

export function xor(a: SquareSet, b: SquareSet): SquareSet {
  return { lo: (a.lo ^ b.lo) >>> 0, hi: (a.hi ^ b.hi) >>> 0 };
}

export function not(a: SquareSet): SquareSet {
  return { lo: (~a.lo) >>> 0, hi: (~a.hi) >>> 0 };
}

export function complement(a: SquareSet): SquareSet {
  return not(a);
}

export function minus(a: SquareSet, b: SquareSet): SquareSet {
  return and(a, not(b));
}

export function shl(set: SquareSet, n: number): SquareSet {
  if (n === 0) return { lo: set.lo >>> 0, hi: set.hi >>> 0 };
  if (n < 0 || n >= 64) return empty();
  if (n < 32) {
    const lo = (set.lo << n) >>> 0;
    const hi = (((set.hi << n) >>> 0) | (set.lo >>> (32 - n))) >>> 0;
    return { lo, hi };
  }
  // 32 <= n < 64
  const hi = (set.lo << (n - 32)) >>> 0;
  return { lo: 0, hi };
}

export function shr(set: SquareSet, n: number): SquareSet {
  if (n === 0) return { lo: set.lo >>> 0, hi: set.hi >>> 0 };
  if (n < 0 || n >= 64) return empty();
  if (n < 32) {
    const hi = set.hi >>> n;
    const lo = (((set.lo >>> n) | (set.hi << (32 - n))) >>> 0);
    return { lo: lo >>> 0, hi: hi >>> 0 };
  }
  const lo = set.hi >>> (n - 32);
  return { lo: lo >>> 0, hi: 0 };
}

function popcnt32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  // Math.imul keeps the multiply in exact int32 domain (the old `*` went
  // through double-precision and cost a ToNumber round-trip in V8).
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

export function popcount(set: SquareSet): number {
  return popcnt32(set.lo >>> 0) + popcnt32(set.hi >>> 0);
}

// alias per spec table
export const popcnt = popcount;

export function first(set: SquareSet): number | undefined {
  if (set.lo !== 0) {
    const lo = set.lo >>> 0;
    // isolate lowest bit
    const lsb = (lo & -lo) >>> 0;
    return 31 - Math.clz32(lsb);
  }
  if (set.hi !== 0) {
    const hi = set.hi >>> 0;
    const lsb = (hi & -hi) >>> 0;
    return 32 + (31 - Math.clz32(lsb));
  }
  return undefined;
}

export function moreThanOne(set: SquareSet): boolean {
  // fast path without full popcnt
  const lo = set.lo >>> 0;
  const hi = set.hi >>> 0;
  // if both halves have bits -> at least 2?
  // but need precisely >1
  // check if lo has >1 or hi has >1 or both have >=1
  if (lo !== 0 && hi !== 0) return true;
  const v = lo !== 0 ? lo : hi;
  return (v & (v - 1)) !== 0;
}

export function isEmpty(set: SquareSet): boolean {
  return set.lo === 0 && set.hi === 0;
}

export function isNonEmpty(set: SquareSet): boolean {
  return !isEmpty(set);
}

export function equals(a: SquareSet, b: SquareSet): boolean {
  return (a.lo >>> 0) === (b.lo >>> 0) && (a.hi >>> 0) === (b.hi >>> 0);
}

export function* iter(set: SquareSet): Iterable<number> {
  let cur: SquareSet = { lo: set.lo >>> 0, hi: set.hi >>> 0 };
  let sq: number | undefined;
  while ((sq = first(cur)) !== undefined) {
    yield sq;
    cur = minus(cur, singleton(sq));
  }
}

/**
 * Non-generator square iteration for hot loops. `iter` allocates 2 objects per
 * square (minus + singleton) plus the generator machinery; this allocates
 * nothing. Prefer `forEachSquare` over `for...of sq.iter(...)` wherever the
 * callback can be a plain statement (see board.ts FP policy).
 */
export function forEachSquare(set: SquareSet, fn: (sqIdx: number) => void): void {
  let lo = set.lo >>> 0;
  while (lo !== 0) {
    const lsb = (lo & -lo) >>> 0;
    fn(31 - Math.clz32(lsb));
    lo ^= lsb;
  }
  let hi = set.hi >>> 0;
  while (hi !== 0) {
    const lsb = (hi & -hi) >>> 0;
    fn(32 + (31 - Math.clz32(lsb)));
    hi ^= lsb;
  }
}

// convenience for between/ray
export function size(set: SquareSet): number {
  return popcount(set);
}

// diff / without helpers
export function diff(a: SquareSet, b: SquareSet): SquareSet {
  return minus(a, b);
}

// for debugging / compat
export function toString(set: SquareSet): string {
  return `{ lo: 0x${(set.lo >>> 0).toString(16).padStart(8, "0")}, hi: 0x${(set.hi >>> 0).toString(16).padStart(8, "0")} }`;
}
