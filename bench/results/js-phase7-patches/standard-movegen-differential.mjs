import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Board,ensureMagicTablesLoaded} from '../dist/index.js';
import {Board as FastBoard,ensureMagicTablesLoaded as fastMagic} from '../dist/fast/index.js';
import {standardMovesInto} from '../dist/standardMovegen.js';
import {Chess} from 'chess.js';
const previous=await import(pathToFileURL(process.argv[2]).href);
await Promise.all([ensureMagicTablesLoaded(),fastMagic(),previous.ensureMagicTablesLoaded()]);
const fens=readFileSync(new URL('../bench/data/perftsuite.epd',import.meta.url),'utf8').trim().split(/\r?\n/).map(l=>l.split(';')[0].trim());
fens.push(...readFileSync(new URL('../bench/data/wac_150.epd',import.meta.url),'utf8').trim().split(/\r?\n/).map(l=>l.split(';')[0].trim().replace(/\s+bm\s+.*$/,'')+' 0 1'));
let rng=0x5a17e3bd;
const random=n=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)%n};
for(let i=0;i<100;i++){
 const c=new Chess();
 for(let p=0;p<100;p++){
  const moves=c.moves({verbose:true});if(!moves.length)break;
  fens.push(c.fen({forceEnpassantSquare:true}));c.move(moves[random(moves.length)]);
 }
}
let active=0,checks=0,ep=0,castles=0;
const out=new Uint16Array(256);
for(const fen of fens){
 const normalized=fen.split(/\s+/).length===4?fen+' 0 1':fen;
 const expected=new previous.Board(normalized).legalMoves(),o=new Chess(normalized);
 const b=new Board(normalized),f=new FastBoard(normalized),n=standardMovesInto(b,out);
 if(n!==undefined){active++;assert.deepEqual([...out.subarray(0,n)],[...expected],normalized+' direct order')}
 for(const x of [b,f]){
  const words=x.legalMoves();
  assert.deepEqual([...words],[...expected],normalized+' public order');
  const ucis=[...words].map(m=>x.toUci(m)).map(m=>m==='e1h1'?'e1g1':m==='e1a1'?'e1c1':m==='e8h8'?'e8g8':m==='e8a8'?'e8c8':m).sort();
  // Only normalize actual castling words (ordinary rook moves from e1/e8
  // could coincidentally use the same spelling).
  const oracle=o.moves({verbose:true});
  const correct=[...words].map(w=>{
   const u=x.toUci(w),from=w&63,to=(w>>>6)&63,king=(x.kingSq[x.turn]===from);
   return king&&((from===4&&(to===0||to===7))||(from===60&&(to===56||to===63)))?
    (to>from?u.slice(0,2)+'g'+u[3]:u.slice(0,2)+'c'+u[3]):u;
  }).sort();
  assert.deepEqual(correct,oracle.map(m=>m.lan).sort(),normalized+' independent moves');
 }
 if(o.isCheck())checks++;
 if(b.epSquare!==null)ep++;
 castles+=o.moves({verbose:true}).filter(m=>m.flags.includes('k')||m.flags.includes('q')).length;
}
console.log({positions:fens.length,active,checks,ep,castles});
