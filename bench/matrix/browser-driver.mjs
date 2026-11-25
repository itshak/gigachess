import {build} from 'esbuild';
import {chromium,firefox,webkit} from '../../ci-benchmark/tools/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const engine=process.argv[2],launcher={chromium,firefox,webkit}[engine];
if(!launcher)throw Error('choose browser engine');
await build({entryPoints:['bench/matrix/browser.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'ci-benchmark/browser.js',external:['node:*','fs'],plugins:[{name:'published-browser-entry',setup(b){b.onResolve({filter:/ci-benchmark\/package\/dist\/index\.js$/},()=>({path:resolve('ci-benchmark/package/dist/index.browser.js')}))}}]});
const script=readFileSync('ci-benchmark/browser.js');
const server=createServer((req,res)=>{if(req.url==='/browser.js'){res.setHeader('Content-Type','text/javascript');res.end(script)}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><script type="module" src="/browser.js"></script>')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launcher.launch({headless:true});
try{
 const page=await browser.newPage();await page.exposeFunction('saveBenchmarkCheckpoint',r=>writeFileSync('benchmark-results/browser-'+engine+'.json',JSON.stringify(r,null,2)));page.on('console',m=>console.log(m.text()));page.on('pageerror',e=>console.error(e));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>typeof globalThis.runChessBenchmark==='function',null,{timeout:60000});
 const smoke=process.argv.includes('--smoke');
 const data=JSON.parse(readFileSync('ci-benchmark/corpus.json','utf8'));
 const result=await page.evaluate(async ({data,engine,smoke})=>globalThis.runChessBenchmark(data,{runs:smoke?1:21,warmups:smoke?0:12,positions:smoke?30:10000,games:smoke?2:300,deep:false,smoke,metadata:{engine,userAgent:navigator.userAgent},checkpoint:r=>globalThis.saveBenchmarkCheckpoint(r),log:console.log}),{data,engine,smoke});
 result.metadata.browserVersion=browser.version();
 writeFileSync('benchmark-results/browser-'+engine+'.json',JSON.stringify(result,null,2));
 if(result.failures.length)process.exitCode=1;
}finally{await browser.close();server.close()}
