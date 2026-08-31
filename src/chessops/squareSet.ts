// src/chessops/squareSet.ts — chessops-exact immutable SquareSet class over
// the engine's {lo,hi} bitboards (ADR-014). Same bit layout: square s is
// `lo` bit s for s < 32, `hi` bit s-32 otherwise; iteration is ascending.
import type { Color, Square } from "./types.js";

export class SquareSet implements Iterable<Square> {
  readonly lo: number;
  readonly hi: number;

  constructor(lo: number, hi: number) {
    // chessops stores lo/hi as SIGNED int32 — coerce identically so `.hi`
    // reads compare equal to chessops (e.g. full() is -1/-1, not 0xffffffff).
    this.lo = lo | 0;
    this.hi = hi | 0;
  }

  static fromSquare(square: Square): SquareSet {
    return square < 32 ? new SquareSet(1 << square, 0) : new SquareSet(0, 1 << (square - 32));
  }
  static fromRank(rank: number): SquareSet {
    return new SquareSet(0xff << (8 * rank), 0);
  }
  static fromFile(file: number): SquareSet {
    return new SquareSet(0x01010101 << file, 0x01010101 << file);
  }
  static empty(): SquareSet {
    return new SquareSet(0, 0);
  }
  static full(): SquareSet {
    return new SquareSet(0xffffffff, 0xffffffff);
  }
  static corners(): SquareSet {
    return new SquareSet(0x81, 0x81000000);
  }
  static center(): SquareSet {
    return new SquareSet(0x18000000, 0x18); // d4, e4, d5, e5
  }
  static backranks(): SquareSet {
    return new SquareSet(0xff, 0xff000000); // a1-h1 + a8-h8
  }
  static backrank(color: Color): SquareSet {
    return color === "white" ? new SquareSet(0xff, 0) : new SquareSet(0, 0xff000000);
  }
  static lightSquares(): SquareSet {
    return new SquareSet(0x55aa55aa, 0x55aa55aa);
  }
  static darkSquares(): SquareSet {
    return new SquareSet(0xaa55aa55, 0xaa55aa55);
  }

  complement(): SquareSet {
    return new SquareSet(~this.lo, ~this.hi);
  }
  xor(other: SquareSet): SquareSet {
    return new SquareSet(this.lo ^ other.lo, this.hi ^ other.hi);
  }
  union(other: SquareSet): SquareSet {
    return new SquareSet(this.lo | other.lo, this.hi | other.hi);
  }
  intersect(other: SquareSet): SquareSet {
    return new SquareSet(this.lo & other.lo, this.hi & other.hi);
  }
  diff(other: SquareSet): SquareSet {
    return new SquareSet(this.lo & ~other.lo, this.hi & ~other.hi);
  }
  intersects(other: SquareSet): boolean {
    return (this.hi & other.hi) !== 0 || (this.lo & other.lo) !== 0;
  }
  isDisjoint(other: SquareSet): boolean {
    return !this.intersects(other);
  }
  supersetOf(other: SquareSet): boolean {
    return other.subsetOf(this);
  }
  subsetOf(other: SquareSet): boolean {
    return (this.lo & ~other.lo) === 0 && (this.hi & ~other.hi) === 0;
  }
  shr64(shift: number): SquareSet {
    if (shift === 0) return this;
    if (shift >= 64) return SquareSet.empty();
    if (shift >= 32) return new SquareSet(this.hi >>> (shift - 32), 0);
    return new SquareSet((this.lo >>> shift) | (this.hi << (32 - shift)), this.hi >>> shift);
  }
  shl64(shift: number): SquareSet {
    if (shift === 0) return this;
    if (shift >= 64) return SquareSet.empty();
    if (shift >= 32) return new SquareSet(0, this.lo << (shift - 32));
    return new SquareSet(this.lo << shift, (this.hi << shift) | (this.lo >>> (32 - shift)));
  }
  bswap64(): SquareSet {
    const b = (x: number) =>
      ((x >>> 24) & 0xff) | ((x >>> 8) & 0xff00) | ((x << 8) & 0xff0000) | ((x << 24) & 0xff000000);
    return new SquareSet(b(this.hi), b(this.lo));
  }
  rbit64(): SquareSet {
    // reverse all 64 bits
    const lo = this.lo >>> 0, hi = this.hi >>> 0;
    let outLo = 0, outHi = 0;
    for (let i = 0; i < 32; i++) {
      if ((lo >>> i) & 1) outHi = (outHi | (1 << (31 - i))) >>> 0;
      if ((hi >>> i) & 1) outLo = (outLo | (1 << (31 - i))) >>> 0;
    }
    return new SquareSet(outLo, outHi);
  }
  minus64(other: SquareSet): SquareSet {
    // 64-bit integer subtraction a - b (signed representation, chessops-exact)
    const lo = this.lo - other.lo;
    const hi = this.hi - other.hi - (this.lo < other.lo ? 1 : 0);
    return new SquareSet(lo, hi);
  }
  equals(other: SquareSet): boolean {
    return this.lo === other.lo && this.hi === other.hi;
  }
  size(): number {
    // unsigned popcount (lo/hi may hold signed int32 representations)
    let v = this.lo >>> 0;
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    let n = ((v + (v >>> 4)) & 0x0f0f0f0f) % 255;
    let w = this.hi >>> 0;
    w = w - ((w >>> 1) & 0x55555555);
    w = (w & 0x33333333) + ((w >>> 2) & 0x33333333);
    n += ((w + (w >>> 4)) & 0x0f0f0f0f) % 255;
    return n;
  }
  isEmpty(): boolean {
    return this.lo === 0 && this.hi === 0;
  }
  nonEmpty(): boolean {
    return !this.isEmpty();
  }
  has(square: Square): boolean {
    return square < 32 ? ((this.lo >>> square) & 1) !== 0 : ((this.hi >>> (square - 32)) & 1) !== 0;
  }
  set(square: Square, on: boolean): SquareSet {
    return on ? this.with(square) : this.without(square);
  }
  with(square: Square): SquareSet {
    return square < 32
      ? new SquareSet(this.lo | (1 << square), this.hi)
      : new SquareSet(this.lo, this.hi | (1 << (square - 32)));
  }
  without(square: Square): SquareSet {
    return square < 32
      ? new SquareSet(this.lo & ~(1 << square), this.hi)
      : new SquareSet(this.lo, this.hi & ~(1 << (square - 32)));
  }
  toggle(square: Square): SquareSet {
    return square < 32
      ? new SquareSet(this.lo ^ (1 << square), this.hi)
      : new SquareSet(this.lo, this.hi ^ (1 << (square - 32)));
  }
  last(): Square | undefined {
    if (this.hi !== 0) return 32 + (31 - Math.clz32(this.hi));
    if (this.lo !== 0) return 31 - Math.clz32(this.lo);
    return undefined;
  }
  first(): Square | undefined {
    if (this.lo !== 0) return 31 - Math.clz32((this.lo & -this.lo) >>> 0);
    if (this.hi !== 0) return 32 + (31 - Math.clz32((this.hi & -this.hi) >>> 0));
    return undefined;
  }
  withoutFirst(): SquareSet {
    const first = this.first();
    return first === undefined ? this : this.without(first);
  }
  moreThanOne(): boolean {
    return (this.hi !== 0 && this.lo !== 0) || ((this.lo & (this.lo - 1)) >>> 0) !== 0 || ((this.hi & (this.hi - 1)) >>> 0) !== 0;
  }
  singleSquare(): Square | undefined {
    return this.moreThanOne() ? undefined : this.first();
  }
  *[Symbol.iterator](): Iterator<Square> {
    let lo = this.lo, hi = this.hi;
    while (lo !== 0) {
      const lsb = (lo & -lo) >>> 0;
      yield 31 - Math.clz32(lsb);
      lo = (lo ^ lsb) >>> 0;
    }
    while (hi !== 0) {
      const lsb = (hi & -hi) >>> 0;
      yield 32 + (31 - Math.clz32(lsb));
      hi = (hi ^ lsb) >>> 0;
    }
  }
  *reversed(): Iterable<Square> {
    for (let s = 63; s >= 0; s--) if (this.has(s)) yield s;
  }
}

