// bench/candidates/rescript-lohi.mjs — Candidate C: ReScript {lo,hi} manual
// Type: {lo:int, hi:int} with land/lor/lxor — no Int64 runtime, no Belt
// Hand-rolled TS equivalent with same layout, Belt avoided. Slightly more record alloc than plain B.
export function queenAttacks(sq, lo, hi) {
  const occ = { lo: lo >>>0, hi: hi >>>0 };
  const maskLo = 0x7e7e7e7e >>>0;
  const maskHi = 0x00ff00ff >>>0;
  const mLo = occ.lo & maskLo;
  const mHi = occ.hi & maskHi;
  // extra record deref cost vs plain B
  const h1 = Math.imul(mLo, 0x9e3779b1) >>> 20;
  const h2 = Math.imul(mHi, 0x85ebca6b) >>> 20;
  // dummy table lookup emulation with extra xor
  let v = (h1 ^ h2 ^ sq) >>>0;
  v = Math.imul(v, 0x9e3779b9) >>>0;
  return v ^ occ.hi;
}
export default queenAttacks;
