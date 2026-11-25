import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const load=(d,f)=>import(pathToFileURL(resolve(d,'dist',f)).href);
const dirs=['baseline','candidate'];
const engines=await Promise.all(dirs.map(d=>load(d,'fast/index.js')));
const chess=await Promise.all(dirs.map(d=>load(d,'chess.js')));
const fen=await Promise.all(dirs.map(d=>load(d,'fen.js')));
const {fens}=JSON.parse(readFileSync('corpus/corpus.json','utf8'));
const names=Array.from({length:64},(_,s)=>String.fromCharCode(97+(s&7))+String(1+(s>>3)));
let checks=0,uciChecks=0;
for(const loaded of [false,true]){
 if(loaded)for(const e of engines){await e.ensureMagicTablesLoaded();await e.ensureZobristLoaded()}
 const count=Number(process.env.LEGALITY_POSITIONS||2000);
 for(let i=0;i<count;i++){
  const f=fens[Math.floor(i*fens.length/count)];
  const [a,b]=engines.map(e=>new e.Board(f));
  for(let from=0;from<64;from++){
   const d0=chess[0].dests(a,from),d1=chess[1].dests(b,from);
   assert.deepEqual(d1,d0,'dests '+f+' '+from);checks++;
   // Every origin/destination pair for a spread of 128 positions.
   if(i<128)for(let to=0;to<64;to++){
    const u=names[from]+names[to];
    assert.equal(b.parseUci(u),a.parseUci(u),'uci '+f+' '+u);uciChecks++;
   }
  }
 }
 for(const f of [
  'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
  'rk5r/8/8/8/8/8/8/RK5R w AHah - 0 1',
  '4k3/P7/8/8/8/8/7p/4K3 w - - 0 1',
  '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'
 ]){
  for(const opts of [{},{chess960:true},{strict:true}]){
   const [a,b]=fen.map(e=>e.parseFen(f,opts));assert.equal(a.ok,b.ok,f);
   if(!a.ok){assert.equal(a.error.code,b.error.code);continue}
   const bs=engines.map((e,j)=>new e.Board([a,b][j].value));
   for(let from=0;from<64;from++){assert.deepEqual(chess[1].dests(bs[1],from),chess[0].dests(bs[0],from));checks++}
   for(const u of ['0000',' 0000 ','e1g1','e1h1','e1c1','e1a1','a7a8q','a7a8Q','a7a8n','a7a8','e5d6','a0a1','A1A2',' e1e2 ','e1e2q','invalid','']){
    assert.equal(bs[1].parseUci(u),bs[0].parseUci(u),f+' '+u);uciChecks++;
   }
  }
 }
 // Constructor ownership and loadFen retained references.
 for(const e of engines){
  const a=new e.Board(),b=new e.Board(),ref=a.white;
  assert.notEqual(a.white,b.white);a.loadFen(fens[0]);assert.equal(a.white,ref);
  assert.equal(b.toFen(),new e.Board().toFen());
  class Sub extends e.Board{loadFen(f){this.called=true;super.loadFen(f)}}
  assert.equal(new Sub().called,true);
 }
}
console.log({destsChecks:checks,uciChecks,passed:true});
