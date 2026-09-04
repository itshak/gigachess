#!/usr/bin/env node
// bench/bench-micro.mjs — Criterion-style micro-benchmarks for GigaChess engine
// Measures ns/op for core operations: fenWrite, fenParse, movegen, make+unmake, isCheck, zobrist, SAN, clone
import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Chess,
  parseFen,
  makeFen,
  allDests,
  isCheck,
  calculateZobrist,
  ensureZobristLoaded,
  zobristAfterMove,
  parseSan,
  makeSan,
  cloneBoard,
} from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const DEFAULT_ITERS = process.env.BENCH_ITERS ? parseInt(process.env.BENCH_ITERS, 10) : 200000;

function printHelp() {
  console.log(`bench-micro.mjs — Criterion-style micro-benchmarks for core engine operations

Usage:
  node --expose-gc bench/bench-micro.mjs [options]

Options:
  --help            Show help
  --iters <n>       Benchmark iterations (default: ${DEFAULT_ITERS}, or BENCH_ITERS env)
  --runs <n>        Passes for median calculation (default: 3)
  --save <path>     Save JSON metrics to file (default: bench-results/gigachess-baseline.json if requested)
  --json            Emit JSON summary to stdout
`);
}

function parseArgs(argv) {
  const o = { help: false, iters: DEFAULT_ITERS, runs: 3, save: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--iters") o.iters = parseInt(argv[++i], 10);
    else if (a === "--runs") o.runs = parseInt(argv[++i], 10);
    else if (a === "--save") o.save = argv[++i];
    else if (a === "--json") o.json = true;
  }
  return o;
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function timeOp(fn, iters, runs) {
  // 1 warmup pass (10% or at least 100 iters)
  const warmup = Math.min(1000, Math.max(10, Math.floor(iters * 0.05)));
  fn(warmup);

  const samples = [];
  for (let r = 0; r < runs; r++) {
    if (typeof global.gc === "function") global.gc();
    const t0 = performance.now();
    fn(iters);
    const dtMs = performance.now() - t0;
    const nsPerOp = (dtMs * 1e6) / iters;
    samples.push(nsPerOp);
  }
  return {
    median_ns: median(samples),
    samples_ns: samples,
    iters,
  };
}

export async function runMicro(opts = {}) {
  const iters = opts.iters || DEFAULT_ITERS;
  const runs = opts.runs || 3;

  await ensureZobristLoaded();

  const FEN_STARTPOS = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const FEN_KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
  const FEN_960 = "rqbbknnr/pppppppp/8/8/8/8/PPPPPPPP/RQBBKNNR w KQkq - 0 1";
  const FEN_IN_CHECK = "rnbqkbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
  const FEN_MIDGAME = "r1bq1rk1/ppp2ppp/2n5/1B1pP3/1b1P4/2N2N2/PPP3PP/R1BQK2R b KQ - 0 8";

  const posStartpos = parseFen(FEN_STARTPOS).value;
  const posKiwipete = parseFen(FEN_KIWIPETE).value;
  const pos960 = parseFen(FEN_960).value;
  const posInCheck = parseFen(FEN_IN_CHECK).value;
  const posMidgame = parseFen(FEN_MIDGAME).value;

  const fens = [FEN_STARTPOS, FEN_KIWIPETE, FEN_MIDGAME];
  const positions = [posStartpos, posKiwipete, posMidgame];

  // Pre-parse 48-ply game moves
  const SAN_48 = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O d4 Bg4 Be3 exd4 cxd4 Na5 Bc2 c5 d5 Nc4 Bc1 Nd7 Nbd2 Nxd2 Bxd2 Bf6 Rb1 Re8 h3 Bxf3 Qxf3 Bd4 Qd1 Qf6 Be3 Bxb2 a4 b4 Qd3 Bc3 Re2 Ne5".split(" ");
  const setupGame = new Chess();
  const parsed48Moves = [];
  for (const san of SAN_48) {
    const mv = parseSan(san, setupGame.pos).value;
    parsed48Moves.push(mv);
    setupGame.play(mv);
  }

  // Pre-generate sample move for incremental hash & SAN render
  const sampleMove = parseSan("e4", posStartpos).value;
  const sampleNextPos = parseFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1").value;

  const results = {};

  // 1. fenWrite
  results.fenWrite = timeOp((n) => {
    let s = "";
    for (let i = 0; i < n; i++) {
      s = makeFen(positions[i % positions.length]);
    }
    return s;
  }, iters, runs);

  // 2. fenParse
  results.fenParse = timeOp((n) => {
    let r = null;
    for (let i = 0; i < n; i++) {
      r = parseFen(fens[i % fens.length]);
    }
    return r;
  }, iters, runs);

  // 3. movegen one-shot (startpos, kiwipete, 960)
  const mgIters = Math.max(10000, Math.floor(iters / 4));
  results.movegen_startpos = timeOp((n) => {
    let d = null;
    for (let i = 0; i < n; i++) d = allDests(posStartpos);
    return d;
  }, mgIters, runs);

  results.movegen_kiwipete = timeOp((n) => {
    let d = null;
    for (let i = 0; i < n; i++) d = allDests(posKiwipete);
    return d;
  }, mgIters, runs);

  results.movegen_960 = timeOp((n) => {
    let d = null;
    for (let i = 0; i < n; i++) d = allDests(pos960);
    return d;
  }, mgIters, runs);

  // 4. make+unmake 48-ply
  const cycles = Math.max(500, Math.floor(iters / 48));
  const game = new Chess();
  const makeUnmakeRaw = timeOp((n) => {
    for (let i = 0; i < n; i++) {
      for (let p = 0; p < 48; p++) game.play(parsed48Moves[p]);
      for (let p = 0; p < 48; p++) game.undo();
    }
  }, cycles, runs);
  results.makeUnmake_48ply = {
    median_ns: makeUnmakeRaw.median_ns,
    median_ns_per_ply: makeUnmakeRaw.median_ns / 48,
    samples_ns: makeUnmakeRaw.samples_ns,
    iters: cycles,
  };

  // 5. isCheck (in, out)
  results.isCheck_in = timeOp((n) => {
    let c = false;
    for (let i = 0; i < n; i++) c = isCheck(posInCheck);
    return c;
  }, iters, runs);

  results.isCheck_out = timeOp((n) => {
    let c = false;
    for (let i = 0; i < n; i++) c = isCheck(posStartpos);
    return c;
  }, iters, runs);

  // 6. zobrist hash (incremental, scratch)
  results.zobrist_scratch = timeOp((n) => {
    let z = null;
    for (let i = 0; i < n; i++) z = calculateZobrist(positions[i % positions.length]);
    return z;
  }, iters, runs);

  results.zobrist_incremental = timeOp((n) => {
    let z = null;
    for (let i = 0; i < n; i++) {
      z = zobristAfterMove(posStartpos, sampleMove, null, false, undefined, sampleNextPos);
    }
    return z;
  }, iters, runs);

  // 7. SAN parse and SAN render
  const sanSamples = ["e4", "Nf3", "d4", "c4"];
  const sanIters = Math.max(10000, Math.floor(iters / 2));
  results.san_parse = timeOp((n) => {
    let m = null;
    for (let i = 0; i < n; i++) {
      m = parseSan(sanSamples[i & 3], posStartpos);
    }
    return m;
  }, sanIters, runs);

  results.san_render = timeOp((n) => {
    let s = "";
    for (let i = 0; i < n; i++) {
      s = makeSan(sampleMove, posStartpos);
    }
    return s;
  }, sanIters, runs);

  // 8. clone / board copy
  results.clone = timeOp((n) => {
    let b = null;
    for (let i = 0; i < n; i++) {
      b = cloneBoard(posStartpos.board);
    }
    return b;
  }, iters, runs);

  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  console.log(`bench-micro.mjs — Criterion micro-benchmarks (Node ${process.version}, ${opts.iters} iters, ${opts.runs} passes median)`);
  const metrics = await runMicro(opts);

  console.log("\n" + "=".repeat(68));
  console.log("MICRO-BENCHMARK RESULTS (ns/op, lower is better):");
  console.log("=".repeat(68));

  const formatNs = (ns) => `${ns.toFixed(1).padStart(8)} ns/op  (${(1e9 / ns).toLocaleString(undefined, { maximumFractionDigits: 0 }).padStart(10)} ops/s)`;

  console.log(`  fenWrite:               ${formatNs(metrics.fenWrite.median_ns)}`);
  console.log(`  fenParse:               ${formatNs(metrics.fenParse.median_ns)}`);
  console.log(`  movegen (startpos):     ${formatNs(metrics.movegen_startpos.median_ns)}`);
  console.log(`  movegen (kiwipete):     ${formatNs(metrics.movegen_kiwipete.median_ns)}`);
  console.log(`  movegen (chess960):     ${formatNs(metrics.movegen_960.median_ns)}`);
  console.log(`  make+unmake (48-ply):   ${metrics.makeUnmake_48ply.median_ns.toFixed(1).padStart(8)} ns/cycle  (${metrics.makeUnmake_48ply.median_ns_per_ply.toFixed(1)} ns/ply)`);
  console.log(`  isCheck (in check):     ${formatNs(metrics.isCheck_in.median_ns)}`);
  console.log(`  isCheck (out of check): ${formatNs(metrics.isCheck_out.median_ns)}`);
  console.log(`  zobrist (scratch):      ${formatNs(metrics.zobrist_scratch.median_ns)}`);
  console.log(`  zobrist (incremental):  ${formatNs(metrics.zobrist_incremental.median_ns)}`);
  console.log(`  SAN parse:              ${formatNs(metrics.san_parse.median_ns)}`);
  console.log(`  SAN render:             ${formatNs(metrics.san_render.median_ns)}`);
  console.log(`  clone (board copy):     ${formatNs(metrics.clone.median_ns)}`);

  if (opts.json) {
    console.log("\n" + JSON.stringify(metrics, null, 2));
  }

  const savePath = opts.save || join(ROOT_DIR, "bench-results", "gigachess-baseline.json");
  const saveDir = dirname(savePath);
  if (!existsSync(saveDir)) {
    mkdirSync(saveDir, { recursive: true });
  }

  let fileData = {};
  if (existsSync(savePath)) {
    try {
      fileData = JSON.parse(readFileSync(savePath, "utf8"));
    } catch {}
  }

  fileData.timestamp = fileData.timestamp || new Date().toISOString();
  fileData.engine = "gigachess";
  fileData.node = process.version;
  fileData.micro = {
    fenWrite_ns: metrics.fenWrite.median_ns,
    fenParse_ns: metrics.fenParse.median_ns,
    movegen_startpos_ns: metrics.movegen_startpos.median_ns,
    movegen_kiwipete_ns: metrics.movegen_kiwipete.median_ns,
    movegen_960_ns: metrics.movegen_960.median_ns,
    makeUnmake_48ply_cycle_ns: metrics.makeUnmake_48ply.median_ns,
    makeUnmake_48ply_ply_ns: metrics.makeUnmake_48ply.median_ns_per_ply,
    isCheck_in_ns: metrics.isCheck_in.median_ns,
    isCheck_out_ns: metrics.isCheck_out.median_ns,
    zobrist_scratch_ns: metrics.zobrist_scratch.median_ns,
    zobrist_incremental_ns: metrics.zobrist_incremental.median_ns,
    san_parse_ns: metrics.san_parse.median_ns,
    san_render_ns: metrics.san_render.median_ns,
    clone_ns: metrics.clone.median_ns,
  };

  writeFileSync(savePath, JSON.stringify(fileData, null, 2) + "\n");
  console.log(`\nBaseline micro metrics saved to: ${savePath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
