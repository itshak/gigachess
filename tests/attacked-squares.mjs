import assert from 'node:assert/strict';
import {Board} from '../dist/board.js';
import {attackedSquares, attackersTo, ensureMagicTablesLoaded} from '../dist/attacks.js';
import * as sq from '../dist/squareSet.js';
import {Chess} from 'chess.js';
await ensureMagicTablesLoaded();
let state=0x195A5EED;
function random(n){state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;}
for(let game=0; game<36;game++){
 const js=new Chess();
 for(let ply=0;ply<60;ply++){
  const moves=js.moves({verbose:true});
  if(!moves.length)break;
  js.move(moves[random(moves.length)]);
  if(ply%5!==0)continue;
  const b=new Board(js.fen());
  for(let attacker=0;attacker<2;attacker++){
   const occVariants=[b.occupied];
   const k=sq.first(sq.and(b.king, attacker===0?b.black:b.white));
   if(k!==undefined)occVariants.push(sq.minus(b.occupied,sq.singleton(k)));
   for(const occ of occVariants){
    const all=attackedSquares(b,attacker,occ);
    for(let target=0;target<64;target++){
     const expected=!sq.isEmpty(attackersTo(b,target,attacker,occ));
     assert.equal(sq.has(all,target),expected,`attacker=${attacker} sq=${target} FEN=${js.fen()}`);
    }
   }
  }
 }
}
console.log('Attack-map parity PASS: random legal positions, all 64 squares, both sides, kingless occupancy');
