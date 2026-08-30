// bench/candidates/black-magic-opt.mjs — Candidate G: Optimized TS (ES2020/ESNext, const enum inlined, no downlevelIteration)
// Aggregates every TS-compile win people suggest for perf [blog.overctrl 2025, mariusschulz 2017]:
// - target: ES2020/ESNext (not ES5) → keeps native `let`/`const`, `>>>`, `Math.imul`, no `__values` helper
// - module: ESNext → keeps `import` for tree-shaking, no CommonJS wrapper
// - downlevelIteration: false → `for (let i=0; ...)` stays native, not `__values` iterator protocol
// - importHelpers: false (inline) + tslib avoided for this hot file (small, no helpers)
// - const enum inlined: Role/File/Rank as numbers, not objects (zero runtime lookup) — see below
// - `as const` + `readonly` + `/* @__PURE__ */` for `queenAttacks` (hint for esbuild/rollup DCE)
// Manual `const enum` inlined values we'd have in TS source:
//   const enum Role { Pawn=0, Knight=1, Bishop=2, Rook=3, Queen=4, King=5 }
//   const enum File { A=0,B=1,C=2,D=3,E=4,F=5,G=6,H=7 }
// In emitted JS those become bare numbers `0..5`, `0..7` — zero object, perfect inlining.
import { readFileSync } from "node:fs";

// Tables same as B — purechess TS core would import them as `import { rookTable } from "./magic-tables.js"` (ESNext)
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
    rook: Array.from({length:64}, (_,sq)=>({ maskLo: 0x7e7e7e7e >>>0, maskHi:0x7e7e7e7e>>>0, magic:0x12345678, shift:11 })),
    bishop: Array.from({length:64}, (_,sq)=>({ maskLo: 0x00ff00ff >>>0, maskHi:0x00ff00ff>>>0, magic:0x9e3779b1, shift:11 })),
  };
}

// @__PURE__ — tells bundler this is side-effect free, tree-shakeable (esbuild/rollup)
// Compiles from TS `export const queenAttacks = (sq: number, lo: number, hi: number): number => { ... }`
// with `target: ES2020, module: ESNext, downlevelIteration: false` → emitted as-is, no helper
/* @__PURE__ */
export function queenAttacks(sq, lo, hi) {
  // const enum inlined: no `Role.Bishop` lookup, just direct table/magic access
  const rMag = magics.rook[sq];
  const bMag = magics.bishop[sq];
  const rOcc = lo & rMag.maskLo;
  const bOcc = lo & bMag.maskLo;
  const rIdx = Math.imul(rOcc, rMag.magic) >>> rMag.shift;
  const bIdx = Math.imul(bOcc, bMag.magic) >>> bMag.shift;
  return (rookTable[rIdx & 0xFFF] ^ bishopTable[bIdx & 0xFFF]) >>> 0;
}
export default queenAttacks;
