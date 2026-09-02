// tests/perft.mjs — perft regression suite for gigachess (run from repo root after build)
// Usage:
//   node tests/perft.mjs            # fast suite (positions capped at <= 500k nodes)
//   PERFT_FULL=1 node tests/perft.mjs  # full suite (startpos d5, kiwipete d4, ...; ~40s)
import { parseFen } from "../dist/fen.js";
import { perft } from "../dist/index.js";

const POS = {
  startpos: ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", [20, 400, 8902, 197281, 4865609]],
  kiwipete: ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", [48, 2039, 97862, 4085603]],
  pos3: ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", [14, 191, 2812, 43238, 674624]],
  pos4: ["r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", [6, 264, 9467, 422333]],
  pos5: ["rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", [44, 1486, 62379, 2103487]],
  pos6: ["r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", [46, 2079, 89890, 3894594]],
};
const FULL = !!process.env.PERFT_FULL;
// fast mode: skip depths above 500k nodes (the expensive d4/d5 entries)
const CAP = FULL ? Infinity : 500_000;

let ok = true;
for (const [key, [fen, expected]] of Object.entries(POS)) {
  const r = parseFen(fen);
  if (!r.ok) { console.log(`${key}: FEN PARSE FAIL`); ok = false; continue; }
  const pos = { ...r.value, halfmove: 0, fullmove: 1 };
  for (let d = 1; d <= expected.length; d++) {
    if (expected[d - 1] > CAP) continue;
    const t0 = performance.now();
    const n = Number(perft(pos, d));
    const ms = (performance.now() - t0).toFixed(0);
    const good = n === expected[d - 1];
    if (!good) ok = false;
    console.log(`${key} d${d}: ${n} ${good ? "OK" : "FAIL exp " + expected[d - 1]} (${ms}ms)`);
  }
}
console.log(ok ? "PERFT: ALL PASS" : "PERFT: FAILURES");
process.exit(ok ? 0 : 1);
