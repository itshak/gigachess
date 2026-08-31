#!/usr/bin/env node
// bench/bench-real.mjs — real-world benchmark orchestrator (task 3.1).
// Change: purechess-bench-real.
//
// Usage:
//   npm run bench:real                     # all suites (full corpora)
//   npm run bench:real -- --quick          # reduced corpora, same methodology
//   npm run bench:real -- --suite sliding --suite perft
//   npm run bench:real -- --json           # machine-readable summary
//   npm run bench:real:ci                  # CI: fails (exit 1) on any unmet gate
//
// Suites: sliding | perft | pgn-stream | fen-san-uci | dests-terminal | bundle | chessjs
// Each suite parity-checks against chessops@0.15.1 BEFORE timing; gate
// failures produce exit code 1 so CI can enforce the spec's SHALLs.
import { assertEnvironment, summarizeGates } from "./suites/lib/common.mjs";

const SUITE_NAMES = ["sliding", "perft", "pgn-stream", "fen-san-uci", "dests-terminal", "bundle", "chessjs"];

function parseArgs(argv) {
  const o = { suites: [...SUITE_NAMES], quick: false, json: false, ci: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--quick") o.quick = true;
    else if (a === "--json") o.json = true;
    else if (a === "--ci") o.ci = true; // gate-enforcing exit code (always on; explicit for CI)
    else if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--suite") {
      const names = String(argv[++i]).split(",").map((s) => s.trim()).filter(Boolean);
      if (names.length) o.suites = names;
    }
  }
  return o;
}

function printHelp() {
  console.log(`bench-real — real-world benchmark suites (turbochess vs chessops)

Usage:
  node --expose-gc bench/bench-real.mjs [options]

Options:
  --suite <name[,name...]>   Run selected suites (${SUITE_NAMES.join(", ")}); repeatable
  --quick                    Reduced corpora (1k games, depth-capped), same methodology
  --json                     Emit machine-readable JSON summary
  --help                     This help

Also passes through suite-level flags: --samples, --games, --positions, --depth.

Methodology: 3 warmup runs excluded, median of 20 runs (p10/p90 reported),
global.gc() forced between iterations, performance.now() clock. Node and
corpora are pinned — see bench/README.md.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); process.exit(0); }
  assertEnvironment();

  const unknown = args.suites.filter((s) => !SUITE_NAMES.includes(s));
  if (unknown.length) {
    console.error(`Unknown suite(s): ${unknown.join(", ")}. Valid: ${SUITE_NAMES.join(", ")}`);
    process.exit(2);
  }

  console.log(`bench-real — Node ${process.version}, chessops@0.15.1 + chess.js@1.4.0 baselines, mode=${args.quick ? "quick" : "full"}`);
  console.log(`suites: ${args.suites.join(", ")}`);

  const results = [];
  for (const suiteName of args.suites) {
    const mod = await import(`./suites/${suiteName}.mjs`);
    let result;
    try {
      result = await mod.run({ quick: args.quick, json: args.json });
    } catch (e) {
      console.error(`\n[suite ${suiteName}] crashed: ${e.stack ?? e}`);
      results.push({ suite: suiteName, gates: [], crashed: String(e.message ?? e) });
      continue;
    }
    results.push({ suite: suiteName, ...result });
  }

  // ---- Summary
  let failed = 0;
  console.log(`\n${"=".repeat(72)}\nGATE SUMMARY${args.quick ? " (quick mode)" : ""}`);
  for (const r of results) {
    if (r.crashed) {
      console.log(`  ${r.suite.padEnd(16)} CRASHED — ${r.crashed}`);
      failed++;
      continue;
    }
    const status = summarizeGates(r.gates);
    if (status === "FAIL") failed++;
    console.log(`  ${r.suite.padEnd(16)} ${status}`);
    for (const g of r.gates) {
      console.log(`    ${g.pass ? "✓" : "✗"} ${g.name} — got ${g.actual} (want ${g.target})`);
    }
  }
  const total = results.reduce((s, r) => s + r.gates.length, 0);
  console.log(`\n${total - failed}/${total} gates passed${failed ? ` — ${failed} suite(s) with unmet gates` : " — all gates met"}.`);

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  }

  // Results are gated, not just logged: any unmet gate → exit 1 (CI red).
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
