import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance,PerformanceObserver} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {Chess} from 'chess.js';
const [name,entry,mode,out]=process.argv.slice(2);
const retention=process.env.RETENTION||'native';
const M=await import(pathToFileURL(resolve(entry)).href);
const d=name==='published';
if(!d){await M.ensureMagicTablesLoaded();await M.ensureZobristLoaded()}
const fens=readFileSync(new URL('../data/perftsuite.epd',import.meta.url),'utf8').trim().split(/\r?\n/).map(l=>l.split(';')[0].trim());
let seed=0x4d0bc25;
function rnd(n){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%n}
while(fens.length<1000){const c=new Chess();for(let p=0;p<100&&fens.length<1000;p++){const ms=c.moves({verbose:true});if(!ms.length)break;fens.push(c.fen({forceEnpassantSquare:true}));c.move(ms[rnd(ms.length)])}}
const data=Array.from({length:4},()=>fens).flat();
const create=d?f=>new M.ChessEngine(f):f=>new M.Board(f);
function genG(bs,held){let n=0;for(let i=0;i<bs.length;i++){const m=bs[i].legalMoves();if(held)held[i]=m;n+=m.length}return n}
function genD(bs,held){let n=0;for(let i=0;i<bs.length;i++){const m=bs[i].generateLegalMoves();if(held)held[i]=m;n+=m.length}return n}
const gen=d?genD:genG;
const roots=process.env.KEEP_ROOTS==='1'?data.map(create):null;
const rootLists=roots && process.env.ROOT_LISTS!=='0'?new Array(roots.length):null;
if(roots && rootLists)gen(roots,rootLists);
const gcPosition=process.env.GC_POSITION||'both';

let events=[],retainedChecksum;
const obs=new PerformanceObserver(list=>{for(const e of list.getEntries())events.push({start:e.startTime,ms:e.duration,kind:e.detail.kind})});
obs.observe({entryTypes:['gc']});
const warm=Number(process.env.WARMUPS||8),runs=Number(process.env.RUNS||15),batches=Number(process.env.BATCHES||4);
const samples=[];
for(let i=-warm;i<runs;i++){
 const round=[];
 for(let j=0;j<batches;j++){
  // Yield between batches outside measurement so GC entries can be delivered.
  await new Promise(setImmediate);
  const cpu=process.cpuUsage(),start=performance.now();
  if(mode==='forced' && gcPosition==='before-create')global.gc();
  let boards=data.map(create);
  const prepared=performance.now(),memBefore=process.memoryUsage();
  if(mode==='forced' && gcPosition==='both')global.gc();
  const ready=performance.now(),gcpu=process.cpuUsage();
  let held=retention==='retain'?new Array(boards.length):null;
  const count=gen(boards,held),generated=performance.now(),gdelta=process.cpuUsage(gcpu);
  if(count!==112712)throw Error(name+' count '+count);
  if(held){
   if(held.length!==data.length)throw Error('retention');
   let checksum=0;
   for(const list of held)for(const move of list)checksum=(checksum+move)>>>0;
   if(retainedChecksum===undefined)retainedChecksum=checksum;
   if(checksum!==retainedChecksum)throw Error('retained words changed');
  }
  const liveMemory=process.memoryUsage();
  held=null;boards=null;
  if(mode==='forced' && gcPosition!=='before-create')global.gc();
  const end=performance.now(),delta=process.cpuUsage(cpu),memAfter=process.memoryUsage();
  round.push({start,prepared,ready,generated,end,genCpu:(gdelta.user+gdelta.system)/1000,totalCpu:(delta.user+delta.system)/1000,memBefore,memAfter,liveMemory});
 }
 if(i>=0)samples.push(round);
}
await new Promise(setImmediate);await new Promise(setImmediate);
events.push(...obs.takeRecords().map(e=>({start:e.startTime,ms:e.duration,kind:e.detail.kind})));obs.disconnect();
const med=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const rate=fn=>data.length*batches*1000/med(samples.map(r=>r.reduce((s,b)=>s+fn(b),0)));
const rootChecksum=roots?(rootLists?rootLists.reduce((n,m)=>n+m.length,0):roots.length):null;
const result={name,mode,retention,gcPosition,rootChecksum,retainedChecksum,node:process.version,arch:process.arch,platform:process.platform,corpusSha:createHash('sha256').update(data.join('\n')).digest('hex'),checksum:112712,positions:data.length*batches,rounds:runs,genRate:rate(b=>b.generated-b.ready),totalRate:rate(b=>b.end-b.start),genCpuRate:rate(b=>b.genCpu),totalCpuRate:rate(b=>b.totalCpu),samples,gc:events};
writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(name,mode,JSON.stringify({gen:Math.round(result.genRate),total:Math.round(result.totalRate),genCpu:Math.round(result.genCpuRate),totalCpu:Math.round(result.totalCpuRate),gc:events.length}));
