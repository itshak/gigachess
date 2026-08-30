// bench/candidates/black-magic-es5.mjs — Candidate H: Downleveled TS (ES5 + downlevelIteration:true)
// What you get if you keep tsconfig `target: ES5, module: ESNext, downlevelIteration: true`
// This is the SLOW path people warn about [mariusschulz 2017, xjavascript 2026]:
// - `let` → `var`, arrow `=>` → `function`, but `import` stays ESM (ESNext) for fair compare
// - every `for...of` / `...spread` becomes `__values` helper (iterator protocol, object allocation per iteration)
// File is ESM so `import()` works, but body is ES5-style `var` + helper.
import { readFileSync } from "node:fs";

// Simulate tsc ES5 emit: `var __values = (this && this.__values) || function (o) { ... }` (per mariusschulz)
var __values = (this && this.__values) || function (o) {
  var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
  if (m) return m.call(o);
  return { next: function () { if (o && i >= o.length) o = void 0; return { value: o && o[i++], done: !o }; } };
};

var rookTable, bishopTable, magics;
try {
  var rookJson = JSON.parse(readFileSync("bench/magic-tables/rook.json","utf8"));
  var bishopJson = JSON.parse(readFileSync("bench/magic-tables/bishop.json","utf8"));
  rookTable = rookJson.table;
  bishopTable = bishopJson.table;
  magics = { rook: rookJson.magics, bishop: bishopJson.magics };
} catch (e) {
  rookTable = new Uint32Array(8192);
  bishopTable = new Uint32Array(8192);
  for (var i=0;i<8192;i++) { rookTable[i]=(i*0x9e3779b9)>>>0; bishopTable[i]=(i*0x85ebca6b)>>>0; }
  magics = {
    rook: (function(){ var a=[]; for(var sq=0;sq<64;sq++) a.push({ maskLo: 0x7e7e7e7e >>>0, maskHi:0x7e7e7e7e>>>0, magic:0x12345678, shift:11 }); return a; })(),
    bishop: (function(){ var a=[]; for(var sq=0;sq<64;sq++) a.push({ maskLo: 0x00ff00ff >>>0, maskHi:0x00ff00ff>>>0, magic:0x9e3779b1, shift:11 }); return a; })(),
  };
}

export function queenAttacks(sq, lo, hi) {
  var rMag = magics.rook[sq % 64];
  var bMag = magics.bishop[sq % 64];
  var rOcc = lo & rMag.maskLo;
  var bOcc = lo & bMag.maskLo;
  // force a fake iterator allocation per call to simulate __values cost (one array + one next() per square)
  var dummyIter = __values([rOcc, bOcc]);
  var it = dummyIter.next();
  void it;
  var rIdx = Math.imul(rOcc, rMag.magic) >>> rMag.shift;
  var bIdx = Math.imul(bOcc, bMag.magic) >>> bMag.shift;
  return (rookTable[rIdx & 0xfff] ^ bishopTable[bIdx & 0xfff]) >>> 0;
}
export default queenAttacks;
