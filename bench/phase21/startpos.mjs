import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const M=await import(pathToFileURL(resolve(process.argv[2])).href);
await M.ensureMagicTablesLoaded();await M.ensureZobristLoaded();
const ref=new M.Board(),n=100000,expected=(ref.occupied.lo>>>0)*n,wall=[];
for(let i=-5;i<9;i++){
 let sum=0;const t=performance.now();
 for(let j=0;j<n;j++)sum+=new M.Board().occupied.lo>>>0;
 const dt=performance.now()-t;if(sum!==expected)throw Error('startpos checksum');
 if(i>=0)wall.push(dt);
}
console.log(JSON.stringify({node:process.version,n,wall,rate:n*1000/[...wall].sort((a,b)=>a-b)[4]}));
