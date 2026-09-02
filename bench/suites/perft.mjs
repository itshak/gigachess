// bench/suites/perft.mjs — perft parity + speed over the pinned EPD corpora
// (task 2.2). Runs every FEN in perftsuite.epd (126) and wac_150.epd at
// min(depth, 4). Node counts must equal chessops for EVERY FEN/depth before
// any nodes/s comparison is reported; a mismatch aborts the suite with the
// failing FEN and no speed numbers.
import { assertCorpus, CORPORA, gate, measure, parseSuiteArgs, thr } from "./lib/common.mjs";
import { readFileSync } from "node:fs";
import { parseFen, perft as pcPerft } from "../../dist/index.js";
import { Chess as coChess } from "chessops/chess";
import { parseFen as coParseFen } from "chessops/fen";
import { perft as coPerft } from "chessops/debug";

function parsePerftsuite(abs) {
  const entries = [];
  for (const line of readFileSync(abs, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(";");
    const fen = parts[0].trim();
    const depths = [];
    for (const p of parts.slice(1)) {
      const m = p.trim().match(/^D(\d+)\s+(\d+)$/i);
      if (m) depths.push({ depth: Number(m[1]), nodes: Number(m[2]) });
    }
    if (fen && depths.length) entries.push({ fen, depths });
  }
  return entries;
}

function parseWac(abs, depth) {
  const entries = [];
  for (const line of readFileSync(abs, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const fen = trimmed.split(";")[0].replace(/\bbm\b.*$/, "").trim();
    if (fen) entries.push({ fen, depths: [{ depth, nodes: null }] });
  }
  return entries;
}

export const name = "perft";
export async function run(opts) {
  const o = { ...parseSuiteArgs(process.argv.slice(2)), ...opts };
  const depthCap = o.depth ?? 4;
  const perftSuite = parsePerftsuite(assertCorpus(CORPORA.perftsuite));
  const wacSuite = parseWac(assertCorpus(CORPORA.wac150), o.quick ? Math.min(2, depthCap) : depthCap);
  const all = [...perftSuite, ...wacSuite];

  console.log(`\n=== suite: perft (${perftSuite.length} perftsuite FENs + ${wacSuite.length} WAC FENs, depth cap ${depthCap}${o.quick ? ", quick" : ""}) ===`);

  // ---- Parity BEFORE speed: node counts must equal chessops everywhere
  const parityFailures = [];
  let comparisons = 0;
  const positions = [];
  let parityEntry = 0;
  for (const entry of all) {
    parityEntry++;
    if (parityEntry % 25 === 0 || parityEntry === all.length) {
      process.stdout.write(`\r    parity: FEN ${parityEntry}/${all.length} (${comparisons} comparisons)   `);
      if (parityEntry === all.length) process.stdout.write("\r" + " ".repeat(60) + "\r");
    }
    const pc = parseFen(entry.fen);
    const coSetup = coParseFen(entry.fen);
    if (!pc.ok || coSetup.isErr) {
      parityFailures.push({ fen: entry.fen, depth: 0, detail: !pc.ok ? `turbochess parseFen failed: ${pc.error?.code}` : "chessops parseFen failed" });
      continue;
    }
    const pos = { ...pc.value, halfmove: 0, fullmove: 1 };
    const coPos = coChess.fromSetup(coSetup.value).unwrap();
    const cap = Math.min(depthCap, Math.max(...entry.depths.map((d) => d.depth)));
    let deepest = 0;
    for (let d = 1; d <= cap; d++) {
      const pcN = Number(pcPerft(pos, d));
      const coN = Number(coPerft(coPos.clone(), d));
      comparisons++;
      if (pcN !== coN) {
        parityFailures.push({ fen: entry.fen, depth: d, detail: `turbochess=${pcN} chessops=${coN}` });
      }
      const expected = entry.depths.find((x) => x.depth === d);
      if (expected && expected.nodes !== null && pcN !== expected.nodes) {
        parityFailures.push({ fen: entry.fen, depth: d, detail: `turbochess=${pcN} corpus=${expected.nodes}` });
      }
      deepest = pcN;
    }
    positions.push({ fen: entry.fen, pos, coPos, cap, nodes: deepest });
  }

  if (parityFailures.length) {
    console.log(`  parity: FAIL — ${parityFailures.length} mismatches over ${comparisons} FEN/depth comparisons. Aborting before any speed reporting.`);
    parityFailures.slice(0, 10).forEach((f) =>
      console.log(`    ${f.fen} d${f.depth}: ${f.detail}`)
    );
    return {
      metrics: {},
      gates: [gate("perft node parity vs chessops on every FEN/depth", false, "0 mismatches", `${parityFailures.length} mismatches`)],
    };
  }
  console.log(`  parity: ${comparisons}/${comparisons} FEN/depth node counts equal vs chessops`);

  // ---- Timing: nodes/s over the whole corpus at cap depth
  const totalNodes = positions.reduce((s, p) => s + p.nodes, 0);
  const runPc = () => {
    let n = 0;
    for (const p of positions) n += Number(pcPerft(p.pos, p.cap));
    return n;
  };
  const runCo = () => {
    let n = 0;
    for (const p of positions) n += Number(coPerft(p.coPos.clone(), p.cap));
    return n;
  };

  const pcM = measure(runPc, "gigachess");
  const coM = measure(runCo, "chessops");
  const pcNps = thr(totalNodes, pcM.median);
  const coNps = thr(totalNodes, coM.median);
  const ratio = pcNps / coNps;
  console.log(`  corpus: ${positions.length} FENs, ${totalNodes.toLocaleString()} nodes per run at cap depth`);
  console.log(`  gigachess : ${Math.round(pcNps).toLocaleString()} nodes/s (median ${pcM.median.toFixed(0)} ms, p10 ${pcM.p10.toFixed(0)} / p90 ${pcM.p90.toFixed(0)}, 20 runs, 3 warmups excluded)`);
  console.log(`  chessops  : ${Math.round(coNps).toLocaleString()} nodes/s (median ${coM.median.toFixed(0)} ms, p10 ${coM.p10.toFixed(0)} / p90 ${coM.p90.toFixed(0)})`);
  console.log(`  speedup   : ${(ratio * 100 - 100).toFixed(1)}%`);

  const gates = [
    gate("perft nodes/s >= chessops (parity, target +15%)", ratio >= 1.0, ">= 1.00x (target 1.15x)", `${ratio.toFixed(3)}x`),
  ];
  return { metrics: { pcNps, coNps, ratio, totalNodes }, gates };
}
