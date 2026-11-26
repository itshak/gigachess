import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Board} from "../dist/board.js";
import {Board as FastBoard,ensureMagicTablesLoaded as fastMagic, ensureZobristLoaded as fastHash} from "../dist/fast/index.js";
import {ensureMagicTablesLoaded as ordinaryMagic} from "../dist/attacks.js";
import {ensureZobristLoaded as ordinaryHash} from "../dist/zobrist.js";
const expected = JSON.parse(readFileSync(new URL("./data/perft-specialized-v1.json", import.meta.url)));
await Promise.all([ordinaryMagic(),ordinaryHash(),fastMagic(),fastHash()]);
let checked = 0;
for (const [Engine,variantName] of [[Board,"ordinary"],[FastBoard,"fast"]]){
 for (const {fen,chess960,nodes} of expected.positions) {
  for(let depth=1;depth<=nodes.length;depth++){
   const b=Engine.fromFen(fen,chess960?{chess960:true}:undefined);
   const prev={fen:b.toFen(),hash:b.zobristHex(),legal:[...b.legalMoves()],
     ep:b.epSquare,castlingMask:b.castlingMask,
     castlingWhite:[...b.castling.white],castlingBlack:[...b.castling.black]};
   assert.equal(b.perft(depth),nodes[depth-1],variantName+" "+fen+" depth "+depth);
   assert.equal(b.toFen(),prev.fen,fen+" FEN restore");
   assert.equal(b.zobristHex(),prev.hash,fen+" hash restore");
   assert.deepEqual([...b.legalMoves()],prev.legal,fen+" move order");
   assert.equal(b.epSquare,prev.ep,fen+" EP restore");
   assert.equal(b.castlingMask,prev.castlingMask,fen+" castling mask restore");
   assert.deepEqual([...b.castling.white],prev.castlingWhite,fen+" rook rights white");
   assert.deepEqual([...b.castling.black],prev.castlingBlack,fen+" rook rights black");
   checked++;
  }
 }
}
console.log("PASS perft internal state restoration and frozen standard/Chess960 fixtures",checked);
