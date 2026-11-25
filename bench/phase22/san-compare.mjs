import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [corpus,out,...paths]=process.argv.slice(2);
const engines=await Promise.all(paths.map(p=>import(pathToFileURL(resolve(p)).href)));
for(const e of engines){await e.ensureMagicTablesLoaded();await e.ensureZobristLoaded()}
const fens=JSON.parse(readFileSync(corpus,'utf8')).fens.slice(0,Number(process.env.SAN_POSITIONS||4000));
const hash=createHash('sha256');let moves=0;
for(const f of fens){
 const lists=engines.map(e=>{const b=new e.Board(f);return Array.from(b.legalMoves(),m=>[b.toUci(m),b.toSan(m)])});
 const expected=JSON.stringify(lists[0]);
 if(lists.some(l=>JSON.stringify(l)!==expected))throw Error('ordered SAN/UCI mismatch '+f);
 hash.update(expected+'\n');moves+=lists[0].length;
}
const result={positions:fens.length,moves,sha256:hash.digest('hex'),paths,modes:{}};
const med=x=>[...x].sort((a,b)=>a-b)[Math.floor(x.length/2)];
for(const mode of ['forced','natural']){
 const samples=engines.map(()=>[]);let checksum;
 for(let i=-5;i<9;i++)for(let j=0;j<engines.length;j++){
  const k=(i+5+j)%engines.length,bs=fens.map(f=>new engines[k].Board(f));
  if(mode==='forced')global.gc();
  const t=performance.now();let n=0;
  for(const b of bs)for(const m of b.legalMoves())n+=b.toSan(m).length;
  const dt=performance.now()-t;
  if(checksum===undefined)checksum=n;
  if(n!==checksum)throw Error('SAN checksum');
  if(i>=0)samples[k].push(dt);
 }
 result.modes[mode]=samples.map(x=>({ms:x,rate:fens.length*1000/med(x),ratio:med(samples[0])/med(x)}));
 console.log(mode,result.modes[mode].map(x=>Math.round(x.rate)));
}
writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log('Exact parity',result.positions,result.moves,result.sha256);
