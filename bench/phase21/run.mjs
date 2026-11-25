import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openSync,closeSync} from 'node:fs';
const script=n=>fileURLToPath(new URL(n,import.meta.url));
const entries={baseline:'ci-benchmark/baseline/dist/fast/index.js',candidate:'dist/fast/index.js',published:'ci-benchmark/package/dist/index.js'};
function run(args,env={},log){
 let fd;
 try{
  if(log)fd=openSync(log,'w');
  const r=spawnSync(process.execPath,args,{stdio:log?['ignore',fd,fd]:'inherit',env:{...process.env,...env}});
  if(r.status!==0)throw Error('worker failed '+args.join(' '));
 }finally{if(fd!==undefined)closeSync(fd)}
}
for(const name of ['baseline','candidate']){
 run([script('startpos.mjs'),entries[name]],{},'benchmark-results/startpos-'+name+'.json');
 const entry=name==='baseline'?'ci-benchmark/baseline/dist/index.js':'dist/index.js';
 for(const mode of ['forced','natural']){
  run(['--expose-gc','--trace-opt','--trace-deopt',script('start-free.mjs'),name,entry,mode,'benchmark-results/trace-'+name+'-'+mode+'.json'],{WARMUPS:'8',RUNS:'9',BATCHES:'2'},'benchmark-results/trace-'+name+'-'+mode+'.log');
 }
}
for(const prime of ['0','1']){
 for(const name of ['baseline','candidate','published']){
  run(['--expose-gc',script('start-free.mjs'),name,entries[name],'forced','benchmark-results/start-free-'+name+'-'+prime+'.json'],{EXCLUDE_INITIAL:'1',PRIME_INITIAL:prime,WARMUPS:'8',RUNS:'15',BATCHES:'4'});
 }
}
