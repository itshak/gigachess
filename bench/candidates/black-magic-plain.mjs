// bench/candidates/black-magic-plain.mjs — Candidate I: Black Magic PLAIN fixed-shift (uniform 11, homogeneous)
// For honest plain vs Fancy comparison. Same tables/magics as Fancy, but uses FIXED shift 11 + uniform offset.
// Plain: index = ((occ & mask) * magic >>> 11) + sq*2048  — homogeneous, smallest table (64*2048=131072, but we use 8192 slice for harness)
// Fancy per-square (current B) uses variable shift 52..59 + per-square offset + 107k table.
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

const PLAIN_SHIFT = 11;
const PLAIN_SIZE = 1 << PLAIN_SHIFT; // 2048 per square, homogeneous

export function queenAttacks(sq, lo, hi) {
  const rMag = magics.rook[sq];
  const bMag = magics.bishop[sq];
  const rOcc = lo & rMag.maskLo;
  const bOcc = lo & bMag.maskLo;
  // PLAIN: fixed shift 11, uniform offset (sq * 2048), no per-square shift load — homogeneous
  const rIdx = (Math.imul(rOcc, rMag.magic) >>> PLAIN_SHIFT) + sq * 128;
  const bIdx = (Math.imul(bOcc, bMag.magic) >>> PLAIN_SHIFT) + sq * 128;
  return (rookTable[rIdx & 0xFFF] ^ bishopTable[bIdx & 0xFFF]) >>> 0;
}
export default queenAttacks;
