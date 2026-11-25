import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {Chess} from 'chess.js';
const argv=process.argv.slice(2),opt=(k,d)=>{const i=argv.indexOf(k);return i<0?d:argv[i+1]};
const prev=await import(pathToFileURL(resolve(opt('--baseline',''))).href);
const candidate=await import('../dist/fast/index.js');
const {ChessEngine:Published}=await import(pathToFileURL(resolve(opt('--published',''))).href);
const root=resolve(opt('--drumevp',''));
const {default:parse}=await import(pathToFileURL(join(root,'src/engine/fen/fenToPosition/generateFenToPosition.ts')).href);
const {default:generate}=await import(pathToFileURL(join(root,'src/engine/movegen/generateLegalMoves.ts')).href);
await Promise.all([prev.ensureMagicTablesLoaded(),candidate.ensureMagicTablesLoaded(),prev.ensureZobristLoaded(),candidate.ensureZobristLoaded()]);
const fens=readFileSync(new URL('./data/perftsuite.epd',import.meta.url),'utf8').trim().split(/\r?\n/).map(l=>l.split(';')[0].trim());
let seed=0x4d0bc25;
function random(n){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%n}
while(fens.length<1000){const c=new Chess();for(let p=0;p<100&&fens.length<1000;p+=1){const moves=c.moves({verbose:true});if(!moves.length)break;fens.push(c.fen({forceEnpassantSquare:true}));c.move(moves[random(moves.length)])}}
const datasets=[...fens,...fens,...fens,...fens];
const entries=[
 ['phase7-compact',f=>new prev.Board(f),b=>b.legalMoves()],
 ['direct',f=>new candidate.Board(f),b=>b.legalMoves()],
 ['published',f=>new Published(f),b=>b.generateLegalMoves()],
 ['source',parse,generate]
];
const expected=datasets.reduce((n,f)=>n+new prev.Board(f).legalMoves().length,0);
const samples=Object.fromEntries(entries.map(([id])=>[id,{wallMs:[],cpuMs:[]}]));
function run(i,record){
 const [id,create,gen]=entries[i],boards=datasets.map(f=>create(f));
 global.gc?.();
 const startCpu=process.cpuUsage(),t=performance.now();let n=0;
 for(const b of boards)n+=gen(b).length;
 const elapsed=performance.now()-t,cpu=process.cpuUsage(startCpu);
 if(n!==expected)throw Error(id+' count mismatch '+n+' vs '+expected);
 if(record){samples[id].wallMs.push(elapsed);samples[id].cpuMs.push((cpu.user+cpu.system)/1000)}
}
for(let i=0;i<4;i++)for(let k=0;k<2;k++)run(i,false);
for(let i=0;i<11;i++)for(let j=0;j<4;j++)run((i+j)%4,true);
const med=x=>[...x].sort((a,b)=>a-b)[Math.floor(x.length/2)];
console.log(JSON.stringify({runtime:process.version,positions:datasets.length,rounds:11,expected,results:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,{rate:datasets.length/med(v.wallMs)*1000,cpuRate:datasets.length/med(v.cpuMs)*1000,...v}]))},null,2));
