// Correctness-gated competitor benchmark. Run with the optional tsx runner:
// node --import /ABSOLUTE/PATH/node_modules/tsx/dist/loader.mjs bench/bench-competitive.mjs --drumevp /PINNED/CHECKOUT --quick
// No engine code, NNUE, or WASM is linked into GigaChess.
import {readFileSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {performance} from "node:perf_hooks";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {cpus,totalmem} from "node:os";
import {Chess as JsChess} from "chess.js";
import {Chess as OpsChess} from "chessops/chess";
import {parseFen as opsFen} from "chessops/fen";
import {perft as opsPerft} from "chessops/debug";
import {Board} from "../dist/board.js";
import {ensureMagicTablesLoaded} from "../dist/attacks.js";
const root=resolve(import.meta.dirname,".."),argv=process.argv.slice(2);
const option=(key,fallback)=>{const i=argv.indexOf(key);return i<0?fallback:argv[i+1]};
const otherRoot=option("--drumevp",null),quick=argv.includes("--quick");
if(!otherRoot)throw Error("Specify --drumevp /path/to/git/checkout");
const out=option("--json",null),runs=Number(option("--runs",quick?3:7));
const publishedPath=option("--published",null);
const publishedModule=publishedPath?await import(pathToFileURL(resolve(publishedPath)).href):null;
const Published=publishedModule?.ChessEngine;
if(runs<3||runs>25||!Number.isInteger(runs))throw Error("runs 3..25 required");
const src=(p)=>import(pathToFileURL(join(resolve(otherRoot),p)).href);
const [engineModule,fenModule,perftModule,moveModule,rawMoveModule,contextModule,attackModule,listModule,fromContextModule,makeModule,undoModule,historyModule,hashModule]=await Promise.all([
src("src/engine/ChessEngine.ts"),
src("src/engine/fen/fenToPosition/generateFenToPosition.ts"),
src("src/engine/perft/main.ts"),
src("src/engine/position/moves/packedMove.ts"),
src("src/engine/movegen/generateLegalMoves.ts"),
src("src/engine/movegen/getMoveGenerationContext.ts"),
src("src/engine/movegen/attackInfo/main.ts"),
src("src/engine/movegen/moveList.ts"),
src("src/engine/movegen/generateLegalMovesFromContext.ts"),
src("src/engine/position/moves/makeMove/makeMove.ts"),
src("src/engine/position/moves/undoMove/undoMove.ts"),
src("src/engine/types/history.ts"),
src("src/engine/hash/zobrist.ts")]);
const Engine=engineModule.default,parseOther=fenModule.default,perftOther=perftModule.default,generateOtherMoves=rawMoveModule.default;
const {moveDecodeFrom,moveDecodeTo,moveDecodePromotionPiece}=moveModule;
const getMoveGenerationContext=contextModule.default;
const makeAttackInfo=attackModule.default,createAttackInfo=attackModule.createAttackInfo;
const newMoveList=listModule.createMoveList,fromContext=fromContextModule.default;
const createContext=contextModule.createMoveGenerationContext;
const makeMoveWithUndo=makeModule.makeMoveWithUndo,undoMove=undoModule.default;
const createUndo=historyModule.createUndo,hashPosition=hashModule.default;

/** Diagnostic competitor full-state perft: same reusable per-depth structure as
 * upstream perft, with updateZobristHash:true (vs upstream's false). All
 * helper functions are imported unmodified from pinned MIT upstream sources. */
function hashedPerft(position,depth) {
 const lists=Array.from({length:depth},newMoveList);
 const ctx=lists.map(createContext);
 const attack=Array.from({length:depth},createAttackInfo);
 const undos=Array.from({length:depth},createUndo);
 function walk(d,ply) {
  if(d===0)return 1;
  const context=getMoveGenerationContext(position,lists[ply],ctx[ply]);
  const info=makeAttackInfo(context,attack[ply]);
  const n=fromContext(context,info);
  if(d===1)return n;
  let count=0;
  for(let i=0;i<n;i++){
   const m=lists[ply].moves[i],undo=undos[ply];
   makeMoveWithUndo(position,m,undo,{updateZobristHash:true});
   count+=walk(d-1,ply+1);
   undoMove(position,m,undo);
  }
  return count;
 }
 return walk(depth,0);
}
const revision=execFileSync("git",["-C",resolve(otherRoot),"rev-parse","HEAD"],{encoding:"utf8"}).trim();
const version=JSON.parse(readFileSync(join(otherRoot,"package.json"),"utf8")).version;
const sha=(p)=>createHash("sha256").update(readFileSync(join(root,p))).digest("hex");
const START="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const reference=[
["start",START,[20,400,8902,197281,4865609]],
["kiwipete","r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",[48,2039,97862,4085603]],
["pos3","8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",[14,191,2812,43238]],
["pos4","r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",[6,264,9467,422333]],
["pos5","rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",[44,1486,62379,2103487]]];
const perftFile="bench/data/perftsuite.epd",wacFile="bench/data/wac_150.epd";
const perftRows=readFileSync(join(root,perftFile),"utf8").split(/\r?\n/).filter(Boolean).map(x=>({fen:x.split(";")[0].trim(),counts:Object.fromEntries([...x.matchAll(/D(\d+)\s+(\d+)/ig)].map(m=>[Number(m[1]),Number(m[2])]))}));
const wacRows=readFileSync(join(root,wacFile),"utf8").split(/\r?\n/).filter(Boolean).map(x=>({fen:x.split(";")[0].trim().replace(/\s+bm\s+.*$/,"")+" 0 1",counts:{}}));
let rng=0x5e1ec7e5;const random=n=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng%n};
function randomPositions(target){
 const positions=[],games=[];let attempts=0;
 while(positions.length<target&&attempts++<100){
  const c=new JsChess(),ucis=[];
  for(let i=0;i<100&&positions.length<target;i++){
   positions.push(c.fen());const moves=c.moves({verbose:true});if(!moves.length)break;
   const m=moves[random(moves.length)];ucis.push(m.lan);c.move(m);
  }
  games.push(ucis);
 }
 return {positions:[...new Set(positions)],games};
}
const {positions:randomFens,games}=randomPositions(quick?550:2400);
const fens=[...new Set([...reference.map(x=>x[1]),...perftRows.map(x=>x.fen),...wacRows.map(x=>x.fen),...randomFens])];
const s2=s=>String.fromCharCode(97+(s&7))+String(1+(s>>3));
const promote=["r","n","b","q","k","p"];
// chess.js suppresses EP targets when no *legal* EP capture exists, but the
// competitor outputs the raw target after every double pawn push. Record this
// contract difference separately; board, clocks and legal moves still compare.
const fields=f=>f.trim().split(/\s+/);
const normalized=f=>{const a=fields(f);return [a[0],a[1],a[2],a[4],a[5]].join(" ")};
const failures=[];const fail=(type,detail)=>{if(failures.length<100)failures.push({type,...detail})};
const result={node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,memoryGiB:+(totalmem()/1073741824).toFixed(1),date:new Date().toISOString(),runs,mode:quick?"quick":"full",drumevp:{version,revision,publishedEntry:publishedPath??null},
corpus:{perftSha256:sha(perftFile),wacSha256:sha(wacFile),positions:fens.length,seed:"0x5e1ec7e5"},correctness:{},timings:{},failures,caveats:[]};
console.log("COMPETITIVE BENCHMARK",JSON.stringify({runs,quick,revision,positions:fens.length}));
function moveWords(g){
 return [...g.generateLegalMoves()].map(w=>{
 const role=moveDecodePromotionPiece(w);
 return s2(moveDecodeFrom(w))+s2(moveDecodeTo(w))+(role==null?"":promote[role]??"?");
 }).sort();
}
console.log("1. FEN/LEGAL MOVES vs chess.js");
let legal=0,fenErrors=0,moveErrors=0,rejections=0,epPresentationDifferences=0,publishedMoveErrors=0,publishedFenErrors=0;
const legalSamples=fens.slice(0,quick?900:2600);
for(const fen of legalSamples){
 let js,d;
 try{js=new JsChess(fen);d=new Engine(fen)}catch(e){rejections++;fail("load",{fen,error:String(e).slice(0,150)});continue}
 legal++;
 if(fields(js.fen())[3]!==fields(d.exportFen())[3])epPresentationDifferences++;
 if(normalized(js.fen())!==normalized(d.exportFen())){fenErrors++;fail("fen",{fen,other:d.exportFen(),oracle:js.fen()})}
 const expected=js.moves({verbose:true}).map(m=>m.lan).sort(),actual=moveWords(d);
 if(JSON.stringify(expected)!==JSON.stringify(actual)){
  moveErrors++;fail("moves",{fen,expected:expected.length,actual:actual.length,missing:expected.filter(m=>!actual.includes(m)).slice(0,8),extra:actual.filter(m=>!expected.includes(m)).slice(0,8)});
 }
 if(Published) {
  const pub=new Published(fen);
  if(normalized(js.fen())!==normalized(pub.exportFen())){
   publishedFenErrors++;fail("published-fen",{fen,expected:js.fen(),actual:pub.exportFen()});
  }
  const packed=moveWords(pub);
  if(JSON.stringify(expected)!==JSON.stringify(packed)){
   publishedMoveErrors++;fail("published-moves",{fen,expected:expected.length,actual:packed.length});
  }
 }
}
result.correctness.legal={samples:legal,rejections,fenErrors,moveErrors,publishedMoveErrors,publishedFenErrors,epPresentationDifferences};console.log("  ",result.correctness.legal);
console.log("2. STATEFUL UCI REPLAY AND UNDO");
let gamesOk=0,plies=0,replayErrors=0,epReplayDifferences=0;
for(const ucis of games.slice(0,quick?8:24)){
 const a=new JsChess(),b=new Engine(),pub=Published?new Published():null;let valid=true;
 for(const uci of ucis){
  try{a.move(uci);b.makeUciMove(uci);pub?.makeUciMove(uci);plies++}
  catch(e){valid=false;fail("make",{uci,error:String(e)});break}
  if(fields(a.fen())[3]!==fields(b.exportFen())[3])epReplayDifferences++;
  if(normalized(a.fen())!==normalized(b.exportFen())||(pub&&normalized(a.fen())!==normalized(pub.exportFen()))){valid=false;fail("replay",{uci,expected:a.fen(),actual:b.exportFen()});break}
 }
 if(!valid){replayErrors++;continue}
 gamesOk++;
 for(let i=ucis.length;i>0;i--){a.undo();b.undoMove();pub?.undoMove();
  if(normalized(a.fen())!==normalized(b.exportFen())||(pub&&normalized(a.fen())!==normalized(pub.exportFen()))){replayErrors++;fail("undo",{ply:i,expected:a.fen(),actual:b.exportFen()});break}
 }
}
result.correctness.replay={gamesOk,plies,replayErrors,epReplayDifferences};console.log("  ",result.correctness.replay);
console.log("3. MALFORMED AND ILLEGAL INPUT");
const invalid=[
["missing-king","8/8/8/8/8/8/8/7k w - - 0 1"],
["duplicate-king","4k3/8/8/8/8/8/8/3KK3 w - - 0 1"],
["adjacent-kings","8/8/8/8/8/8/4k3/4K3 w - - 0 1"],
["pawn-on-back-rank","4k3/8/8/8/8/8/8/P3K3 w - - 0 1"],
["invalid-turn","4k3/8/8/8/8/8/8/4K3 x - - 0 1"],
["invalid-ep-rank","4k3/8/8/8/8/8/8/4K3 w - e3 0 1"],
["extra-field",START+" extra"],
["opponent-in-check","4k3/8/8/8/8/8/4R3/4K3 w - - 0 1"]];
const invalidFen=invalid.map(([name,fen])=>{
 let dr=false,ch=false;try{new Engine(fen)}catch{dr=true}try{new JsChess(fen)}catch{ch=true}
 return{name,drumevpRejects:dr,chessJsRejects:ch};
});
const invalidMoves=["e1e5","c1h6","e7e5"].map(uci=>{
 const engine=new Engine();let rejected=false;try{engine.makeUciMove(uci)}catch{rejected=true}
 return{uci,rejected,unchanged:engine.exportFen()===START};
});
result.correctness.invalid={invalidFen,invalidMoves};console.log("  ",JSON.stringify(result.correctness.invalid));
console.log("3b. TERMINAL/DRAW SEMANTICS (no silent equivalence)");
const terminalFens=[
 ["fools-mate","rnbqkbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"],
 ["stalemate","7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"],
 ["bare-kings","4k3/8/8/8/8/8/8/4K3 w - - 0 1"],
 ["fifty-move","4k3/8/8/8/8/8/8/4K2R w - - 100 1"]
];
let terminalCoreErrors=0,drawApiDifferences=0;
const terminalCases=[];
for(const [name,fen] of terminalFens) {
 const js=new JsChess(fen),dr=new Engine(fen),pub=Published?new Published(fen):null;
 const oracle=[js.isCheck(),js.isCheckmate(),js.isStalemate(),js.isInsufficientMaterial(),js.isGameOver()];
 const actual=[dr.isCheck(),dr.isCheckmate(),dr.isStalemate(),dr.isInsufficientMaterial(),dr.isGameOver()];
 const published=pub?[pub.isCheck(),pub.isCheckmate(),pub.isStalemate(),pub.isInsufficientMaterial(),pub.isGameOver()]:null;
 if(JSON.stringify(oracle)!==JSON.stringify(actual)||(published&&JSON.stringify(oracle)!==JSON.stringify(published))){
   terminalCoreErrors++;fail("terminal",{name,oracle,actual,published});
 }
 const isDrawDifferent=js.isDraw()!==dr.isDraw();
 if(isDrawDifferent)drawApiDifferences++;
 terminalCases.push({name,oracle,actual,published,jsDraw:js.isDraw(),drumevpDraw:dr.isDraw(),drawApiDifferent:isDrawDifferent});
}
const repeatLine=["a4","Nf6","Nf3","Ng8","Ng1","Nf6","Nf3","Ng8","Ng1"];
const rJs=new JsChess(),rOther=new Engine(),rPublished=Published?new Published():null;
for(const san of repeatLine){const mv=rJs.move(san);rOther.makeUciMove(mv.lan);rPublished?.makeUciMove(mv.lan);}
const threefold={chessJs:rJs.isThreefoldRepetition(),drumevp:rOther.isThreefoldRepetition(),published:rPublished?.isThreefoldRepetition()};
if(!threefold.chessJs||!threefold.drumevp||(rPublished&&!threefold.published)){
 terminalCoreErrors++;fail("threefold",{threefold});
}
result.correctness.terminal={terminalCoreErrors,drawApiDifferences,terminalCases,threefold};
console.log("  ",JSON.stringify({terminalCoreErrors,drawApiDifferences,threefold}));
console.log("4. PUBLISHED PERFT COUNTS & FULL CORPUS");
await ensureMagicTablesLoaded();
let refChecks=0,refErrors=0,corpusChecks=0,corpusErrors=0,skips=0;
for(const [id,fen,counts]of reference){
 const g=new Board(fen),o=parseOther(fen);
 for(let d=1;d<=(quick?3:4);d++){
  const expected=counts[d-1],gn=g.perft(d),on=perftOther(o,d),publishedCount=Published?new Published(fen).perft(d):expected,
  beforeHash=o.zobristHash,hn=hashedPerft(o,d);refChecks++;
  if(o.zobristHash!==beforeHash||o.zobristHash!==hashPosition(o)){
   refErrors++;fail("zobrist-drift",{id,depth:d});
  }
  if(gn!==expected||on!==expected||hn!==expected||publishedCount!==expected){refErrors++;fail("reference-perft",{id,depth:d,expected,giga:gn,drumevp:on,drumevpWithHash:hn,publishedCount})}
 }
}
const selected=[...perftRows.slice(0,quick?70:perftRows.length),...wacRows.slice(0,quick?50:wacRows.length)];
const verified=[];
for(const {fen,counts}of selected){
 let c,g,o;
 try{c=OpsChess.fromSetup(opsFen(fen).unwrap()).unwrap();g=new Board(fen);o=parseOther(fen)}
 catch(e){skips++;continue}
 const d=quick?2:3,n=Number(opsPerft(c.clone(),d)),gn=g.perft(d),on=perftOther(o,d),publishedBoard=Published?new Published(fen):null,pn=publishedBoard?publishedBoard.perft(d):n;
 corpusChecks++;
 if(n!==gn||n!==on||n!==pn){corpusErrors++;fail("corpus-perft",{fen,d,expected:n,giga:gn,drumevp:on,published:pn})}
 else verified.push({fen,d,n,c,g,o,publishedBoard});
}
result.correctness.perft={refChecks,refErrors,corpusChecks,corpusErrors,skips,verified:verified.length};console.log("  ",result.correctness.perft);
function median(xs){const a=[...xs].sort((a,b)=>a-b);return a[Math.floor(a.length/2)]}
// Each entry gets the same corpus and a sequential, ROTATED evaluation order.
// Warmup timings discarded. This reduces engine-order/JIT/thermal bias. Perft
// node counts and move sets have already been checked independently.
function lane(name,entries,units){
 const sampleByName=Object.fromEntries(entries.map(([id])=>[id,[]]));
 for(const [id,work]of entries){
  for(let i=0;i<2;i++){const checksum=work();if(!Number.isFinite(checksum))throw Error(id+" invalid warmup");}
 }
 for(let i=0;i<runs;i++){
  const rotated=entries.map((_,j)=>entries[(i+j)%entries.length]);
  for(const [id,work]of rotated){
   global.gc?.();
   const t=performance.now(),checksum=work(),elapsed=performance.now()-t;
   if(!Number.isFinite(checksum))throw Error(id+" invalid checksum");
   sampleByName[id].push(elapsed);
  }
 }
 result.timings[name]={};
 for(const [id] of entries){
  const samples=sampleByName[id],sorted=[...samples].sort((a,b)=>a-b);
  const med=sorted[Math.floor(sorted.length/2)];
  const percentile=x=>sorted[Math.floor((sorted.length-1)*x)];
  result.timings[name][id]={
   medianMs:+med.toFixed(4),p10Ms:+percentile(.1).toFixed(4),
   p90Ms:+percentile(.9).toFixed(4),
   unitsPerSec:Math.round(units*1000/med),
   rawMs:samples.map(x=>+x.toFixed(4))
  };
 }
 console.log("  "+name+" "+Object.entries(result.timings[name]).map(([id,x])=>id+"="+x.unitsPerSec.toLocaleString()+"/s").join(" "));
}
console.log("5. CORRECTNESS-GATED TIMINGS");
if(moveErrors===0&&legal>0){
 const ff=legalSamples.filter(f=>{try{new Engine(f);return true}catch{return false}}).slice(0,quick?240:800);
 const boards=ff.map(f=>new Board(f)),engines=ff.map(f=>new Engine(f));
 const chessjs=ff.map(f=>new JsChess(f)),ops=ff.map(f=>OpsChess.fromSetup(opsFen(f).unwrap()).unwrap()),positions=ff.map(f=>parseOther(f));
 lane("legal-movegen-positions",[
 ["gigachess-encoded",()=>{let n=0;for(const p of boards)n+=p.legalMoves().length;return n}],
 ["drumevp-raw-movegen",()=>{let n=0;for(const p of positions)n+=generateOtherMoves(p).length;return n}],
 ...(Published?[["drumevp-published-fresh-engine",()=>{let n=0;for(const f of ff)n+=new Published(f).generateLegalMoves().length;return n}]]:[]),
 ["chessops-dests",()=>{let n=0;for(const p of ops)n+=Array.from(p.allDests().values()).reduce((a,b)=>a+b.size(),0);return n}],
 ["chess.js-SAN",()=>{let n=0;for(const p of chessjs)n+=p.moves().length;return n}]
 ],ff.length);
 // Cached path is NOT comparable to legal generation. Report separately.
 lane("cached-move-list-positions",[
 ["drumevp-cached",()=>{let n=0;for(const p of engines)n+=p.generateLegalMoves().length;return n}],
 ["gigachess-regenerate",()=>{let n=0;for(const p of boards)n+=p.legalMoves().length;return n}]
 ],ff.length);
}
if(fenErrors===0&&legal>0){
 const ff=legalSamples.filter(f=>{try{new Engine(f);return true}catch{return false}}).slice(0,quick?350:900);
 lane("fen-parse-and-write-positions",[
 ["gigachess",()=>{let n=0;for(const f of ff)n+=new Board(f).toFen().length;return n}],
 ["drumevp",()=>{let n=0;for(const f of ff)n+=new Engine(f).exportFen().length;return n}],
 ...(Published?[["drumevp-published",()=>{let n=0;for(const f of ff)n+=new Published(f).exportFen().length;return n}]]:[]),
 ["chess.js",()=>{let n=0;for(const f of ff)n+=new JsChess(f).fen().length;return n}]
 ],ff.length);
}
if(replayErrors===0&&gamesOk>0){
 const gg=games.slice(0,quick?8:24),count=gg.reduce((sum,g)=>sum+g.length,0);
 lane("uci-game-replay-plies",[
 ["drumevp-validated",()=>{let n=0;for(const game of gg){const p=new Engine();for(const m of game){p.makeUciMove(m);n++}}return n}],
 ...(Published?[["drumevp-published-validated",()=>{let n=0;for(const game of gg){const p=new Published();for(const m of game){p.makeUciMove(m);n++}}return n}]]:[]),
 ["chess.js-validated",()=>{let n=0;for(const game of gg){const p=new JsChess();for(const m of game){p.move(m);n++}}return n}],
 ["gigachess-validated",()=>{let n=0;for(const game of gg){const p=new Board();for(const m of game){const word=p.parseUci(m);if(word==null)throw Error("gigachess rejected UCI "+m);p.makeMove(word);n++}}return n}]
 ],count);
}
if(refErrors===0&&corpusErrors===0&&verified.length){
 const total=verified.reduce((n,p)=>n+p.n,0);
 lane("mixed-perft-nodes",[
 ["gigachess",()=>verified.reduce((n,p)=>n+p.g.perft(p.d),0)],
 ["drumevp-no-hash",()=>verified.reduce((n,p)=>n+perftOther(p.o,p.d),0)],
 ["drumevp-full-hash",()=>verified.reduce((n,p)=>n+hashedPerft(p.o,p.d),0)],
 ...(Published?[["drumevp-published",()=>verified.reduce((n,p)=>n+p.publishedBoard.perft(p.d),0)]]:[]),
 ["chessops",()=>verified.reduce((n,p)=>n+Number(opsPerft(p.c.clone(),p.d)),0)]
 ],total);
 for(const [id,fen]of reference.slice(0,2)){
  const d=quick?4:id==="start"?5:4,g=new Board(fen),o=parseOther(fen),
   c=OpsChess.fromSetup(opsFen(fen).unwrap()).unwrap(),n=g.perft(d);
  lane("deep-perft-"+id+"-d"+d+"-nodes",[
   ["gigachess",()=>g.perft(d)],["drumevp-no-hash",()=>perftOther(o,d)],["drumevp-full-hash",()=>hashedPerft(o,d)],...(Published?[["drumevp-published",()=>new Published(fen).perft(d)]]:[]),
   ["chessops",()=>Number(opsPerft(c.clone(),d))]
  ],n);
 }
}
const failed=refErrors+corpusErrors+moveErrors+fenErrors+replayErrors+publishedMoveErrors+publishedFenErrors+terminalCoreErrors;
result.correctness.passed=failed===0;result.correctness.failures=failed;
result.correctness.unsupportedOrRejectedCorpusFens=rejections;
result.caveats.push("Perft/FEN/SAN EPD sources include 4-field EPD notation, converted to 6-field FEN before invoking the standard-only competitor.");
result.caveats.push("Drumevp perft explicitly SKIPS Zobrist maintenance. Both no-hash and full-hash (diagnostic upstream make) perft timings are included; GigaChess uses its public Board.perft.");
result.caveats.push("Chess.js suppresses phantom EP targets in serialized FEN, while drumevp may preserve them after a double pawn push. FEN board/turn/castling/clocks are checked separately; EP presentation differences are counted and legal en-passant moves are checked independently.");
result.caveats.push("Drumevp has 32-bit packed moves, standard chess only, no comparable SAN/PGN or Chess960 API; report N/A, not a win.");
result.caveats.push("Drumevp cached move list is a cache lookup, not a new legal-move generation; comparison deliberately separate.");
result.caveats.push("Cross-library perft counts prove aggregate node parity, NOT equal per-position legal moves or input validation.");
result.caveats.push("Warm-up excludes 2 preliminary passes; 7 (or --runs N) samples rotate engine order and report medians/p10/p90. Shared-server contention can affect results; repeat independently for significance.");
result.caveats.push("Drumevp isDraw() returns false for STALEMATE even while isStalemate() and isGameOver() return true; chess.js isDraw() includes stalemate. This is an API contract difference, not evidence it misses a terminal state.");
result.caveats.push("Move list generation is not API-identical: chess.js emits SAN, chessops provides destination bitsets (promotions unexpanded), GigaChess/drumevp return packed moves. Never treat those four numbers as a pure movegen microbenchmark.");
if(out)writeFileSync(resolve(out),JSON.stringify(result,null,2)+"\n");
console.log("RESULT",JSON.stringify({parityPassed:result.correctness.passed,failures:failed,examples:failures.slice(0,5),lanes:Object.keys(result.timings),out}));
if(failed)process.exitCode=1;
