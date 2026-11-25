import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openSync,closeSync} from 'node:fs';
const script=n=>fileURLToPath(new URL(n,import.meta.url));
const modes=[['native','forced'],['retain','forced'],['retain','natural'],['native','natural']];
for(let rep=0;rep<2;rep++){
 for(const [retention,gc] of rep===0?modes:[...modes].reverse()){
  const fd=openSync('benchmark-results/mixed-'+retention+'-'+gc+'-'+rep+'.json','w');
  try {
   const r=spawnSync(process.execPath,['--expose-gc','--import','./ci-benchmark/tools/node_modules/tsx/dist/loader.mjs',script('mixed.mjs'),'--baseline','ci-benchmark/baseline/dist/fast/index.js','--drumevp','ci-benchmark/drumevp','--published','ci-benchmark/package/dist/index.js','--warmups','12','--runs','21'],{stdio:['ignore',fd,'inherit'],env:{...process.env,RETENTION:retention,GC_MODE:gc}});
   if(r.status!==0)throw Error('mixed failed '+retention+' '+gc);
  } finally {closeSync(fd)}
 }
}
for(const [retention,gc] of modes){
 for(const [name,entry] of [['baseline','dist/fast/index.js'],['published','ci-benchmark/package/dist/index.js']]){
  const r=spawnSync(process.execPath,['--expose-gc',script('retention.mjs'),name,entry,gc,'benchmark-results/isolated-'+name+'-'+retention+'-'+gc+'.json'],{stdio:'inherit',env:{...process.env,RETENTION:retention}});
  if(r.status!==0)throw Error('isolated failed '+name);
 }
}
