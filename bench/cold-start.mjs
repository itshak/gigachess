import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {cpus,platform,arch,release} from 'node:os';
import {fileURLToPath} from 'node:url';
const mode=process.argv[2];
const fen='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
if(mode && mode!=='--measure'){
 const t=performance.now();
 let m,b,n,imported;
 if(mode==='giga-cold' || mode==='giga-ready'){
  m=await import('../dist/fast/index.js');imported=performance.now();
  if(mode==='giga-ready')await Promise.all([m.ensureMagicTablesLoaded(),m.ensureZobristLoaded()]);
  b=new m.Board(fen);n=b.legalMoves().length;
 }else if(mode==='ultra-default'){
  m=await import('ultrachess');imported=performance.now();b=await m.Chess.create(fen);n=b.legalMoves().length;b.dispose();
 }else if(mode==='ultra-inline'){
  m=await import('ultrachess/inline');imported=performance.now();b=m.Chess.createSync(fen);n=b.legalMoves().length;b.dispose();
 }else throw Error(mode);
 if(n!==20)throw Error('first legal move count '+n);
 console.log(JSON.stringify({importMs:imported-t,firstListMs:performance.now()-t,count:n}));
}else{
 const modes=['giga-cold','giga-ready','ultra-default','ultra-inline'];
 const samples=Object.fromEntries(modes.map(m=>[m,[]]));
 for(let i=0;i<15;i++)for(let j=0;j<modes.length;j++){
  const m=modes[(i+j)%modes.length],r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),m],{encoding:'utf8'});
  if(r.status!==0)throw Error(m+' '+r.stderr);samples[m].push(JSON.parse(r.stdout.trim()));
 }
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
 const data={node:process.version,cpu:cpus()[0].model,platform:platform(),arch:arch(),release:release(),runs:15,excludesProcessLaunch:true,samples,summary:Object.fromEntries(modes.map(m=>[m,{importMs:median(samples[m].map(x=>x.importMs)),firstListMs:median(samples[m].map(x=>x.firstListMs))}]))};
 writeFileSync('bench/results/cold-start-0.6.0.json',JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify(data.summary,null,2));console.log(data.cpu);
}
