// tests/zero-copy-moves.mjs — tests for MoveCounter, countLegalMoves, legalMovesInto, forEachLegalMove
import { parseFen } from "../dist/fen.js";
import {
  perft,
  countLegalMoves,
  legalMovesInto,
  forEachLegalMove,
  MoveCounter,
} from "../dist/index.js";
import { unpackMove } from "../dist/packedMove.js";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
const toPos = (v) => ({ ...v, halfmove: v.halfmoves ?? 0, fullmove: v.fullmoves ?? 1 });

console.log("== Phase 5: MoveSink & Zero-Copy Moves ==");

const testFens = [
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", // startpos
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", // kiwipete
  "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", // endgame
  "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", // promotions corpus
  "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
];

for (const fen of testFens) {
  const pos = toPos(parseFen(fen).value);
  const p1 = perft(pos, 1);
  const count = countLegalMoves(pos);
  check(`countLegalMoves matches perft(1) for ${fen.slice(0, 30)}...`, count === p1, `got ${count} expected ${p1}`);

  const buffer = new Uint32Array(256);
  const nInto = legalMovesInto(pos, buffer);
  check(`legalMovesInto count matches countLegalMoves`, nInto === count, `got ${nInto} expected ${count}`);

  let visitorCount = 0;
  const visitedMoves = [];
  forEachLegalMove(pos, (from, to, promo) => {
    visitorCount++;
    visitedMoves.push({ from, to, promo });
  });
  check(`forEachLegalMove count matches countLegalMoves`, visitorCount === count, `got ${visitorCount} expected ${count}`);

  // Check buffer contents match visited moves
  let bufferMatch = true;
  for (let i = 0; i < nInto; i++) {
    const word = buffer[i];
    const unpacked = unpackMove(word);
    const v = visitedMoves[i];
    if (unpacked.from !== v.from || unpacked.to !== v.to || unpacked.promo !== v.promo) {
      bufferMatch = false;
      break;
    }
  }
  check(`legalMovesInto buffer words round-trip match forEachLegalMove`, bufferMatch);
}

// Test MoveCounter
{
  const mc = new MoveCounter();
  mc.add({ lo: 0x0f, hi: 0 });
  check("MoveCounter.add popcount", mc.count === 4);
  mc.addPawns({ lo: 0, hi: 0x01000000 }, true); // White promo on rank 7: total 1, promo 1 -> 1 + 3 = 4
  check("MoveCounter.addPawns white promo", mc.count === 8);
  mc.reset();
  check("MoveCounter.reset", mc.count === 0);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail > 0 ? 1 : 0);
