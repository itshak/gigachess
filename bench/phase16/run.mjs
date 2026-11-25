import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const worker=fileURLToPath(new URL('./callsite.mjs',import.meta.url));
const modes=['generic-forced','specific-forced','specific-natural','generic-natural'];
for(let rep=0;rep<2;rep++){
 for(const mode of rep===0?modes:[...modes].reverse()){
  const r=spawnSync(process.execPath,['--expose-gc',worker,'ci-benchmark/baseline/dist/fast/index.js','dist/fast/index.js','ci-benchmark/package/dist/index.js','benchmark-results/'+mode+'-'+rep+'.json'],{stdio:'inherit',env:{...process.env,CALLSITE_MODE:mode,WARMUPS:'12',RUNS:'21'}});
  if(r.status!==0)throw Error('Failed '+mode);
 }
}
