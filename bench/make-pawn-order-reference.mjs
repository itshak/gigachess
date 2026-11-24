// Manually regenerate frozen data from an independently built baseline.
// Usage: node bench/make-pawn-order-reference.mjs /ABS/BASELINE/dist/chess.js
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve, dirname, join } from "node:path";
import { Chess } from "chess.js";
const baselinePath = process.argv[2];
if (!baselinePath) throw Error("Supply the baseline dist/chess.js path");
const oldChess = await import(pathToFileURL(resolve(baselinePath)).href);
const {Board} = await import(pathToFileURL(join(dirname(resolve(baselinePath)), "board.js")).href);
let seed = 0x9e3779b9;
const rnd = n => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n;
const positions = [];
for (let g = 0; g < 14; g++) {
  const js = new Chess();
  for (let ply = 0; ply < 28; ply++) {
    const fen = js.fen();
    const buf = new Uint16Array(256);
    const n = oldChess.legalMovesInto(new Board(fen), buf);
    positions.push({fen, moves: Array.from(buf.subarray(0, n))});
    const legal = js.moves({verbose:true});
    if (!legal.length) break;
    js.move(legal[rnd(legal.length)]);
  }
}
writeFileSync(new URL("../tests/data/pawn-list-order-v1.json", import.meta.url), JSON.stringify({
  description:"Frozen byte-exact 16-bit packed move ordering before optimized pawn emission.",
  referenceCommit:"12755b9fbb164c69b9c86a8a4881411bd64d3429",
  seed:"0x9e3779b9",positions,
}) + "\n");
console.log("Wrote",positions.length,"reference positions");
