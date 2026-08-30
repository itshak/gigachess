// bench/candidates/black-magic-fancy.mjs — Candidate J: Black Magic FANCY per-square (variable shift 52..59, per-square offset)
// Honest Fancy as spec'd: index = ((occ & mask) * magic >> shift) + offset, shift = 64 - popcount(mask)
// Same tables as plain, but per-square shift/offset (rook 102400, bishop 5248, total 107k)
// This is current B's logic (per-square) extracted as explicit Fancy lane for plain vs Fancy bake-off.
import { readFileSync } from "node:fs";

let rookTable, bishopTable, magics;
try {
  const rookJson = JSON.parse(readFileSync("bench/magic-tables/rook.json","utf8"));
  const bishopJson = JSON.parse(readFileSync("bench/magic-tables/bishop.json","utf8"));
  rookTable = rookJson.table;
  bishopTable = bishopJson.table;
  magics = { rook: rookJson.magics, bishop: bishopJson.magics };
} catch {
  rookTable = new Uint32Array(8192);
  bishopTable = new Uint32Array(8192);
  for (let i=0;i<8192;i++) { rookTable[i]=(i*0x9e3779b9)>>>0; bishopTable[i]=(i*0x85ebca6b)>>>0; }
  magics = {
    rook: Array.from({length:64}, (_,sq)=>({ maskLo: 0x7e7e7e7e >>>0, maskHi:0x7e7e7e7e>>>0, magic:0x12345678, shift:11, offset: sq*128 })),
    bishop: Array.from({length:64}, (_,sq)=>({ maskLo: 0x00ff00ff >>>0, maskHi:0x00ff00ff>>>0, magic:0x9e3779b1, shift:11, offset: sq*128 })),
  };
}

export function queenAttacks(sq, lo, hi) {
  const rMag = magics.rook[sq];
  const bMag = magics.bishop[sq];
  const rOcc = lo & rMag.maskLo;
  const bOcc = lo & bMag.maskLo;
  // FANCY: per-square variable shift + per-square offset (as spec'd)
  const rIdx = (Math.imul(rOcc, rMag.magic) >>> rMag.shift) + rMag.offset;
  const bIdx = (Math.imul(bOcc, bMag.magic) >>> bMag.shift) + bMag.offset;
  return (rookTable[rIdx & 0xFFF] ^ bishopTable[bIdx & 0xFFF]) >>> 0;
}
export default queenAttacks;
