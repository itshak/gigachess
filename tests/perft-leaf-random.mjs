import assert from 'node:assert/strict';
import {Board,ensureMagicTablesLoaded} from '../dist/index.js';
import {Board as FastBoard,ensureMagicTablesLoaded as fastMagic} from '../dist/fast/index.js';
import {Chess} from 'chess.js';
await Promise.all([ensureMagicTablesLoaded(),fastMagic()]);
let state=0x8f24e31, checks=0, positions=0;
const rnd=n=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)%n};
for(let game=0;game<100;game++){
 const oracle=new Chess();
 for(let ply=0;ply<100;ply++){
  const fen=oracle.fen({forceEnpassantSquare:true});
  const moves=oracle.moves({verbose:true});
  for(const B of [Board,FastBoard]){
   const b=new B(fen);
   assert.equal(b.perft(1),moves.length,fen);
   if(ply%17===0){
    let expected=0;
    for(const m of moves){oracle.move(m);expected+=oracle.moves().length;oracle.undo();}
    assert.equal(b.perft(2),expected,fen);
   }
  }
  positions++;
  if(oracle.isCheck())checks++;
  if(!moves.length)break;
  oracle.move(moves[rnd(moves.length)]);
 }
}
console.log({positions,checks});
