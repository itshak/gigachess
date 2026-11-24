// Chess application paths, compared directly with original main in one process.
// Correctness gated, full public state-maintaining APIs; no perft shortcuts.
// node --expose-gc bench/bench-gameplay-regressions.mjs --baseline /main/dist/board.js [--hash-on]
import {readFileSync,writeFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {pathToFileURL} from "node:url";
import {resolve,dirname,join} from "node:path";
import {Chess as JsChess} from "chess.js";
const argv=process.argv.slice(2),opt=(k,v)=>{const i=argv.indexOf(k);return i<0?v:argv[i+1]};
const baselinePath=opt("--baseline",null),rounds=Number(opt("--runs","11")),output=opt("--json",null);
if(!baselinePath)throw Error("--baseline /absolute/path/to/main/dist/board.js required");
const {Board:Original}=await import(pathToFileURL(resolve(baselinePath)).href);
const {Board:Candidate}=await import("../dist/board.js");
if(argv.includes("--hash-on")){
  const a=await import(pathToFileURL(join(dirname(resolve(baselinePath)),"zobrist.js")).href);
  const b=await import("../dist/zobrist.js");
  await Promise.all([a.ensureZobristLoaded(),b.ensureZobristLoaded()]);
}
const hashOn=argv.includes("--hash-on");
let state=0x13579bdf;const rand=n=>(state=(Math.imul(state,1664525)+1013904223)>>>0)%n;
const start="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const games=[],fens=[],seen=new Set();
for(let i=0;i<30;i++){
 const js=new JsChess(),moves=[];
 for(let ply=0;ply<100;ply++){
  if(!seen.has(js.fen())){seen.add(js.fen());fens.push(js.fen());}
  const legal=js.moves({verbose:true});
  if(!legal.length)break;
  const m=legal[rand(legal.length)];moves.push(m.lan);js.move(m);
 }
 games.push(moves);
}
const gamePlies=games.reduce((n,g)=>n+g.length,0);
const sampleFens=fens.slice(0,1500);
const originalBoards=sampleFens.map(f=>new Original(f));
const candidateBoards=sampleFens.map(f=>new Candidate(f));
let positionErrors=0;
for(let i=0;i<sampleFens.length;i++){
 const a=originalBoards[i],b=candidateBoards[i];
 const A=[...a.legalMoves()].sort(),B=[...b.legalMoves()].sort();
 if(JSON.stringify(A)!==JSON.stringify(B)||a.toFen()!==b.toFen())positionErrors++;
}
if(positionErrors)throw Error("position move/FEN mismatches "+positionErrors);
function replay(Engine){
 let checksum=0;
 for(let repeat=0;repeat<8;repeat++){
  for(const game of games){
   const b=new Engine(start);
   for(const uci of game){
    const move=b.parseUci(uci);if(move===null)throw Error("replay rejected "+uci);
    b.makeMove(move);
   }
   checksum+=b.halfmoves+b.fullmoves;
  }
 }
 return checksum;
}
function fenWork(Engine){
 let checksum=0;
 for(let r=0;r<4;r++)for(const f of sampleFens)checksum+=new Engine(f).toFen().length;
 return checksum;
}
function movesWork(boards){
 let checksum=0;
 for(let r=0;r<5;r++)for(const b of boards)checksum+=b.legalMoves().length;
 return checksum;
}
const workloads=[
 ["fully-validated-game-replay",gamePlies*8,()=>replay(Original),()=>replay(Candidate)],
 ["FEN-parse-and-write",sampleFens.length*4,()=>fenWork(Original),()=>fenWork(Candidate)],
 ["uncached-legal-move-list",sampleFens.length*5,()=>movesWork(originalBoards),()=>movesWork(candidateBoards)]
];
const result={node:process.version,hashOn,rounds,positions:sampleFens.length,gamePlies,positionErrors,workloads:{}};
for(const [name,units,baseline,candidate] of workloads){
 for(let i=0;i<3;i++){if(baseline()!==candidate())throw Error("baseline mismatch "+name);}
 const samples={original:[],candidate:[]};
 for(let i=0;i<rounds;i++){
  const order=i%2===0?[["original",baseline],["candidate",candidate]]:[["candidate",candidate],["original",baseline]];
  for(const [key,work] of order){
   global.gc?.();
   const t=performance.now(),check=work(),ms=performance.now()-t;
   if(!Number.isFinite(check))throw Error("invalid checksum");
   samples[key].push(ms);
  }
 }
 const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
 const orig=units*1000/median(samples.original),cand=units*1000/median(samples.candidate);
 result.workloads[name]={originalPerSecond:orig,candidatePerSecond:cand,ratio:cand/orig,samplesMs:samples};
 console.log(name,JSON.stringify({original:Math.round(orig),candidate:Math.round(cand),ratio:+(cand/orig).toFixed(4)}));
}
console.log("PASS gameplay regressions",JSON.stringify({hashOn,positions:sampleFens.length,gamePlies}));
if(output)writeFileSync(resolve(output),JSON.stringify(result,null,2)+"\n");
