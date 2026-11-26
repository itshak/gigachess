// Explicit baseline reference generator, not part of npm test.
// node bench/make-specialized-perft-fixtures.mjs /ABS/Baseline/dist/board.js
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const reference = process.argv[2];
if(!reference) throw Error("Supply an independently built baseline board.js");
const {Board}=await import(pathToFileURL(reference).href);
const common=[
"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
"r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
"8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
"rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
"k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1",
"4k3/8/8/1pP5/8/8/8/4K3 w - b6 0 1",
"4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"
];
const c960=[
"3k4/8/8/8/8/8/8/R1K4R w AH - 0 1",
"3k4/8/8/8/8/8/8/1RK3R1 w BG - 0 1",
"3k4/8/8/8/8/8/8/RK5R w AH - 0 1",
"3k4/8/8/8/8/8/8/R2K3R w AH - 0 1",
"3k4/8/8/8/8/8/8/R3K2R w AH - 0 1",
"3k4/8/8/8/8/8/8/R4K1R w AH - 0 1",
"3k4/8/8/8/8/8/8/R5KR w AH - 0 1",
"3k4/8/8/8/8/8/8/2RK1R2 w CF - 0 1",
"3k4/8/8/8/8/8/8/2RK2R1 w CG - 0 1",
"4k3/8/8/8/8/8/8/r3K2R w H - 0 1",
"r3k2r/8/8/8/8/8/8/R3K2R w AHah - 0 1",
"r3k2r/8/8/8/8/8/8/R3K2R b AHah - 0 1",
];

const positions=[];
for(const [fens, variant] of [[common,false],[c960,true]]){
 for(const fen of fens){
  const b=Board.fromFen(fen, variant ? {chess960:true} : undefined);
  const nodes=[];
  for(let depth=1;depth<=3;depth++) nodes.push(b.perft(depth));
  positions.push({fen, chess960:variant, nodes});
 }
}
writeFileSync(new URL("../tests/data/perft-specialized-v1.json",import.meta.url),
 JSON.stringify({source:"Frozen checked GigaChess Board.perft before perft-only move rewrite",
 sourceCommit:"1675beba766404f7f24a83eb7f022d47365ceaec",
 positions},null,2)+"\n");
console.log("Saved",positions.length,"independent FEN fixtures",positions.length*3,"checks");
