// Cold-import benchmark: separate fresh Node process for every observation.
import {spawnSync} from "node:child_process";
import {writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {performance} from "node:perf_hooks";
const root=resolve(import.meta.dirname,"..");
const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1]};
const published=opt("--published",null),runs=Number(opt("--runs",7)),out=opt("--json",null);
if(!published)throw Error("--published PATH is required");
if(!Number.isInteger(runs)||runs<3||runs>30)throw Error("--runs 3..30");
const names=[
 ["gigachess-native-board",resolve(root,"dist/board.js"),"Board"],
 ["gigachess-root-api",resolve(root,"dist/index.js"),"Board"],
 ["drumevp-published",resolve(published),"ChessEngine"],
 ["chess.js",resolve(root,"node_modules/chess.js/dist/esm/chess.js"),"Chess"]
];
const child=[
 'import {performance} from "node:perf_hooks";',
 'import {pathToFileURL} from "node:url";',
 'const t=performance.now();',
 'const m=await import(pathToFileURL(process.argv[1]).href);',
 'const importMs=performance.now()-t;',
 'const b=new m[process.argv[2]]();',
 'const n=b.generateLegalMoves?.().length??b.legalMoves?.().length??b.moves?.().length;',
 'if(n!==20)throw Error("unexpected startpos "+n);',
 'console.log(JSON.stringify({importMs,firstMoveMs:performance.now()-t,heap:process.memoryUsage().heapUsed}));'
].join("\n");
const results={node:process.version,date:new Date().toISOString(),runs,results:{}};
for(const [name,module,cls]of names){
 const samples=[];
 for(let i=0;i<runs;i++){
  const t=performance.now();
  const r=spawnSync(process.execPath,["--input-type=module","-e",child,module,cls],{encoding:"utf8",timeout:15000,cwd:root});
  const processMs=performance.now()-t;
  if(r.status!==0)throw Error("cold "+name+" "+r.stderr);
  samples.push({...JSON.parse(r.stdout.trim()),processMs});
 }
 const sorted=k=>samples.map(x=>x[k]).sort((a,b)=>a-b);
 const median=k=>+sorted(k)[Math.floor(runs/2)].toFixed(3);
 results.results[name]={importMedianMs:median("importMs"),firstMoveMedianMs:median("firstMoveMs"),processMedianMs:median("processMs"),heapMedianMiB:+(median("heap")/1048576).toFixed(2),raw:samples};
 console.log(name,JSON.stringify({...results.results[name],raw:undefined}));
}
results.notes=[
 "Cold Node ESM import includes module parse/evaluation; not a browser startup metric.",
 "drumevp is a search/NNUE engine, while GigaChess native Board is a focused chess core; bundle/feature differences are explicit.",
 "The optional npm postinstall model download is not run (npm pack --ignore-scripts).",
 "Each observation uses a separate Node process; processMs includes Node startup, importMs excludes it."
];
if(out)writeFileSync(resolve(out),JSON.stringify(results,null,2)+"\n");
