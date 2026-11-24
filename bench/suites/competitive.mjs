// Optional competitor lane. Opt in through bench-real --suite competitive;
// intentionally excluded from default/CI suites (requires a pinned external
// checkout, an optional published package, and ~minutes of local CPU work).
import {spawnSync} from "node:child_process";
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {gate} from "./lib/common.mjs";
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1]};
export const name="competitive";
export async function run(opts={}){
 const source=arg("--drumevp",process.env.GIGACHESS_DRUMEVP_CHECKOUT);
 const published=arg("--published",process.env.GIGACHESS_DRUMEVP_PUBLISHED);
 const quick=opts.quick??process.argv.includes("--quick");
 const runs=arg("--runs",quick?"3":"7");
 if(!source){
  return {metrics:{},gates:[gate("competitor source checkout provided",false,"--drumevp /pinned/repo","missing")]};
 }
 const tmp=mkdtempSync(join(tmpdir(),"giga-competitive-"));
 const output=join(tmp,"results.json");
 try{
  const runner=["--expose-gc","--import","tsx","bench/bench-competitive.mjs","--drumevp",resolve(source),"--runs",runs,"--json",output];
  if(quick)runner.push("--quick");
  if(published)runner.push("--published",resolve(published));
  const r=spawnSync(process.execPath,runner,{cwd:resolve(import.meta.dirname,"../.."),stdio:"inherit",timeout:900000});
  const result=readFileSync(output,"utf8");
  const data=JSON.parse(result);
  return {metrics:{...data.timings,correctness:data.correctness,environment:{node:data.node,cpu:data.cpu}},
    gates:[gate("external competitor: FEN, legal moves, replay & perft parity",
     r.status===0&&data.correctness.passed,"0 mismatches",String(data.correctness.failures)+" mismatches")]};
 }finally{rmSync(tmp,{recursive:true,force:true})}
}
