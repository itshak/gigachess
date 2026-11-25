import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const worker=fileURLToPath(new URL('./worker.mjs',import.meta.url));
const entries={baseline:'ci-benchmark/baseline/dist/fast/index.js',candidate:'dist/fast/index.js',published:'ci-benchmark/package/dist/index.js'};
for(let rep=0;rep<2;rep++){
 for(const mode of rep===0?['forced','natural']:['natural','forced']){
  const order=rep===0?['baseline','candidate','published']:['published','candidate','baseline'];
  for(const name of order){
   const r=spawnSync(process.execPath,['--expose-gc',worker,name,entries[name],mode,'benchmark-results/gc-'+name+'-'+mode+'-'+rep+'.json'],{stdio:'inherit'});
   if(r.status!==0)throw Error('worker failed '+name+' '+mode);
  }
 }
}
