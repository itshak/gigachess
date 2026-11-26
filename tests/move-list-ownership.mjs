import assert from 'node:assert/strict';
import {Board,ensureMagicTablesLoaded} from '../dist/index.js';
import {Board as FastBoard,ensureMagicTablesLoaded as fastMagic} from '../dist/fast/index.js';
await Promise.all([ensureMagicTablesLoaded(),fastMagic()]);
for(const C of [Board,FastBoard]){
 const a=new C(),b=new C('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
 const expectedA=[...a.legalMoves()],expectedB=[...b.legalMoves()];
 const first=a.legalMoves(),second=b.legalMoves();
 assert.deepEqual([...first],expectedA);
 assert.deepEqual([...second],expectedB);
 first.fill(0xffff);
 assert.deepEqual([...a.legalMoves()],expectedA);
 assert.deepEqual([...second],expectedB);
 const caller=new Uint16Array(256),view=b.legalMoves(caller);
 assert.equal(view.buffer,caller.buffer);
 assert.deepEqual([...view],expectedB);
 // A getter can reenter another Board's movegen while scratch is live.
 Object.defineProperty(a,'board',{configurable:true,get(){assert.deepEqual([...b.legalMoves()],expectedB);return a}});
 assert.deepEqual([...a.legalMoves()],expectedA);
 delete a.board;
}
console.log('PASS independent, caller-owned and reentrant legal move lists');
