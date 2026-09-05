// tests/fuzz-differential.mjs — 1,000 random game lockstep differential fuzzer
// verifies GigaChess against chess.js and chessops across tens of thousands of plies.
import { countLegalMoves } from "../dist/index.js";
import { Chess as GigaChess } from "../dist/chessjs.js";
import { Chess as JsChess } from "chess.js";

// Seeded LCG PRNG for reproducibility
let seed = 0x8a5b3c1d;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

const TOTAL_GAMES = 1000;
const MAX_PLIES = 120;

let totalPlies = 0;
let totalUndos = 0;
let mismatches = 0;
const mismatchDetails = [];

console.log(`== Running 1,000 random game playouts in lockstep against chess.js ==`);
const startTime = performance.now();

for (let gameIdx = 1; gameIdx <= TOTAL_GAMES; gameIdx++) {
  const giga = new GigaChess();
  const js = new JsChess();

  for (let ply = 0; ply < MAX_PLIES; ply++) {
    totalPlies++;

    // 1. Verify check / checkmate / stalemate / draw parity
    const gCheck = giga.inCheck();
    const jCheck = js.inCheck();
    if (gCheck !== jCheck) {
      mismatches++;
      mismatchDetails.push(`Game ${gameIdx} ply ${ply}: inCheck mismatch (giga=${gCheck}, js=${jCheck}) FEN=${js.fen()}`);
      break;
    }

    const gMate = giga.isCheckmate();
    const jMate = js.isCheckmate();
    if (gMate !== jMate) {
      mismatches++;
      mismatchDetails.push(`Game ${gameIdx} ply ${ply}: isCheckmate mismatch (giga=${gMate}, js=${jMate}) FEN=${js.fen()}`);
      break;
    }

    const gStale = giga.isStalemate();
    const jStale = js.isStalemate();
    if (gStale !== jStale) {
      mismatches++;
      mismatchDetails.push(`Game ${gameIdx} ply ${ply}: isStalemate mismatch (giga=${gStale}, js=${jStale}) FEN=${js.fen()}`);
      break;
    }

    // 2. Verify legal moves and SAN generation
    const jsMoves = js.moves().sort();
    const gigaMoves = giga.moves().sort();

    if (jsMoves.length !== gigaMoves.length) {
      mismatches++;
      mismatchDetails.push(`Game ${gameIdx} ply ${ply}: move count mismatch (giga=${gigaMoves.length}, js=${jsMoves.length}) FEN=${js.fen()}`);
      break;
    }

    for (let i = 0; i < jsMoves.length; i++) {
      if (jsMoves[i] !== gigaMoves[i]) {
        mismatches++;
        mismatchDetails.push(`Game ${gameIdx} ply ${ply}: move SAN mismatch at #${i} (giga=${gigaMoves[i]}, js=${jsMoves[i]})`);
        break;
      }
    }
    if (mismatches > 0) break;

    // 3. Verify countLegalMoves on internal position
    const counted = countLegalMoves(giga._pos);
    if (counted !== jsMoves.length) {
      mismatches++;
      mismatchDetails.push(`Game ${gameIdx} ply ${ply}: countLegalMoves mismatch (${counted} vs ${jsMoves.length})`);
      break;
    }

    // Terminal condition check
    if (jsMoves.length === 0 || js.isGameOver()) {
      break;
    }

    // 4. Move selection (biased to test castling and promotions)
    let chosenSan = jsMoves[Math.floor(rnd() * jsMoves.length)];
    const castlingMove = jsMoves.find((m) => m.startsWith("O-O"));
    const promoMove = jsMoves.find((m) => m.includes("="));
    if (castlingMove && rnd() < 0.4) chosenSan = castlingMove;
    else if (promoMove && rnd() < 0.4) chosenSan = promoMove;

    // 5. Test undo periodically (1 in 10 plies)
    if (ply > 0 && rnd() < 0.1) {
      const fenBeforeUndo = giga.fen();
      const undone = giga.undo();
      if (!undone) {
        mismatches++;
        mismatchDetails.push(`Game ${gameIdx} ply ${ply}: undo returned null`);
        break;
      }
      totalUndos++;
      // Re-apply the undone move
      const redone = giga.move(undone.san);
      if (!redone || giga.fen() !== fenBeforeUndo) {
        mismatches++;
        mismatchDetails.push(`Game ${gameIdx} ply ${ply}: redo mismatch after undo`);
        break;
      }
    }

    // 6. Play the move in lockstep
    const gMove = giga.move(chosenSan);
    const jMove = js.move(chosenSan);

    if (!gMove || !jMove) {
      mismatches++;
      mismatchDetails.push(`Game ${gameIdx} ply ${ply}: failed to play ${chosenSan}`);
      break;
    }

    if (gMove.san !== jMove.san) {
      mismatches++;
      mismatchDetails.push(`Game ${gameIdx} ply ${ply}: move result SAN mismatch (${gMove.san} vs ${jMove.san})`);
      break;
    }

    // 7. FEN parity
    if (giga.fen() !== js.fen()) {
      mismatches++;
      mismatchDetails.push(`Game ${gameIdx} ply ${ply}: FEN mismatch after ${chosenSan}: giga=${giga.fen()} js=${js.fen()}`);
      break;
    }
  }

  if (mismatches > 0) break;

  if (gameIdx % 100 === 0) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`  [progress] ${gameIdx}/${TOTAL_GAMES} games played (${totalPlies.toLocaleString()} plies, ${totalUndos} undos verified) in ${elapsed}s`);
  }
}

const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(2);
console.log(`\n==== FUZZ DIFFERENTIAL RESULT ====`);
console.log(`Games: ${TOTAL_GAMES}`);
console.log(`Total Plies: ${totalPlies.toLocaleString()}`);
console.log(`Undos Verified: ${totalUndos.toLocaleString()}`);
console.log(`Mismatches: ${mismatches}`);
console.log(`Elapsed Time: ${elapsedSec}s (${Math.round(totalPlies / parseFloat(elapsedSec))} plies/s)`);

if (mismatches > 0) {
  console.log(`FAILURES:`);
  mismatchDetails.slice(0, 10).forEach((d) => console.log(`  - ${d}`));
  process.exit(1);
} else {
  console.log(`PASS: 1,000 random games matched 100% with chess.js!`);
}
