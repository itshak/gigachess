import assert from 'node:assert/strict';
import * as M from '../dist/index.js';
import * as F from '../dist/fast/index.js';
const initial='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const arbitrary='r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
for(const E of [M,F]){
 for(const loaded of [false,true]){
  if(loaded){await E.ensureMagicTablesLoaded();await E.ensureZobristLoaded();}
  const other=new E.Board(arbitrary);
  assert.equal(other.toFen(),arbitrary);
  assert.equal(other.legalMoves().length,48);
  const a=new E.Board(),b=new E.Board(initial),c=E.Board.startpos();
  for(const p of [a,b,c])assert.equal(p.toFen(),initial);
  for(const key of ['white','black','pawn','knight','bishop','rook','queen','king','occupied','promoted','kingSq','checkers']){
   assert.notEqual(a[key],b[key]);assert.notEqual(b[key],c[key]);
  }
  const hash=b.zobristHex(), refs=b.white;
  a.makeMove(a.parseUci('e2e4'));
  a.white.lo=0;a.kingSq[0]=0;
  E.Board.empty().clear();
  assert.equal(b.toFen(),initial);assert.equal(c.toFen(),initial);
  assert.equal(new E.Board().toFen(),initial);
  assert.equal(other.toFen(),arbitrary);
  assert.throws(()=>new E.Board('invalid FEN'));
  assert.equal(new E.Board(arbitrary).toFen(),arbitrary);
  assert.equal(new E.Board().zobristHex(),hash);
  b.loadFen(initial);assert.equal(b.white,refs);
  class Sub extends E.Board {loadFen(f){super.loadFen(f);this.called=true;}}
  assert.equal(new Sub().called,true);
 }
}
console.log('PASS canonical template cold/loaded ownership, hash, existing references, subclass initialization');
