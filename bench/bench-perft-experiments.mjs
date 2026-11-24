// Bench perft scratch and pin-analysis experiments, against frozen baseline.
// Correctness-gated on the exact fixed corpus before any timing.
import {performance} from "node:perf_hooks";
import {pathToFileURL} from "node:url";
import {resolve,dirname,join} from "node:path";
const opt=(k,d)=>{const a=process.argv.indexOf(k);return a<0?d:process.argv[a+1]};
const reference=opt("--baseline",null);
if(!reference)throw Error("--baseline PATH/to/original/dist/board.js");
const {Board:Original} =await import(pathToFileURL(resolve(reference)).href);
const {Board:Experiment}=await import("../dist/board.js");
const {ensureZobristLoaded}=await import("../dist/zobrist.js");
if(process.argv.includes("--hash-on")) {
  await ensureZobristLoaded();
  const baselineHash=await import(pathToFileURL(join(dirname(resolve(reference)), "zobrist.js")).href);
  await baselineHash.ensureZobristLoaded();
}
console.log("zobrist-loaded:",process.argv.includes("--hash-on"));
const cases=[
 ["start","rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",5,4865609],
 ["kiwipete","r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",4,4085603],
 ["endgame","8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",5,674624],
 ["promotion","rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",4,2103487],
 ["pin","k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1",3,null]
];
const rounds=Number(opt("--runs",5)),results=[];
for(const [id,fen,depth,expected] of cases){
 const positions={original:new Original(fen),experimental:new Experiment(fen)};
 const original=positions.original.perft(depth),patched=positions.experimental.perft(depth);
 if(original!==patched||expected!==null&&original!==expected)throw Error(id+" mismatch: "+original+" vs "+patched);
 for(const b of Object.values(positions))b.perft(Math.max(1,depth-1));
 const times={original:[],experimental:[]};
 for(let i=0;i<rounds;i++)for(const which of(i%2?["experimental","original"]:["original","experimental"])){
  global.gc?.();const t=performance.now(),nodes=positions[which].perft(depth);
  if(nodes!==original)throw Error("timed count changed "+which+" "+id);
  times[which].push(performance.now()-t);
 }
 const med=x=>[...x].sort((a,b)=>a-b)[Math.floor(x.length/2)];
 const nps={original:original*1000/med(times.original),experimental:original*1000/med(times.experimental)};
 const ratio=nps.experimental/nps.original;
 console.log(id,JSON.stringify({nodes:original,depth,originalM:+(nps.original/1e6).toFixed(3),experimentalM:+(nps.experimental/1e6).toFixed(3),ratio:+ratio.toFixed(3),rawMs:times}));
 results.push({id,depth,nodes:original,ratio,nps,rawMs:times});
}
console.log("RESULT",JSON.stringify({rounds,node:process.version,results}));
