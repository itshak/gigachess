// bench/suites/pgn-stream.mjs — pinned 100k-game Lichess streaming benchmark
// (task 2.3). Decompresses the sha256-pinned .zst, takes the first 100,000
// games, and stream-parses with 4k/16k/64k chunk sizes. Parity (game counts +
// makePgn(parsePgn(game)) round-trips vs chessops) is verified for EVERY legal
// game BEFORE any timing is reported.
import {
  chunkedGames,
  gate,
  loadLichessGames,
  measure,
  parseSuiteArgs,
  thr,
} from "./lib/common.mjs";
import { parsePgn as pcParsePgn, makePgn as pcMakePgn } from "../../dist/pgn.js";
import { parsePgn as coParsePgn, makePgn as coMakePgn } from "chessops/pgn";

/** Mainline SAN list of a chessops game tree. */
function coSans(game) {
  const sans = [];
  let node = game.moves;
  while (node.children.length > 0) {
    node = node.children[0];
    sans.push(node.data.san);
  }
  return sans;
}

function coMainlineCount(game) {
  return coSans(game).length;
}

export const name = "pgn-stream";

export async function run(opts) {
  const o = { ...parseSuiteArgs(process.argv.slice(2)), ...opts };
  const { games, source } = await loadLichessGames(o);
  const text = games.join("\n\n") + "\n";
  const bytes = Buffer.byteLength(text, "utf8");
  const chunkSizes = [4096, 16384, 65536];

  console.log(`\n=== suite: pgn-stream (${games.length.toLocaleString()} games, ${(bytes / 1048576).toFixed(1)} MB, chunks 4k/16k/64k) ===`);
  console.log(`  corpus: ${source}`);

  // ---- Parity BEFORE timing: game counts + round-trips vs chessops, every legal game
  let pcOkGames = 0;
  let coOkGames = 0;
  const parityFailures = [];
  const pcTrees = new Array(games.length);
  const pcRtSans = new Array(games.length); // pc round-trip SAN streams
  const coRtSans = new Array(games.length); // co round-trip SAN streams
  const coGamesArr = new Array(games.length);
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const pcR = pcParsePgn(g);
    const coParsed = coParsePgn(g);
    const coGame = coParsed.length > 0 ? coParsed[0] : null;
    if (pcR.ok) pcOkGames++;
    if (coGame) coOkGames++;
    if (pcR.ok !== !!coGame) {
      if (parityFailures.length < 10) {
        parityFailures.push(`game ${i}: parse agreement broken (gigachess ok=${pcR.ok}, chessops ok=${!!coGame})`);
      }
      continue;
    }
    if (!pcR.ok) continue; // both reject → agreed (illegal/unsupported game)
    pcTrees[i] = pcR.value;
    coGamesArr[i] = coGame;
    const pcSans = pcR.value.moves.map((m) => m.san);
    const coS = coSans(coGame);
    if (pcSans.length !== coS.length || pcSans.some((s, j) => s !== coS[j])) {
      if (parityFailures.length < 10) {
        parityFailures.push(`game ${i}: SAN stream differs (gigachess ${pcSans.length} moves vs chessops ${coS.length})`);
      }
      continue;
    }
    // makePgn(parsePgn(g)) round-trip on both libs: re-parsed SAN stream must equal the original
    const pcRt = pcParsePgn(pcMakePgn(pcR.value));
    pcRtSans[i] = pcRt.ok ? pcRt.value.moves.map((m) => m.san) : null;
    const coRt = coParsePgn(coMakePgn(coGame));
    coRtSans[i] = coRt.length > 0 ? coSans(coRt[0]) : null;
    const rtBad =
      !pcRtSans[i] || pcRtSans[i].length !== pcSans.length || pcRtSans[i].some((s, j) => s !== pcSans[j]) ||
      !coRtSans[i] || coRtSans[i].length !== coS.length || coRtSans[i].some((s, j) => s !== coS[j]);
    if (rtBad && parityFailures.length < 10) {
      parityFailures.push(`game ${i}: makePgn(parsePgn(g)) round-trip not stable-equal vs chessops`);
    }
  }

  console.log(`  parity: gigachess parsed ${pcOkGames}/${games.length}, chessops parsed ${coOkGames}/${games.length}, SAN streams + round-trips compared per legal game`);
  if (parityFailures.length) {
    parityFailures.forEach((f) => console.log(`    ${f}`));
    return {
      metrics: {},
      gates: [gate("pgn-stream parity (counts + SAN + round-trips) before timing", false, "0 failures", `${parityFailures.length}+ failures`)],
    };
  }

  return await benchPhase({ games, text, bytes, chunkSizes, isQuick: !!o.quick });
}

// ---- Timing: chunked streaming parse per chunk size, both libs
function makeParseWorkload(libParse, text, chunkSize, totalGames) {
  return () => {
    let count = 0;
    let moves = 0;
    for (const g of chunkedGames(text, chunkSize, totalGames)) {
      const r = libParse(g);
      count++;
      if (r && typeof r === "object") {
        if (r.ok) moves += r.value.moves.length;
        else if (typeof r.length === "number") moves += r.length;
      }
    }
    if (count !== totalGames) throw new Error(`parsed ${count} games, expected ${totalGames}`);
    return moves;
  };
}

async function benchPhase({ games, text, bytes, chunkSizes, isQuick }) {
  const metrics = { chunks: {} };
  const gates = [];
  const minRatio = isQuick ? 1.0 : 1.5;
  for (const chunk of chunkSizes) {
    const pcM = measure(makeParseWorkload(pcParsePgn, text, chunk, games.length));
    const coM = measure(makeParseWorkload((g) => coParsePgn(g), text, chunk, games.length));
    const pcGps = thr(games.length, pcM.median);
    const coGps = thr(games.length, coM.median);
    const pcMBs = (bytes / 1048576) / (pcM.median / 1000);
    const ratio = pcGps / coGps;
    metrics.chunks[chunk] = { pcGamesPerSec: pcGps, coGamesPerSec: coGps, ratio, pcMBs };
    console.log(`  chunk ${chunk}: gigachess ${Math.round(pcGps).toLocaleString()} games/s (${pcMBs.toFixed(1)} MB/s) vs chessops ${Math.round(coGps).toLocaleString()} games/s → ${(ratio * 100 - 100).toFixed(1)}% (median of 20, p10 ${pcM.p10.toFixed(0)} / p90 ${pcM.p90.toFixed(0)} vs ${coM.p10.toFixed(0)}/${coM.p90.toFixed(0)}, 3 warmups excluded)`);
    gates.push(gate(`pgn-stream chunk ${chunk}: ≥${isQuick ? "0" : "50"}% higher games/s than chessops`, ratio >= minRatio, `≥${minRatio.toFixed(2)}x`, `${ratio.toFixed(3)}x`));
  }
  // Peak heap gate (design D5): heapUsed sampled post-GC at 10k-game checkpoints.
  const pcPeak = samplePeakHeap(pcParsePgn, text, chunkSizes[1], games.length);
  const coPeak = samplePeakHeap((g) => coParsePgn(g), text, chunkSizes[1], games.length);
  metrics.pcPeakHeapMb = pcPeak;
  metrics.coPeakHeapMb = coPeak;
  const heapPass = coPeak > 0 && pcPeak <= coPeak * 1.1;
  console.log(`  peak heap (post-GC checkpoints, 16k chunks): gigachess ${pcPeak} MB vs chessops ${coPeak} MB → ${(coPeak ? pcPeak / coPeak * 100 : 100).toFixed(1)}%`);
  gates.push(gate("pgn-stream peak heap ≤110% of chessops", heapPass, "≤110%", coPeak ? `${(pcPeak / coPeak * 100).toFixed(1)}%` : "n/a"));
  return { metrics, gates };
}

function samplePeakHeap(libParse, text, chunk, totalGames) {
  global.gc();
  let peak = 0;
  let count = 0;
  const interval = Math.max(1, Math.floor(totalGames / 20)); // ~20 checkpoints, works in --quick too
  for (const g of chunkedGames(text, chunk, totalGames)) {
    libParse(g);
    count++;
    if (count % interval === 0) {
      global.gc();
      peak = Math.max(peak, process.memoryUsage().heapUsed);
    }
  }
  return Math.round(peak / 1048576);
}
