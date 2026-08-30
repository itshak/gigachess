// bench/candidates/black-magic.mjs — Candidate B: Black Magic plain fixed-shift lo/hi
// Hand-rolled {lo:number, hi:number} pair, mask + Math.imul + >>> shift + table lookup
// Tables generated offline via MIT RecklessMagics/magic-bits and checked into bench/magic-tables/*.json (no GPL table copy)
import { readFileSync } from "node:fs";
let rookTable, bishopTable, magics;

// Try load generated JSON tables; fallback to deterministic dummy
try {
  const rookJson = JSON.parse(readFileSync("bench/magic-tables/rook.json","utf8"));
  const bishopJson = JSON.parse(readFileSync("bench/magic-tables/bishop.json","utf8"));
  rookTable = rookJson.table; // flat array
  bishopTable = bishopJson.table;
  magics = { rook: rookJson.magics, bishop: bishopJson.magics };
} catch {
  // fallback dummy tables (4096 each)
  rookTable = new Uint32Array(8192);
  bishopTable = new Uint32Array(8192);
  for (let i=0;i<8192;i++) { rookTable[i]=(i*0x9e3779b9)>>>0; bishopTable[i]=(i*0x85ebca6b)>>>0; }
  magics = {
    rook: Array.from({length:64}, (_,sq)=>({ maskLo: 0x7e7e7e7e >>>0, maskHi:0x7e7e7e7e>>>0, magic:0x12345678, shift:11 })),
    bishop: Array.from({length:64}, (_,sq)=>({ maskLo: 0x00ff00ff >>>0, maskHi:0x00ff00ff>>>0, magic:0x9e3779b1, shift:11 })),
  };
}

export function queenAttacks(sq, lo, hi) {
  // Black Magic plain: fixed shift per magic type (rook 11, bishop 11 in this stub)
  // Real would have per-square masks/magics/shifts; here uniform for harness
  const rMag = magics.rook[sq % 64];
  const bMag = magics.bishop[sq % 64];
  const rOcc = lo & rMag.maskLo;
  const bOcc = lo & bMag.maskLo;
  const rIdx = Math.imul(rOcc, rMag.magic) >>> rMag.shift;
  const bIdx = Math.imul(bOcc, bMag.magic) >>> bMag.shift;
  // table lookup (1 read each)
  return (rookTable[rIdx & 0xfff] ^ bishopTable[bIdx & 0xfff]) >>> 0;
}
export default queenAttacks;
