// temp audit benchmark: allDests, makeMove, perft (delete after use)
import { parseFen } from "../dist/fen.js";
import { allDests, makeMove, perft } from "../dist/chess.js";

const kiwi = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
const pos = parseFen(kiwi).value;

// --- allDests ---
for (let i = 0; i < 3000; i++) allDests(pos);
let t = performance.now();
for (let i = 0; i < 20000; i++) allDests(pos);
console.log(`allDests: ${(performance.now() - t).toFixed(0)}ms / 20k`);

// --- makeMove on all pseudo dests ---
const dests = allDests(pos);
const moves = [];
for (const [from, set] of dests) {
  for (let b = 0; b < 64; b++) {
    const bit = b < 32 ? (1 << b) >>> 0 : (1 << (b - 32)) >>> 0;
    const v = b < 32 ? set.lo : set.hi;
    if (v & bit) moves.push({ from, to: b, promotion: null, isEnPassant: false, isCastling: false, isPromotion: false });
  }
}
for (let i = 0; i < 20000; i++) makeMove(pos, moves[i % moves.length]);
t = performance.now();
for (let i = 0; i < 200000; i++) makeMove(pos, moves[i % moves.length]);
console.log(`makeMove: ${(performance.now() - t).toFixed(0)}ms / 200k (${moves.length} moves)`);

// --- perft throughput (genLegalMoves + makeMove) ---
for (const [name, d, fen] of [["kiwipete d3", 3, kiwi], ["pos4 d4", 4, "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1"]]) {
  const p = parseFen(fen).value;
  perft(p, d - 1); // warmup
  t = performance.now();
  const n = perft(p, d);
  console.log(`perft ${name}: ${(performance.now() - t).toFixed(0)}ms, ${n} nodes, ${(n / (performance.now() - t) / 1000).toFixed(1)}M nodes/s`);
}
