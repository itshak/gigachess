import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const worker=fileURLToPath(new URL('./isolated-worker.mjs',import.meta.url));
const paths={baseline:'ci-benchmark/baseline/dist/fast/index.js',candidate:'dist/fast/index.js',published:'ci-benchmark/package/dist/index.js'};
const orders=[['baseline','candidate','published'],['published','candidate','baseline'],['candidate','baseline','published']];
const trials=[];
for(const order of orders){
 const result={};
 for(const name of order){
  const r=spawnSync(process.execPath,['--expose-gc',worker,name,paths[name]],{encoding:'utf8',maxBuffer:2**20});
  if(r.status!==0)throw Error(name+' '+r.stderr+' '+r.stdout);
  result[name]=JSON.parse(r.stdout.trim());
 }
 trials.push(result);
 const rows=Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v.rate]));
 console.log(JSON.stringify({order,rates:rows,vsBase:rows.candidate/rows.baseline,vsPublished:rows.candidate/rows.published}));
 writeFileSync('benchmark-results/isolated.json',JSON.stringify({trials},null,2));
}
