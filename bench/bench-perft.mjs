#!/usr/bin/env node
// bench-perft.mjs — perft harness (perft 6 startpos = 119060324 nodes) vs chessops
import { performance } from "node:perf_hooks";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFen, perft } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

function printHelp() {
  console.log(`bench-perft.mjs — perft benchmark (move-gen correctness + speed)

Usage:
  node bench/bench-perft.mjs [options]

Options:
  --help            Show help
  --depth <n>       Perft depth (default: 6 for full, 5 for quick dev)
  --fen <fen>       FEN or "startpos" (default: startpos)
  --compare         Compare vs chessops if available (default: on when chessops installed)
  --no-compare      Disable comparison vs chessops
  --runs <n>        Runs for median (default: 3)

Metrics:
  nodes/s           Nodes per second (Mnps)
  perft(6) startpos must equal 119060324

Examples:
  node bench/bench-perft.mjs --depth 6 --fen startpos
  node bench/bench-perft.mjs --depth 5
  npm run bench:perft -- --depth 6
`);
}

function parseArgs(argv) {
  const o = { help: false, depth: 6, fen: "startpos", compare: true, runs: 3, save: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--depth") o.depth = Number(argv[++i]);
    else if (a === "--fen") o.fen = argv[++i];
    else if (a === "--compare") o.compare = true;
    else if (a === "--no-compare") o.compare = false;
    else if (a === "--runs") o.runs = Number(argv[++i]);
    else if (a === "--save") o.save = argv[++i];
  }
  return o;
}

const STARTPOS_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const STARTPOS_PERFT = { 0: 1, 1: 20, 2: 400, 3: 8902, 4: 197281, 5: 4865609, 6: 119060324, 7: 3195901860 };

async function loadChessops() {
  try {
    const { Chess } = await import("chessops/chess");
    const { parseFen } = await import("chessops/fen");
    const { perft } = await import("chessops/debug");
    return { Chess, parseFen, perft };
  } catch {
    return null;
  }
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { printHelp(); process.exit(0); }
  const d = opts.depth;
  const fenStr = opts.fen === "startpos" ? STARTPOS_FEN : opts.fen;
  const expected = opts.fen === "startpos" ? (STARTPOS_PERFT[d] ?? null) : null;

  console.log(`bench-perft — depth ${d}, fen ${opts.fen}, Node ${process.version}, runs: ${opts.runs}`);

  const parsed = parseFen(fenStr);
  if (!parsed.ok) {
    console.error(`FAIL: Invalid FEN: ${fenStr}`);
    process.exit(1);
  }
  const pos = { ...parsed.value, halfmove: 0, fullmove: 1 };

  // Warmup (depth d <= 4 ? d : Math.min(d, 4))
  if (d >= 2) {
    const warmupDepth = Math.min(d - 1, 4);
    perft(pos, warmupDepth);
  }

  // Timed runs
  const times = [];
  let nodes = 0;
  for (let r = 0; r < opts.runs; r++) {
    if (typeof global.gc === "function") global.gc();
    const t0 = performance.now();
    nodes = Number(perft(pos, d));
    const dt = performance.now() - t0;
    times.push(dt);
    if (opts.runs > 1) {
      process.stdout.write(`  run ${r + 1}/${opts.runs}: ${dt.toFixed(1)} ms (${(nodes / (dt / 1000) / 1e6).toFixed(2)} Mnps)\n`);
    }
  }

  const medianMs = median(times);
  const mnps = (nodes / (medianMs / 1000)) / 1e6;

  console.log(`\nResults (gigachess):`);
  console.log(`  perft(${d}) = ${nodes.toLocaleString()} nodes (expected ${expected?.toLocaleString() ?? "n/a"}${expected === nodes ? " ✓" : ""})`);
  console.log(`  time: median ${medianMs.toFixed(1)} ms (runs: ${times.map((t) => t.toFixed(1)).join(", ")} ms)`);
  console.log(`  throughput: ${mnps.toFixed(2)} Mnps (${Math.round(nodes / (medianMs / 1000)).toLocaleString()} nodes/s)`);

  // Correctness gate
  if (expected !== null && nodes !== expected) {
    console.error(`FAIL: perft(${d}) count mismatch: got ${nodes}, expected ${expected}`);
    process.exit(1);
  }

  // Optional chessops comparison
  if (opts.compare) {
    const co = await loadChessops();
    if (co) {
      console.log(`\nComparing vs chessops@0.15.1...`);
      const coParsed = co.parseFen(fenStr);
      if (!coParsed.isErr) {
        const coTimes = [];
        let coNodes = 0;
        for (let r = 0; r < opts.runs; r++) {
          if (typeof global.gc === "function") global.gc();
          const coChess = co.Chess.fromSetup(coParsed.value).unwrap();
          const t0 = performance.now();
          coNodes = Number(co.perft(coChess, d));
          const dt = performance.now() - t0;
          coTimes.push(dt);
        }
        const coMedianMs = median(coTimes);
        const coMnps = (coNodes / (coMedianMs / 1000)) / 1e6;
        const speedup = ((mnps - coMnps) / coMnps) * 100;
        console.log(`  chessops: ${coMedianMs.toFixed(1)} ms → ${coMnps.toFixed(2)} Mnps (${coNodes.toLocaleString()} nodes)`);
        console.log(`  gigachess speedup: ${speedup >= 0 ? "+" : ""}${speedup.toFixed(1)}% vs chessops`);
        if (coNodes !== nodes) {
          console.error(`FAIL: node count parity failure vs chessops (gigachess: ${nodes}, chessops: ${coNodes})`);
          process.exit(1);
        }
      }
    } else {
      console.log(`  (chessops not available for comparison)`);
    }
  }

  const savePath = opts.save || (opts.fen === "startpos" && opts.depth >= 5 ? join(ROOT_DIR, "bench-results", "gigachess-baseline.json") : null);
  if (savePath) {
    const saveDir = dirname(savePath);
    if (!existsSync(saveDir)) mkdirSync(saveDir, { recursive: true });
    let fileData = {};
    if (existsSync(savePath)) {
      try { fileData = JSON.parse(readFileSync(savePath, "utf8")); } catch {}
    }
    fileData.timestamp = fileData.timestamp || new Date().toISOString();
    fileData.engine = "gigachess";
    fileData.node = process.version;
    fileData.perft = {
      depth: d,
      fen: opts.fen,
      nodes,
      medianMs,
      mnps,
      runs: opts.runs,
    };
    writeFileSync(savePath, JSON.stringify(fileData, null, 2) + "\n");
    console.log(`\nPerft results saved to: ${savePath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
