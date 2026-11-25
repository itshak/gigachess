import {readFileSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import {runMatrix} from './run.mjs';
const argv=process.argv.slice(2),opt=(k,d)=>{const i=argv.indexOf(k);return i<0?d:argv[i+1]};
const cpu=()=>{const x=process.cpuUsage();return(x.user+x.system)/1000};
const out=opt('--out','benchmark-results/matrix.json');
const checkpoint=r=>writeFileSync(out,JSON.stringify(r,null,2));
const result=await runMatrix(JSON.parse(readFileSync('ci-benchmark/corpus.json','utf8')),{
 runs:Number(opt('--runs',21)),warmups:Number(opt('--warmups',12)),deepRuns:Number(opt('--deep-runs',7)),
 positions:Number(opt('--positions',20000)),games:Number(opt('--games',1000)),deep:!argv.includes('--no-deep'),smoke:argv.includes('--smoke'),
 metadata:{runtime:process.version,bun:globalThis.Bun?.version??null,deno:globalThis.Deno?.version?.deno??null,v8:process.versions.v8,arch:process.arch,platform:process.platform,cpu:os.cpus()[0]?.model,commit:process.env.GITHUB_SHA},
 checkpoint,gc:()=>{if(globalThis.Bun)Bun.gc(true);else globalThis.gc?.()},cpu,log:console.log
});
checkpoint(result);
if(result.failures.length)process.exitCode=1;
