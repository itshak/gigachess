import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
const base=await import(pathToFileURL(process.argv[2]).href);
const cand=await import('../dist/attacks.js');
await Promise.all([base.ensureMagicTablesLoaded(),cand.ensureMagicTablesLoaded()]);
let s=0x51eac347;function rnd(){s^=s<<13;s^=s>>>17;s^=s<<5;return s>>>0}
const cases=Array.from({length:20000},()=>({lo:rnd(),hi:rnd()}));
for(const occ of cases)for(let j=0;j<64;j+=7)for(const role of ['rookAttacks','bishopAttacks']){
 const a=base[role](j,occ),b=cand[role](j,occ);if(a.lo!==b.lo||a.hi!==b.hi)throw Error(role+' mismatch');
}
const mods=[base,cand],runs=11,ms=[[],[]],cpu=[[],[]];
function work(j){let sum=0;const m=mods[j];for(const occ of cases)for(let i=0;i<64;i+=2){const a=m.queenAttacks(i,occ);sum^=a.lo^a.hi}return sum}
const expected=work(0);if(work(1)!==expected)throw Error('checksum');
for(let i=0;i<runs;i++)for(const j of(i%2?[1,0]:[0,1])){
 global.gc?.();const t=performance.now(),c=process.cpuUsage();if(work(j)!==expected)throw Error('checksum');
 ms[j].push(performance.now()-t);const d=process.cpuUsage(c);cpu[j].push((d.user+d.system)/1000);
}
const med=x=>[...x].sort((a,b)=>a-b)[Math.floor(x.length/2)];
console.log(JSON.stringify({checks:cases.length*10*2,rate:ms.map(x=>cases.length*32/med(x)*1000),ratio:med(ms[0])/med(ms[1]),cpuRatio:med(cpu[0])/med(cpu[1]),ms,cpu}));
