import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const load=(dir,file)=>import(pathToFileURL(resolve(dir,'dist',file)).href);
const modules=await Promise.all(['baseline','candidate'].map(d=>load(d,'attacks.js')));
const {Board}=await load('baseline','fast/index.js');
const fens=JSON.parse(readFileSync('corpus/corpus.json','utf8')).fens;
const cases=fens.map(f=>new Board(f).occupied);
let seed=0x31ab95d;
function rnd(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0}
const random=Array.from({length:20000},()=>({lo:rnd(),hi:rnd()}));
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const warmups=Number(process.env.BENCH_WARMUPS||8),runs=Number(process.env.BENCH_RUNS||15);
const results={runtime:process.version,arch:process.arch,lanes:{}};
for(const mode of ['cold','loaded']){
 if(mode==='loaded'){
  for(const m of modules){const t=performance.now();await m.ensureMagicTablesLoaded();console.log('load ms',performance.now()-t)}
 }
 for(const [dataset,positions] of [['real',cases],['random',random]])for(const role of ['rookAttacks','bishopAttacks','queenAttacks']){
  const key=mode+'-'+dataset+'-'+role,work=modules.map(m=>{const fn=m[role];return ()=>{let sum=0;for(let i=0;i<positions.length;i++){const o=positions[i];for(let s=0;s<64;s+=4){const a=fn((s+i)%64,o);sum^=a.lo^a.hi}}return sum}});
  for(let i=0;i<positions.length;i+=17)for(let s=0;s<64;s+=7){
   const a=modules[0][role](s,positions[i]),b=modules[1][role](s,positions[i]);if(a.lo!==b.lo||a.hi!==b.hi)throw Error(key+' parity');
  }
  const expected=work[0]();if(work[1]()!==expected)throw Error(key+' checksum');
  const wall=[[],[]],cpu=[[],[]];for(let i=-warmups;i<runs;i++)for(const j of(i%2?[1,0]:[0,1])){
   if(globalThis.Bun)Bun.gc(true);else global.gc?.();
   const c=process.cpuUsage(),t=performance.now(),n=work[j](),ms=performance.now()-t,d=process.cpuUsage(c);
   if(n!==expected)throw Error(key+' checksum');if(i>=0){wall[j].push(ms);cpu[j].push((d.user+d.system)/1000)}
  }
  const units=positions.length*16;
  results.lanes[key]={wall,cpu,baseRate:units*1000/median(wall[0]),candidateRate:units*1000/median(wall[1]),ratio:median(wall[0])/median(wall[1]),cpuRatio:median(cpu[0])/median(cpu[1])};
  console.log(key,JSON.stringify(results.lanes[key]));writeFileSync('../benchmark-results/sliders.json',JSON.stringify(results,null,2));
 }
}
