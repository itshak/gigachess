// bench/candidates/hq.mjs — Candidate A: chessops HQ baseline (REAL, not synthetic)
// Thin wrapper over chessops attack generation (hyperbola quintessence, MIT RecklessMagics not used here).
// This is the TRUE HQ used by chessops@0.15.1 in production — verifies that Black Magic can beat it.
import { queenAttacks as chessopsQueenAttacks } from "../../node_modules/chessops/dist/esm/attacks.js";
import { SquareSet } from "../../node_modules/chessops/dist/esm/squareSet.js";

export function queenAttacks(sq, lo, hi) {
  // chessops queenAttacks(square, occupied: SquareSet) -> SquareSet
  // We measure the full cost incl. SquareSet allocation + hyperbola (minus64 + bswap per ray)
  const occ = new SquareSet(lo, hi);
  const attacks = chessopsQueenAttacks(sq, occ);
  // Prevent DCE: return xor of lo/hi so V8 cannot elide call
  return (attacks.lo ^ attacks.hi) >>> 0;
}
export default queenAttacks;
