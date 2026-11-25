import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {Chess} from 'chess.js';
const [basePath,candPath,pubPath,out]=process.argv.slice(2);
const A=await import(pathToFileURL(resolve(basePath)).href);
const B=await import(pathToFileURL(resolve(candPath)).href);
const D=await import(pathToFileURL(resolve(pubPath)).href);
await Promise.all([A.ensureMagicTablesLoaded(),B.ensureMagicTablesLoaded(),A.ensureZobristLoaded(),B.ensureZobristLoaded()]);
const fens=readFileSync(new URL('../data/perftsuite.epd',import.meta.url),'utf8').trim().split(/\r?\n/).map(l=>l.split(';')[0].trim());
let seed=0x4d0bc25;
function rnd(n){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%n}
while(fens.length<1000){const c=new Chess();for(let p=0;p<100&&fens.length<1000;p++){const ms=c.moves({verbose:true});if(!ms.length)break;fens.push(c.fen({forceEnpassantSquare:true}));c.move(ms[rnd(ms.length)])}}
const data=Array.from({length:4},()=>fens).flat();
const names=['baseline','candidate','published'];
const creates=[f=>new A.Board(f),f=>new B.Board(f),f=>new D.ChessEngine(f)];
const gens=[b=>b.legalMoves(),b=>b.legalMoves(),b=>b.generateLegalMoves()];
function generic(bs,g){let n=0;for(const b of bs)n+=g(b).length;return n}
function base(bs){let n=0;for(const b of bs)n+=b.legalMoves().length;return n}
function cand(bs){let n=0;for(const b of bs)n+=b.legalMoves().length;return n}
function pub(bs){let n=0;for(const b of bs)n+=b.generateLegalMoves().length;return n}
const spec=[base,cand,pub],warm=Number(process.env.WARMUPS||8),runs=Number(process.env.RUNS||11);
const results={runtime:process.version,positions:data.length,warm,runs,lanes:{}};
const med=x=>[...x].sort((a,b)=>a-b)[Math.floor(x.length/2)];
const selected=process.env.CALLSITE_MODE;
for(const [mode,force] of [['generic',true],['specific',true],['specific',false],['generic',false]]){
 if(selected && selected!==mode+'-'+(force?'forced':'natural'))continue;
 const stats=Object.fromEntries(names.map(n=>[n,{wall:[],cpu:[]}]));
 for(let i=-warm;i<runs;i++)for(let j=0;j<3;j++){
  const k=(i+warm+j)%3,bs=data.map(creates[k]);
  if(force)global.gc?.();
  const cpu=process.cpuUsage(),t=performance.now();
  const n=mode==='generic'?generic(bs,gens[k]):spec[k](bs);
  const elapsed=performance.now()-t,c=process.cpuUsage(cpu);
  if(n!==112712)throw Error(names[k]+' '+n);
  if(i>=0){stats[names[k]].wall.push(elapsed);stats[names[k]].cpu.push((c.user+c.system)/1000);}
 }
 const lanes=Object.fromEntries(names.map(n=>[n,{...stats[n],rate:4000000/med(stats[n].wall),cpuRate:4000000/med(stats[n].cpu)}]));
 const id=mode+'-'+(force?'forced':'natural');results.lanes[id]=lanes;
 console.log(id,JSON.stringify(Object.fromEntries(names.map(n=>[n,Math.round(lanes[n].rate)]))), 'candidate/published',lanes.candidate.rate/lanes.published.rate);
 if(out)writeFileSync(out,JSON.stringify(results,null,2)+'\n');
}
