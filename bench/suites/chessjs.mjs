// bench/suites/chessjs.mjs — parity-first benchmark lane vs chess.js@1.4.0
// (change: purechess-remaining-cleanroom, tasks 5.1/5.2).
//
// chess.js is a DEV-ONLY bench baseline: it is imported HERE ONLY (never in
// src/). Methodology identical to the other suites (bench/suites/lib/common.mjs):
// 3 warmups excluded, median of 20 runs, global.gc() between iterations,
// performance.now() clock, pinned corpora.
//
// Corpora (same pins as fen-san-uci / pgn-stream, see bench/data/README.md):
//   - bench/data/lichess_db.sample.pgn (10-game vendored sample)
//     sha256 f5c0644769394e3169828dd6f224ab3204bb83f40fb535396e3de076ed7dc0f8
//   - bench/data/lichess_db_standard_rated_2013-01.pgn.zst (100k games, full)
//     sha256 aa40b3671fa3cf1072eb182892cd90b0e1e003a4a5943492f64b77e7f3fd1635
//   - refs/mit-permissive/Chess4j/src/test/resources/samplefen1000.epd
//     sha256 88ff90cfa8bd67593d044ea245ccdc1b3f82be2a3c9ea2d8c2b3efe6166b72aa
//   - refs/mit-permissive/GopherCheck/test_suites/perftsuite.epd
//     sha256 cb27ea3a61e11e8466ab4f76305e5db8f5de47eb413a723398217d490dfdab41
//   - refs/mit-permissive/GopherCheck/test_suites/wac_150.epd
//     sha256 54a984ab7a1ba74ae021ab2a646fc157933995722b90321ea9de9a33d1ed381c
//
// Gates are PARITY-FIRST: any SAN/FEN byte mismatch above the 0.1% tolerance
// aborts with PARITY FAIL before any speed number is reported. Speed rows are
// report-only (turbochess is expected to win PGN streaming and FEN, but a
// narrow miss does not fail CI — only parity does).
// perft: chess.js has no perft API — noted N/A. UCI: compared via verbose `lan`.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  assertCorpus,
  CORPORA,
  gate,
  loadLichessGames,
  measure,
  parseSuiteArgs,
  thr,
  REPO_ROOT,
  WARMUPS,
  RUNS,
} from "./lib/common.mjs";
import { Chess as PcChess } from "../../dist/index.js";
import { parsePgn as pcParsePgn } from "../../dist/pgn.js";
import { Chess as JsChess } from "chess.js";

export const name = "chessjs";

const REPLAY_STREAMS = 3;      // game SAN streams for ply-by-ply fen/san parity
const PGN_SPEED_GAMES_CAP = 1000; // timed PGN phase cap (full mode)

function printHelp() {
  console.log(`chessjs — gigachess/chessjs vs chess.js@1.4.0 (parity-first)

Corpora (pinned, see bench/data/README.md):
  ${CORPORA.lichessZst.path} (${CORPORA.lichessZst.sha256.slice(0, 12)}…)
  ${CORPORA.lichessSample.path} (${CORPORA.lichessSample.sha256.slice(0, 12)}…)
  ${CORPORA.samplefen1000.path} (${CORPORA.samplefen1000.sha256.slice(0, 12)}…)
  ${CORPORA.perftsuite.path} (${CORPORA.perftsuite.sha256.slice(0, 12)}…)
  ${CORPORA.wac150.path} (${CORPORA.wac150.sha256.slice(0, 12)}…)

Phases:
  1. Parity: fen()/moves()/verbose-move objects per corpus FEN, ply-by-ply
     fen/san/history replay on ${REPLAY_STREAMS} game streams. Any byte mismatch above
     0.1% aborts with PARITY FAIL — no speed numbers on a divergent impl.
  2. Speed (report-only): FEN parse+make, SAN make, dests, PGN games/s + peak heap.
`);
}

/**
 * Builds the FEN corpus: unique positions replayed from real games (turbochess
 * facade SAN replay) + samplefen1000.epd + perftsuite.epd + wac_150.epd FENs.
 */
function buildFenCorpus(games, target) {
  const seen = new Set();
  const fens = [];
  const add = (fen) => {
    if (!seen.has(fen) && fens.length < target) { seen.add(fen); fens.push(fen); }
    return fens.length >= target;
  };
  for (const game of games) {
    const m = game.match(/\[FEN "([^"]+)"\]/);
    const startFen = m ? m[1] : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    let pos;
    try { pos = new PcChess(startFen); } catch { continue; }
    if (add(pos.fen())) return fens;
    const parsed = pcParsePgn(game);
    if (!parsed.ok) continue;
    for (const mv of parsed.value.moves) {
      if (!pos.move(mv.san)) break; // illegal/unsupported → stop this game
      if (add(pos.fen())) return fens;
    }
  }
  const epdFiles = [CORPORA.samplefen1000, CORPORA.perftsuite, CORPORA.wac150];
  for (const corpus of epdFiles) {
    const abs = join(REPO_ROOT, corpus.path);
    if (!existsSync(abs)) continue;
    assertCorpus(corpus);
    for (const line of readFileSync(abs, "utf8").split("\n")) {
      const fen = line.split(" c9 ")[0].trim();
      if (fen) add(fen);
      if (fens.length >= target) return fens;
    }
  }
  return fens;
}

/** Sorted SAN list — order-independent comparison (chess.js move order differs). */
const sortedSans = (g) => g.moves().slice().sort();

/** Normalized verbose move objects (chess.js emits `before`/`after` too). */
const normVerbose = (g, square) => JSON.stringify(g
  .moves(square ? { square, verbose: true } : { verbose: true })
  .map((m) => [m.from, m.to, m.san, m.piece, m.color, m.flags, m.lan, m.captured ?? null, m.promotion ?? null])
  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

export async function run(opts) {
  const o = { ...parseSuiteArgs(process.argv.slice(2)), ...opts };
  if (o.help) { printHelp(); return { metrics: {}, gates: [] }; }
  const { games, source } = await loadLichessGames(o);
  const target = o.positions ?? (o.quick ? 1000 : 10000);
  const fens = buildFenCorpus(games, target);
  console.log(`\n=== suite: chessjs (${fens.length} corpus FENs, ${games.length} games) ===`);
  console.log(`  corpus: ${source}`);

  // ---- Phase 1: parity BEFORE any timing (≥99.9% gate, CI-failing)
  let fenBad = 0, sanBad = 0, verboseBad = 0;
  const examples = [];
  const show = (kind, msg) => { if (examples.length < 10) examples.push(`${kind}: ${msg}`); };
  for (const fen of fens) {
    let pc, js;
    try { pc = new PcChess(fen); } catch (e) { fenBad++; show("fen-load", `turbochess rejected ${fen}: ${e.message}`); continue; }
    try { js = new JsChess(fen); } catch (e) { fenBad++; show("fen-load", `chessjs accepted, chess.js rejected ${fen}: ${e.message.slice(0, 60)}`); continue; }
    if (pc.fen() !== js.fen()) { fenBad++; show("fen", `${fen}\n      pc : ${pc.fen()}\n      js : ${js.fen()}`); }
    if (JSON.stringify(sortedSans(pc)) !== JSON.stringify(sortedSans(js))) { sanBad++; show("san", fen); }
    if (normVerbose(pc) !== normVerbose(js)) { verboseBad++; show("verbose", fen); }
  }
  // ply-by-ply replay parity on the first REPLAY_STREAMS game streams
  let replayOk = true;
  for (const game of games.slice(0, REPLAY_STREAMS)) {
    const parsed = pcParsePgn(game);
    if (!parsed.ok) continue;
    const pc = new PcChess(), js = new JsChess();
    for (const mv of parsed.value.moves) {
      const mp = pc.move(mv.san);
      let mj;
      try { mj = js.move(mv.san); } catch { mj = null; } // chess.js throws on illegal
      if ((mp === null) !== (mj === null)) { replayOk = false; show("replay-agree", `move ${mv.san}: pc=${mp?.san ?? "null"} js=${mj?.san ?? "null"}`); break; }
      if (!mp) break;
      if (mp.san !== mj.san || pc.fen() !== js.fen() ||
          JSON.stringify(pc.history()) !== JSON.stringify(js.history())) {
        replayOk = false; show("replay", `after ${mv.san}: fen ${pc.fen()} vs ${js.fen()}`); break;
      }
    }
  }
  const total = fens.length * 3 + REPLAY_STREAMS;
  const bad = fenBad + sanBad + verboseBad + (replayOk ? 0 : REPLAY_STREAMS);
  const parityRate = total ? (total - bad) / total : 1;
  console.log(`  parity: fen ${fens.length - fenBad}/${fens.length}, SAN ${fens.length - sanBad}/${fens.length}, verbose ${fens.length - verboseBad}/${fens.length}, replay ${replayOk ? "clean" : "MISMATCH"} on ${REPLAY_STREAMS} streams`);
  examples.forEach((e) => console.log(`    ${e}`));
  if (parityRate < 0.999) {
    console.error(`\nPARITY FAIL — ${(parityRate * 100).toFixed(3)}% < 99.9%; no speed numbers reported on a divergent impl.`);
    return {
      metrics: { fens: fens.length, parityRate },
      gates: [gate("chessjs FEN/SAN/verbose/replay parity ≥99.9% (CI-failing)", false, "≥99.9%", `${(parityRate * 100).toFixed(3)}%`)],
    };
  }
  console.log(`  PARITY OK — ${(parityRate * 100).toFixed(3)}% (≥99.9%); perft vs chess.js: N/A (chess.js has no perft API)`);
  // ---- Phase 2: speed (report-only)
  const gates = [
    gate("chessjs FEN/SAN/verbose/replay parity ≥99.9% (CI-failing)", true, "≥99.9%", `${(parityRate * 100).toFixed(3)}%`),
  ];
  const metrics = { fens: fens.length };

  // FEN parse+make
  const fenWorkPc = () => { let n = 0; for (const fen of fens) { try { n += new PcChess(fen).fen() ? 1 : 0; } catch { /* rejected */ } } return n; };
  const fenWorkJs = () => { let n = 0; for (const fen of fens) { try { n += new JsChess(fen).fen() ? 1 : 0; } catch { /* rejected */ } } return n; };
  const pcFen = measure(fenWorkPc), jsFen = measure(fenWorkJs);
  metrics.fenPcFps = thr(fens.length, pcFen.median);
  metrics.fenJsFps = thr(fens.length, jsFen.median);
  console.log(`  FEN parse+make: gigachess ${Math.round(metrics.fenPcFps).toLocaleString()}/s vs chess.js ${Math.round(metrics.fenJsFps).toLocaleString()}/s → ${(metrics.fenPcFps / metrics.fenJsFps).toFixed(2)}x (median of ${RUNS}, ${WARMUPS} warmups excluded)`);
  gates.push(gate("FEN parse+make speed vs chess.js (report-only)", true, "report-only", `${(metrics.fenPcFps / metrics.fenJsFps).toFixed(2)}x`));

  // SAN make + dests over the corpus FENs
  const sanDestsPc = () => { let n = 0; for (const fen of fens) { const g = new PcChess(fen); n += g.moves().length + g.moves({ square: "e4", verbose: true }).length; } return n; };
  const sanDestsJs = () => { let n = 0; for (const fen of fens) { const g = new JsChess(fen); n += g.moves().length + g.moves({ square: "e4", verbose: true }).length; } return n; };
  const pcSd = measure(sanDestsPc), jsSd = measure(sanDestsJs);
  metrics.sanDestsPcFps = thr(fens.length, pcSd.median);
  metrics.sanDestsJsFps = thr(fens.length, jsSd.median);
  console.log(`  SAN make + dests: gigachess ${Math.round(metrics.sanDestsPcFps).toLocaleString()}/s vs chess.js ${Math.round(metrics.sanDestsJsFps).toLocaleString()}/s → ${(metrics.sanDestsPcFps / metrics.sanDestsJsFps).toFixed(2)}x`);
  gates.push(gate("SAN make + dests speed vs chess.js (report-only)", true, "report-only", `${(metrics.sanDestsPcFps / metrics.sanDestsJsFps).toFixed(2)}x`));

  // PGN streaming: gigachess parsePgn + facade replay vs chess.js loadPgn
  const pgnGames = games.slice(0, Math.min(games.length, PGN_SPEED_GAMES_CAP));
  const text = pgnGames.join("\n\n") + "\n";
  const bytes = Buffer.byteLength(text, "utf8");
  const pgnWorkPc = () => {
    let n = 0;
    for (const game of pgnGames) {
      const parsed = pcParsePgn(game);
      if (!parsed.ok) continue;
      const g = new PcChess();
      for (const mv of parsed.value.moves) if (!g.move(mv.san)) break;
      n++;
    }
    return n;
  };
  const pgnWorkJs = () => {
    let n = 0;
    for (const game of pgnGames) {
      try { new JsChess().loadPgn(game); n++; } catch { /* chess.js rejects → skipped */ }
    }
    return n;
  };
  const pcPgn = measure(pgnWorkPc), jsPgn = measure(pgnWorkJs);
  metrics.pgnPcGps = thr(pgnGames.length, pcPgn.median);
  metrics.pgnJsGps = thr(pgnGames.length, jsPgn.median);
  const pcMBs = (bytes / 1048576) / (pcPgn.median / 1000);
  const jsMBs = (bytes / 1048576) / (jsPgn.median / 1000);
  console.log(`  PGN games/s: gigachess ${Math.round(metrics.pgnPcGps).toLocaleString()} (${pcMBs.toFixed(1)} MB/s) vs chess.js loadPgn ${Math.round(metrics.pgnJsGps).toLocaleString()} (${jsMBs.toFixed(1)} MB/s) → ${(metrics.pgnPcGps / metrics.pgnJsGps).toFixed(2)}x (expected ≥1.5x)`);
  gates.push(gate("PGN streaming speed vs chess.js (report-only, expected ≥1.5x)", true, "report-only", `${(metrics.pgnPcGps / metrics.pgnJsGps).toFixed(2)}x`));

  // peak heap during the gigachess PGN phase (post-GC checkpoints)
  global.gc();
  let peak = 0;
  const interval = Math.max(1, Math.floor(pgnGames.length / 20));
  let count = 0;
  for (const game of pgnGames) {
    const parsed = pcParsePgn(game);
    if (parsed.ok) {
      const g = new PcChess();
      for (const mv of parsed.value.moves) if (!g.move(mv.san)) break;
    }
    if (++count % interval === 0) { global.gc(); peak = Math.max(peak, process.memoryUsage().heapUsed); }
  }
  metrics.peakHeapMb = Math.round(peak / 1048576);
  console.log(`  peakHeap (gigachess PGN replay, post-GC checkpoints): ${metrics.peakHeapMb} MB`);

  // ---- Results file
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    `# chessjs lane results — ${date}`, "",
    `gigachess/chessjs vs chess.js@1.4.0 (bench baseline only, never imported in src/).`,
    `Corpus: ${source} + samplefen1000.epd + perftsuite.epd + wac_150.epd (pinned sha256).`,
    `Methodology: ${WARMUPS} warmups excluded, median of ${RUNS} runs, global.gc() between iterations.`, "",
    "| gate | target | actual |", "|---|---|---|",
    ...gates.map((g) => `| ${g.pass ? "✓" : "✗"} ${g.name} | ${g.target} | ${g.actual} |`), "",
    "Raw metrics:",
    ...Object.entries(metrics).map(([k, v]) => `- ${k}: ${typeof v === "number" ? Number(v.toFixed(4)) : v}`), "",
  ];
  mkdirSync(join(REPO_ROOT, "bench", "results"), { recursive: true });
  const outPath = join(REPO_ROOT, "bench", "results", `chessjs-${date}.md`);
  writeFileSync(outPath, lines.join("\n") + "\n");
  console.log(`  results written: bench/results/chessjs-${date}.md`);

  return { metrics, gates };
}


// Standalone entry: node bench/suites/chessjs.mjs [--help] [--quick] [--positions N]
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseSuiteArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
  } else {
    run({ quick: args.quick, json: args.json })
      .then((r) => process.exit(r.gates.some((g) => !g.pass) ? 1 : 0))
      .catch((e) => { console.error(e); process.exit(1); });
  }
}
