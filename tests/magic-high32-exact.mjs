import assert from 'node:assert/strict';
// Keep this independent mathematical reference for the binary64 correction.
function high(a,b){const q=(a>>>0)*(b>>>0)*(1/4294967296),h=Math.floor(q);return(h-(q===h&&Math.imul(a,b)<0?1:0))>>>0}
const edge=[0,1,2,3,65535,65536,65537,0x7fffffff,0x80000000,0x80000001,0xfffffffe,0xffffffff];
for(let i=0;i<2048;i++){edge.push((0xffffffff-i)>>>0);edge.push((0x80000000+i)>>>0)}
let n=0;
function check(a,b){assert.equal(high(a,b),Number((BigInt(a>>>0)*BigInt(b>>>0))>>32n),a+','+b);n++}
for(const a of edge)for(const b of [0,1,2,3,65535,65536,65537,0x7fffffff,0x80000000,0x80000001,0xfffffffe,0xffffffff])check(a,b);
let seed=0x5c7173f1;function next(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0}
for(let i=0;i<1_000_000;i++)check(next(),next());
console.log({exactProducts:n});
