import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const args=process.argv.slice(2),v=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1]};
const oldPath=v('--baseline',null);
if(!oldPath)throw Error('--baseline /absolute/path/to/previous/fast/index.js');
const baseline=await import(pathToFileURL(resolve(oldPath)).href);
const candidate=await import('../dist/fast/index.js');
await Promise.all([
  baseline.ensureMagicTablesLoaded(),candidate.ensureMagicTablesLoaded(),
  baseline.ensureZobristLoaded(),candidate.ensureZobristLoaded(),
]);
const cases=[
['start','rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',5,4865609],
['kiwipete','r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',4,4085603],
['endgame','8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',5,674624],
['promotion','rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',4,2103487],
];
const rounds=Number(v('--runs','11'));if(rounds<5)throw Error('>=5 runs required');
function median(xs){let a=[...xs].sort((x,y)=>x-y);return a[a.length>>1]}
for(const [name,fen,depth,expected] of cases){
 const boards=[new baseline.Board(fen),new candidate.Board(fen)];
 for(const b of boards){
  if(b.perft(depth)!==expected)throw Error(name+' perft mismatch');
  b.perft(depth-1);
 }
 const ms=[[],[]];
 for(let i=0;i<rounds;i++)for(const j of(i%2?[1,0]:[0,1])){
  global.gc?.();
  const t=performance.now();
  const result=boards[j].perft(depth);
  if(result!==expected)throw Error('count');
  ms[j].push(performance.now()-t);
 }
 const a=expected*1000/median(ms[0]),b=expected*1000/median(ms[1]);
 console.log(name,JSON.stringify({oldM:+(a/1e6).toFixed(3),newM:+(b/1e6).toFixed(3),ratio:+(b/a).toFixed(4),oldMs:ms[0],newMs:ms[1]}));
}
