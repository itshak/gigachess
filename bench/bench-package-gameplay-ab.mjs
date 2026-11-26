import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {Chess} from 'chess.js';
const args=process.argv.slice(2),v=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1]};
const baseline=await import(pathToFileURL(resolve(v('--baseline',''))).href);
const candidate=await import('../dist/fast/index.js');
await Promise.all([baseline.ensureMagicTablesLoaded(),candidate.ensureMagicTablesLoaded(),baseline.ensureZobristLoaded(),candidate.ensureZobristLoaded()]);
let seed=0x8f24e31;const rnd=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%n};
const fens=[],games=[];
for(let g=0;g<24;g++){
 const c=new Chess(),game=[];
 for(let ply=0;ply<100;ply++){
  const ms=c.moves({verbose:true});if(!ms.length)break;
  if(ply%3===0)fens.push(c.fen({forceEnpassantSquare:true}));
  const m=ms[rnd(ms.length)];game.push(m.from+m.to+(m.promotion||''));c.move(m);
 }
 games.push(game);
}
const engines=[baseline,candidate],boards=engines.map(e=>fens.map(f=>new e.Board(f)));
const median=x=>[...x].sort((a,b)=>a-b)[Math.floor(x.length/2)];
const repeats=10;
const lanes=[
 ['legal-movegen',j=>{let n=0;for(let k=0;k<repeats;k++)for(const b of boards[j])n+=b.legalMoves().length;return n},fens.length*repeats],
 ['fen-parse-write',j=>{let n=0;for(let k=0;k<repeats;k++)for(const f of fens)n+=new engines[j].Board(f).toFen().length;return n},fens.length*repeats],
 ['validated-replay',j=>{let n=0;for(let k=0;k<repeats;k++)for(const game of games){const b=new engines[j].Board();for(const u of game){const m=b.parseUci(u);if(m==null)throw Error(u);b.makeMove(m);n++}}return n},games.reduce((n,g)=>n+g.length,0)*repeats]
];
for(const [name,work,units] of lanes){
 const sums=[work(0),work(1)];if(sums[0]!==sums[1])throw Error(name+' checksum');
 work(0);work(1);
 const ms=[[],[]],cpuMs=[[],[]];
 for(let i=0;i<11;i++)for(const j of(i%2?[1,0]:[0,1])){
  global.gc?.();const t=performance.now(),cpu=process.cpuUsage();const n=work(j);
  ms[j].push(performance.now()-t);const d=process.cpuUsage(cpu);cpuMs[j].push((d.user+d.system)/1000);
  if(n!==sums[0])throw Error(name+' checksum');
 }
 console.log(name,JSON.stringify({units,oldRate:units*1000/median(ms[0]),newRate:units*1000/median(ms[1]),ratio:median(ms[0])/median(ms[1]),cpuRatio:median(cpuMs[0])/median(cpuMs[1]),oldMs:ms[0],newMs:ms[1],oldCpuMs:cpuMs[0],newCpuMs:cpuMs[1]}));
}
