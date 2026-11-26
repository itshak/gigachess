import assert from 'node:assert/strict';
import {rookAttacks,bishopAttacks,queenAttacks,_naive,ensureMagicTablesLoaded} from '../dist/attacks.js';
if(!process.argv.includes("--cold"))await ensureMagicTablesLoaded();
function mask(s,dirs){
 let lo=0,hi=0;
 for(const [df,dr] of dirs){
  let f=(s&7)+df,r=(s>>3)+dr;
  while(f>=0&&f<8&&r>=0&&r<8&&f+df>=0&&f+df<8&&r+dr>=0&&r+dr<8){
   const t=r*8+f;if(t<32)lo|=1<<t;else hi|=1<<(t-32);f+=df;r+=dr;
  }
 }
 return {lo:lo>>>0,hi:hi>>>0};
}
function subs(m){const a=[];let x=0;do{a.push(x>>>0);x=(x-m)&m}while(x);return a}
let checks=0;
for(const [dirs,loaded,naive] of [
 [[[1,0],[-1,0],[0,1],[0,-1]],rookAttacks,_naive.rookAttacksNaive],
 [[[1,1],[-1,1],[1,-1],[-1,-1]],bishopAttacks,_naive.bishopAttacksNaive]
]){
 for(let s=0;s<64;s++){
  const m=mask(s,dirs);
  for(const lo of subs(m.lo))for(const hi of subs(m.hi)){
   const o={lo,hi},e=naive(s,o),a=loaded(s,o);
   assert.deepEqual(a,e);const r=rookAttacks(s,o),b=bishopAttacks(s,o);
   assert.deepEqual(queenAttacks(s,o),{lo:(r.lo|b.lo)>>>0,hi:(r.hi|b.hi)>>>0});checks++;
  }
 }
}
console.log({exhaustiveRelevantOccupancies:checks});
