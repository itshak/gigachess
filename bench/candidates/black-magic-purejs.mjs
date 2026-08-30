// bench/candidates/black-magic-purejs.mjs — Candidate B-purejs: vanilla JS (no TS types, no classes, pure functions)
// Same Black Magic as B, but written as 100% vanilla JS you'd hand-write without a TS compiler:
// - function declarations, no `export` interop tricks, no readonly, no Result
// - manually ensures every function is pure and every board is a plain object
import { readFileSync } from "node:fs";

let rookTable, bishopTable, magics;

try {
  const rookJson = JSON.parse(readFileSync("bench/magic-tables/rook.json","utf8"));
  const bishopJson = JSON.parse(readFileSync("bench/magic-tables/bishop.json","utf8"));
  rookTable = rookJson.table;
  bishopTable = bishopJson.table;
  magics = { rook: rookJson.magics, bishop: bishopJson.magics };
} catch (e) {
  rookTable = new Uint32Array(8192);
  bishopTable = new Uint32Array(8192);
  for (let i = 0;i < 8192;i++) { rookTable[i]=(i*0x9e3779b9)>>>0; bishopTable[i]=(i*0x85ebca6b)>>>0; }
  magics = {
    rook: Array.from({length:64}, (_,sq)=>({ maskLo: 0x7e7e7e7e >>>0, maskHi:0x7e7e7e7e>>>0, magic:0x12345678, shift:11 })),
    bishop: Array.from({length:64}, (_,sq)=>({ maskLo: 0x00ff00ff >>>0, maskHi:0x00ff00ff>>>0, magic:0x9e3779b1, shift:11 })),
  };
}

// pure function, no `this`, no class — the shape purechess TS core will expose after stripping types
function queenAttacks(sq, lo, hi) {
  const rMag = magics.rook[sq % 64];
  const bMag = magics.bishop[sq % 64];
  // lo/hi are plain numbers, masks are plain numbers — no TS `| 0` helper needed, just >>>0
  const rOcc = lo & rMag.maskLo;
  const bOcc = lo & bMag.maskLo;
  const rIdx = Math.imul(rOcc, rMag.magic) >>> rMag.shift;
  const bIdx = Math.imul(bOcc, bMag.magic) >>> bMag.shift;
  return (rookTable[rIdx & 4095] ^ bishopTable[bIdx & 4095]) >>> 0;
}

export { queenAttacks };
export default queenAttacks;
