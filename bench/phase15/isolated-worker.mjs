import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {Chess} from 'chess.js';
const [kind,entry]=process.argv.slice(2);
const m=await import(pathToFileURL(resolve(entry)).href);
const published=kind==='published';
if(!published){await m.ensureMagicTablesLoaded();await m.ensureZobristLoaded()}
let seed=0x4d0bc25;
function random(n){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%n}
const fens=readFileSync(new URL('../data/perftsuite.epd',import.meta.url),'utf8').trim().split(/\r?\n/).map(l=>l.split(';')[0].trim());
while(fens.length<1000){const c=new Chess();for(let p=0;p<100&&fens.length<1000;p++){const moves=c.moves({verbose:true});if(!moves.length)break;fens.push(c.fen({forceEnpassantSquare:true}));c.move(moves[random(moves.length)])}}
const data=Array.from({length:4},()=>fens).flat();
const create=published?f=>new m.ChessEngine(f):f=>new m.Board(f);
const gen=published?b=>b.generateLegalMoves():b=>b.legalMoves();
const wall=[],cpu=[];
const lifecycle=process.env.ISOLATED_MODE==="lifecycle";
const warm=Number(process.env.ISOLATED_WARMUPS||12),rounds=Number(process.env.ISOLATED_RUNS||15),batches=Number(process.env.ISOLATED_BATCHES||4);
for(let i=-warm;i<rounds;i++){
 let ms=0,cm=0;
 for(let j=0;j<batches;j++){
  const boards=lifecycle?null:data.map(create);global.gc?.();
  const c=process.cpuUsage(),t=performance.now();let sum=0;
  if(lifecycle){for(const fen of data)sum+=gen(create(fen)).length;}else{for(const board of boards)sum+=gen(board).length;}
  ms+=performance.now()-t;const d=process.cpuUsage(c);cm+=(d.user+d.system)/1000;
  if(sum!==112712)throw Error(kind+' unexpected count '+sum);
 }
 if(i>=0){wall.push(ms);cpu.push(cm)}
}
const med=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
console.log(JSON.stringify({kind,mode:lifecycle?"lifecycle":"generation",node:process.version,arch:process.arch,positions:data.length*batches,rounds,warmups:warm,rate:data.length*batches*1000/med(wall),cpuRate:data.length*batches*1000/med(cpu),wall,cpu}));
