// bench/castling-bakeoff.mjs — ADR-013 representation bake-off (task 1.1).
// Measures allDests / makeMove / perft on the castling-heavy corpus subset
// (r3k2r positions, Kiwipete, pos4) for whichever representation the library
// was BUILT with (CASTLING_REP in src/chess.ts). Run under both builds:
//   node bench/castling-bakeoff.mjs
import { parseFen } from "../dist/fen.js";
import { allDests, makeMove, perft, detectCastling } from "../dist/index.js";
import { makeSan } from "../dist/san.js";

const toPos = (v) => ({ ...v, halfmove: 0, fullmove: 1 });

const POSITIONS = {
  kiwipete: ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 97862],
  pos4: ["r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 9467],
  rooksOnly: ["r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", 13744],
  blackRooks: ["r3k2r/8/8/8/8/8/8/4K3 w kq - 0 1", 782],
};

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function timeMs(fn, warmup, runs) {
  for (let i = 0; i < warmup; i++) fn();
  const ts = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    ts.push(performance.now() - t0);
  }
  return median(ts);
}

const results = {};

// --- perft d3 on castling-heavy positions ---
{
  const fns = [];
  let totalNodes = 0;
  const pos = [];
  for (const [name, [fen, nodes]] of Object.entries(POSITIONS)) {
    const p = toPos(parseFen(fen).value);
    pos.push({ p, name, expected: nodes });
    totalNodes += nodes;
  }
  const run = () => {
    for (const { p } of pos) perft(p, 3);
  };
  const ms = timeMs(run, 3, 15);
  results.perft = { ms, nodes: totalNodes };
}

// --- allDests on Kiwipete ---
{
  const p = toPos(parseFen(POSITIONS.kiwipete[0]).value);
  const ms = timeMs(() => {
    for (let i = 0; i < 2000; i++) allDests(p);
  }, 3, 15);
  results.allDests = { ms, iters: 2000 };
}

// --- makeMove castling-heavy walk (kiwipete tree d2 apply) ---
{
  const p = toPos(parseFen(POSITIONS.kiwipete[0]).value);
  const ms = timeMs(() => {
    for (let i = 0; i < 2000; i++) perft(p, 2);
  }, 3, 15);
  results.makeMoveWalk = { ms, iters: 2000 };
}

// --- detectCastling/makeSan castling ---
{
  const p = toPos(parseFen(POSITIONS.rooksOnly[0]).value);
  const ms = timeMs(() => {
    for (let i = 0; i < 100000; i++) makeSan({ from: 4, to: 6 }, p);
  }, 3, 15);
  results.makeSanCastling = { ms, iters: 100000 };
}

console.log("=== castling representation bake-off ===");
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${k}: median ${v.ms.toFixed(2)} ms (${v.iters ?? v.nodes} units)`);
}
