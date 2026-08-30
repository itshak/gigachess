// bench/candidates/black-magic-var.mjs — Candidate B-var: Black Magic with `var` only (no let/const)
// Identical logic to black-magic.mjs, but every binding is `var` to test V8 var vs let/const myth.
// If V8 still has a 4× var advantage, this should beat B; if not, it proves let/const is fine in 2026.
import { readFileSync } from "node:fs";
var rookTable, bishopTable, magics;

try {
  var rookJson = JSON.parse(readFileSync("bench/magic-tables/rook.json","utf8"));
  var bishopJson = JSON.parse(readFileSync("bench/magic-tables/bishop.json","utf8"));
  rookTable = rookJson.table;
  bishopTable = bishopJson.table;
  magics = { rook: rookJson.magics, bishop: bishopJson.magics };
} catch(e) {
  rookTable = new Uint32Array(8192);
  bishopTable = new Uint32Array(8192);
  for (var i=0;i<8192;i++) { rookTable[i]=(i*0x9e3779b9)>>>0; bishopTable[i]=(i*0x85ebca6b)>>>0; }
  magics = {
    rook: Array.from({length:64}, function(_,sq){return { maskLo: 0x7e7e7e7e >>>0, maskHi:0x7e7e7e7e>>>0, magic:0x12345678, shift:11 }}),
    bishop: Array.from({length:64}, function(_,sq){return { maskLo: 0x00ff00ff >>>0, maskHi:0x00ff00ff>>>0, magic:0x9e3779b1, shift:11 }}),
  };
}

export function queenAttacks(sq, lo, hi) {
  var rMag = magics.rook[sq % 64];
  var bMag = magics.bishop[sq % 64];
  var rOcc = lo & rMag.maskLo;
  var bOcc = lo & bMag.maskLo;
  var rIdx = Math.imul(rOcc, rMag.magic) >>> rMag.shift;
  var bIdx = Math.imul(bOcc, bMag.magic) >>> bMag.shift;
  return (rookTable[rIdx & 0xfff] ^ bishopTable[bIdx & 0xfff]) >>> 0;
}
export default queenAttacks;
