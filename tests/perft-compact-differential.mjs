import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Board,ensureMagicTablesLoaded,ensureZobristLoaded} from '../dist/index.js';
import {compactPerft} from '../dist/perftCompact.js';
import {Board as FastBoard,ensureMagicTablesLoaded as fastMagic,ensureZobristLoaded as fastHash} from '../dist/fast/index.js';
import {Chess} from 'chess.js';
import {Chess as OpsChess} from 'chessops/chess';
import {parseFen} from 'chessops/fen';
import {perft} from 'chessops/debug';
await Promise.all([ensureMagicTablesLoaded(),ensureZobristLoaded(),fastMagic(),fastHash()]);
const fens=readFileSync(new URL('../bench/data/perftsuite.epd',import.meta.url),'utf8').trim().split(/\r?\n/).map(l=>l.split(';')[0].trim());
fens.push(...readFileSync(new URL('../bench/data/wac_150.epd',import.meta.url),'utf8').trim().split(/\r?\n/).map(l=>l.split(';')[0].trim().replace(/\s+bm\s+.*$/,'')+' 0 1'));
let seed=0x71fab345,randomPositions=0;
function rand(n){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%n}
for(let g=0;g<30;g++){
 const c=new Chess();
 for(let p=0;p<100;p++){
  const moves=c.moves({verbose:true});if(!moves.length)break;
  if(p%11===0){fens.push(c.fen({forceEnpassantSquare:true}));randomPositions++}
  c.move(moves[rand(moves.length)]);
 }
}
let active=0,fallback=0,checked=0;
for(const fen of fens){
 const normalized=fen.split(/\s+/).length===4?fen+' 0 1':fen;
 const oracle=OpsChess.fromSetup(parseFen(normalized).unwrap()).unwrap();
 const b=new Board(normalized),f=new FastBoard(normalized);
 const before=b.toFen(),hash=b.zobristHex(),moves=[...b.legalMoves()];
 const count=compactPerft(b,3),expected=Number(perft(oracle,3));
 if(count===undefined)fallback++;else{active++;assert.equal(count,expected,normalized+' compact')}
 for(const x of [b,f]){
  assert.equal(x.perft(3),expected,normalized);
  assert.equal(x.toFen(),before,normalized+' FEN restore');
  assert.equal(x.zobristHex(),hash,normalized+' hash restore');
  assert.deepEqual([...x.legalMoves()],moves,normalized+' move order');
  checked++;
 }
}
console.log({fens:fens.length,randomPositions,active,fallback,checked});
