// Compare exact published ESM implementations, independently of TS source loaders.
// Works under Node and Bun. No constructor, table loading, or warmup is timed.
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1]};
const runs=Number(opt('--runs',11));
if(!Number.isInteger(runs)||runs<9)throw Error('At least 9 rounds required');
const old=await import(pathToFileURL(resolve(opt('--baseline',''))).href);
const candidate=await import('../dist/fast/index.js');
const {ChessEngine:Published}=await import(pathToFileURL(resolve(opt('--published',''))).href);
await Promise.all([old.ensureMagicTablesLoaded(),candidate.ensureMagicTablesLoaded(),old.ensureZobristLoaded(),candidate.ensureZobristLoaded()]);
const cases=[
 ['start','rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',5,4865609],
 ['kiwipete','r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',4,4085603],
 ['endgame','8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',5,674624],
 ['promotion','rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',4,2103487]
];
const fens=readFileSync(new URL('./data/perftsuite.epd',import.meta.url),'utf8').trim().split(/\r?\n/).map(l=>l.split(';')[0].trim());
fens.push(...readFileSync(new URL('./data/wac_150.epd',import.meta.url),'utf8').trim().split(/\r?\n/).map(l=>l.split(';')[0].trim().replace(/\s+bm\s+.*$/,'')+' 0 1'));
const engines=[old.Board,candidate.Board,Published],ids=['phase6','candidate','drumevp-published'];
const med=x=>[...x].sort((a,b)=>a-b)[Math.floor(x.length/2)];
function lane(name,sets,units){
 const run=j=>sets[j].reduce((total,[b,d])=>total+b.perft(d),0);
 for(let j=0;j<3;j++)for(let k=0;k<2;k++)if(run(j)!==units)throw Error(name+' warmup mismatch '+ids[j]);
 const rows=ids.map(()=>({wallMs:[],cpuMs:[]}));
 for(let i=0;i<runs;i++)for(let k=0;k<3;k++){
  const j=(i+k)%3;
  if(globalThis.Bun)Bun.gc(true);else globalThis.gc?.();
  const startCpu=process.cpuUsage(),t=performance.now(),count=run(j),elapsed=performance.now()-t;
  const cpu=process.cpuUsage(startCpu);
  if(count!==units)throw Error(name+' mismatch '+ids[j]);
  rows[j].wallMs.push(elapsed);rows[j].cpuMs.push((cpu.user+cpu.system)/1000);
 }
 const data=Object.fromEntries(rows.map((r,j)=>[ids[j],{mnps:units/med(r.wallMs)/1000,cpuMnps:units/med(r.cpuMs)/1000,...r}]));
 console.log(name,JSON.stringify({nodes:units,runs,...data}));
}
console.log('runtime',JSON.stringify({node:process.version,bun:globalThis.Bun?.version??null,v8:process.versions.v8??null}));
for(const [id,fen,depth,n] of cases)lane(id,engines.map(E=>[[new E(fen),depth]]),n);
const sets=engines.map(E=>fens.map(f=>[new E(f),3]));
let total=0;
for(let i=0;i<fens.length;i++){
 const counts=sets.map(s=>s[i][0].perft(3));
 if(counts.some(n=>n!==counts[0]))throw Error('corpus mismatch '+fens[i]);
 total+=counts[0];
}
lane('mixed',sets,total);
