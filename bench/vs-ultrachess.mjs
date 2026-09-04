#!/usr/bin/env node
// bench/vs-ultrachess.mjs — Cross-engine benchmark: GigaChess (pure TS) vs ultrachess (Rust WASM)
// Compares movegen, perft, FEN parse/write, isCheck, and hash on identical positions
import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Chess as GigaChess,
  parseFen,
  makeFen,
  allDests,
  isCheck,
  perft as gigaPerft,
  calculateZobrist,
  ensureZobristLoaded,
  makeMove,
} from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

function parseArgs(argv) {
  const o = { iters: 20000, runs: 3, json: false, save: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--iters") o.iters = parseInt(argv[++i], 10);
    else if (a === "--runs") o.runs = parseInt(argv[++i], 10);
    else if (a === "--json") o.json = true;
    else if (a === "--save") o.save = argv[++i];
  }
  return o;
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function timeBenchmark(fn, iters, runs) {
  // Warmup
  fn(Math.min(100, Math.max(10, Math.floor(iters * 0.05))));
  const samples = [];
  for (let r = 0; r < runs; r++) {
    if (typeof global.gc === "function") global.gc();
    const t0 = performance.now();
    fn(iters);
    const dtMs = performance.now() - t0;
    samples.push((dtMs * 1e6) / iters);
  }
  return median(samples);
}

async function loadUltrachess() {
  try {
    const u = await import("ultrachess");
    await u.init();
    return u;
  } catch (e) {
    return null;
  }
}

export async function runVsUltrachess(opts = {}) {
  const iters = opts.iters || 20000;
  const runs = opts.runs || 3;

  await ensureZobristLoaded();
  const u = await loadUltrachess();
  if (!u) {
    console.warn("ultrachess not installed or failed to initialize WASM");
    return null;
  }

  const FEN_STARTPOS = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const FEN_KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
  const FEN_IN_CHECK = "rnbqkbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

  const gigaStart = parseFen(FEN_STARTPOS).value;
  const gigaKiwi = parseFen(FEN_KIWIPETE).value;
  const gigaInCheck = parseFen(FEN_IN_CHECK).value;

  const uStart = await u.Chess.create(FEN_STARTPOS);
  const uKiwi = await u.Chess.create(FEN_KIWIPETE);
  const uInCheck = await u.Chess.create(FEN_IN_CHECK);

  const report = {};

  // 1. FEN write
  const gigaFenWrite = timeBenchmark((n) => {
    let s = "";
    for (let i = 0; i < n; i++) s = makeFen(gigaStart);
    return s;
  }, iters, runs);

  const uFenWrite = timeBenchmark((n) => {
    let s = "";
    for (let i = 0; i < n; i++) s = uStart.fen();
    return s;
  }, iters, runs);

  report.fenWrite = {
    gigachess_ns: gigaFenWrite,
    ultrachess_ns: uFenWrite,
    ratio: gigaFenWrite / uFenWrite,
  };

  // 2. FEN parse
  const gigaFenParse = timeBenchmark((n) => {
    let p = null;
    for (let i = 0; i < n; i++) p = parseFen(FEN_STARTPOS);
    return p;
  }, iters, runs);

  const uFenParse = timeBenchmark((n) => {
    for (let i = 0; i < n; i++) uStart.load(FEN_STARTPOS);
  }, iters, runs);

  report.fenParse = {
    gigachess_ns: gigaFenParse,
    ultrachess_ns: uFenParse,
    ratio: gigaFenParse / uFenParse,
  };

  // 3. Movegen Startpos
  const mgIters = Math.max(2000, Math.floor(iters / 2));
  const gigaMgStart = timeBenchmark((n) => {
    let d = null;
    for (let i = 0; i < n; i++) d = allDests(gigaStart);
    return d;
  }, mgIters, runs);

  const uMgStart = timeBenchmark((n) => {
    let m = null;
    for (let i = 0; i < n; i++) m = uStart.moves();
    return m;
  }, mgIters, runs);

  report.movegen_startpos = {
    gigachess_ns: gigaMgStart,
    ultrachess_ns: uMgStart,
    ratio: gigaMgStart / uMgStart,
  };

  // 4. Movegen Kiwipete
  const gigaMgKiwi = timeBenchmark((n) => {
    let d = null;
    for (let i = 0; i < n; i++) d = allDests(gigaKiwi);
    return d;
  }, mgIters, runs);

  const uMgKiwi = timeBenchmark((n) => {
    let m = null;
    for (let i = 0; i < n; i++) m = uKiwi.moves();
    return m;
  }, mgIters, runs);

  report.movegen_kiwipete = {
    gigachess_ns: gigaMgKiwi,
    ultrachess_ns: uMgKiwi,
    ratio: gigaMgKiwi / uMgKiwi,
  };

  // 5. isCheck / inCheck
  const gigaCheckIn = timeBenchmark((n) => {
    let c = false;
    for (let i = 0; i < n; i++) c = isCheck(gigaInCheck);
    return c;
  }, iters, runs);

  const uCheckIn = timeBenchmark((n) => {
    let c = false;
    for (let i = 0; i < n; i++) c = uInCheck.inCheck();
    return c;
  }, iters, runs);

  report.isCheck = {
    gigachess_ns: gigaCheckIn,
    ultrachess_ns: uCheckIn,
    ratio: gigaCheckIn / uCheckIn,
  };

  // 6. Perft d4
  const perftDepth = 4;
  const pRuns = runs;
  const gigaPerftSamples = [];
  let gigaNodes = 0;
  for (let r = 0; r < pRuns; r++) {
    if (typeof global.gc === "function") global.gc();
    const t0 = performance.now();
    gigaNodes = gigaPerft(gigaStart, perftDepth);
    gigaPerftSamples.push(performance.now() - t0);
  }
  const gigaPerftMs = median(gigaPerftSamples);

  const uPerftSamples = [];
  let uNodes = 0;
  for (let r = 0; r < pRuns; r++) {
    if (typeof global.gc === "function") global.gc();
    const t0 = performance.now();
    uNodes = Number(uStart.perft(perftDepth));
    uPerftSamples.push(performance.now() - t0);
  }
  const uPerftMs = median(uPerftSamples);

  report.perft_d4 = {
    gigachess_ms: gigaPerftMs,
    gigachess_mnps: (gigaNodes / (gigaPerftMs / 1000)) / 1e6,
    ultrachess_ms: uPerftMs,
    ultrachess_mnps: (uNodes / (uPerftMs / 1000)) / 1e6,
    parity: gigaNodes === uNodes,
  };

  // Cleanup WASM handles
  uStart.dispose();
  uKiwi.dispose();
  uInCheck.dispose();

  return report;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log("Usage: node --expose-gc bench/vs-ultrachess.mjs [--iters <n>] [--runs <n>] [--json] [--save <path>]");
    process.exit(0);
  }

  console.log(`vs-ultrachess.mjs — Cross-engine benchmark (Node ${process.version})`);
  const report = await runVsUltrachess(opts);
  if (!report) {
    process.exit(1);
  }

  console.log("\n" + "=".repeat(76));
  console.log("CROSS-ENGINE HEAD-TO-HEAD: GigaChess (Pure TS) vs Ultrachess (Rust WASM)");
  console.log("=".repeat(76));
  console.log("Operation                 GigaChess (TS)      Ultrachess (WASM)   Comparison");
  console.log("-".repeat(76));

  const printRow = (name, gigaNs, uNs) => {
    const ratio = gigaNs / uNs;
    const cmp = ratio <= 1.0 ? `${(1 / ratio).toFixed(2)}x faster (TS win)` : `${ratio.toFixed(2)}x slower`;
    console.log(
      `${name.padEnd(26)} ${gigaNs.toFixed(1).padStart(8)} ns/op  ${uNs.toFixed(1).padStart(12)} ns/op     ${cmp}`
    );
  };

  printRow("FEN parse", report.fenParse.gigachess_ns, report.fenParse.ultrachess_ns);
  printRow("FEN write", report.fenWrite.gigachess_ns, report.fenWrite.ultrachess_ns);
  printRow("Movegen (startpos)", report.movegen_startpos.gigachess_ns, report.movegen_startpos.ultrachess_ns);
  printRow("Movegen (kiwipete)", report.movegen_kiwipete.gigachess_ns, report.movegen_kiwipete.ultrachess_ns);
  printRow("isCheck", report.isCheck.gigachess_ns, report.isCheck.ultrachess_ns);

  console.log("-".repeat(76));
  console.log(
    `Perft (d4 = 197,281)       ${report.perft_d4.gigachess_mnps.toFixed(2).padStart(8)} Mnps     ${report.perft_d4.ultrachess_mnps.toFixed(2).padStart(12)} Mnps     ${(report.perft_d4.ultrachess_mnps / report.perft_d4.gigachess_mnps).toFixed(2)}x WASM (parity: ${report.perft_d4.parity ? "✓" : "✗"})`
  );
  console.log("=".repeat(76));

  if (opts.json) {
    console.log("\n" + JSON.stringify(report, null, 2));
  }

  const savePath = opts.save || join(ROOT_DIR, "bench-results", "gigachess-baseline.json");
  if (existsSync(savePath)) {
    try {
      const data = JSON.parse(readFileSync(savePath, "utf8"));
      data.ultrachess_comparison = report;
      writeFileSync(savePath, JSON.stringify(data, null, 2) + "\n");
      console.log(`\nUpdated ${savePath} with vs-ultrachess metrics.`);
    } catch {}
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
