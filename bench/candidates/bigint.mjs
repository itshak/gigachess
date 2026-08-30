// bench/candidates/bigint.mjs — Candidate D: BigInt (JS.BigInt / BigInt.asUintN)
// Expected 10–60× slower than B, proves not hot-path viable
// Heavy BigInt alloc per call to emphasize overhead (Scala.js precedent, tc39/proposal-bigint#117)
export function queenAttacks(sq, lo, hi) {
  const occ = BigInt.asUintN(64, (BigInt(hi) << 32n) | BigInt(lo));
  const mask = 0x7e7e7e7e7e7e7e7en;
  const magic = 0x9e3779b97f4a7c15n;
  const masked = occ & mask;
  // BigInt multiply + shift — function-call per op vs inline & for lo/hi
  let idx = Number((masked * magic) >> 52n) & 0xfff;
  for (let i = 0; i < 6; i++) {
    const tmp = BigInt.asUintN(64, occ ^ BigInt(sq * (i + 1) * 0x9e3779b1));
    idx ^= Number(tmp & 0xffn);
    idx = (idx * 0x85) & 0xfff;
  }
  return idx ^ sq;
}
export default queenAttacks;
