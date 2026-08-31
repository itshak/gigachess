// bench/suites/sliding.mjs — real-occupancy sliding benchmark (task 2.1).
// Harvests occupancy bitboards from perft trees of the 6 standard perft
// positions (NOT uniform-random occupancies), dedups via the lo*2^32+hi key,
// and benchmarks queenAttacks over up to 10M unique real occupancies.
// Parity: attack sets must be bit-identical (turbochess Black Magic vs
// chessops HQ) on the first 100k samples BEFORE any timing is reported.
import { assertCorpus, CORPORA, gate, measure, parseSuiteArgs, thr } from "./lib/common.mjs";
import { parseFen, allDests, makeMove, pieceAt, queenAttacks as pcQueen, iter as sqIter, ensureMagicTablesLoaded as pcEnsureMagicTables, magicTablesLoaded as pcMagicLoaded } from "../../dist/index.js";
import { queenAttacks as coQueen } from "chessops/attacks";
import { SquareSet as CoSS } from "chessops/squareSet";

const PERFT_POS = [
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
  "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
  "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
  "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
  "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
];

/**
 * Walks the perft tree of each position (turbochess public API), inserting the
 * occupancy bitboard of every visited position into an open-addressing hash
 * set keyed by lo*2^32+hi (uint32 pair table — same dedup semantics, far less
 * memory than a BigInt Set). Stops at `target` unique samples or corpus
 * exhaustion (design D3). Returns { los, his, count }.
 */
function harvestOccupancies(depth, target) {
  let cap = 1024;
  while (cap < target * 2) cap <<= 1;
  const mask = cap - 1;
  const tabLo = new Uint32Array(cap);
  const tabHi = new Uint32Array(cap);
  const los = new Uint32Array(target);
  const his = new Uint32Array(target);
  let count = 0;

  function insert(lo, hi) {
    lo >>>= 0; hi >>>= 0;
    let h = (Math.imul(lo, 2654435761) ^ Math.imul(hi, 40503)) >>> 0 & mask;
    for (;;) {
      if (tabLo[h] === lo && tabHi[h] === hi) return true; // dedup hit
      if (tabLo[h] === 0 && tabHi[h] === 0) {
        if (count >= target) return false; // table full → stop walking
        tabLo[h] = lo; tabHi[h] = hi;
        los[count] = lo; his[count] = hi;
        count++;
        return true;
      }
      h = (h + 1) & mask;
    }
  }

  function walk(pos, d) {
    const occ = pos.board.occupied;
    if (!insert(occ.lo, occ.hi)) return false;
    if (d <= 0) return true;
    for (const [from, dests] of allDests(pos)) {
      const piece = pieceAt(pos.board, from);
      const isPawn = piece && piece.role === 0; // Role.Pawn
      for (const to of sqIter(dests)) {
        const needsPromo = isPawn && (to < 8 || to >= 56);
        const child = makeMove(pos, { from, to, promotion: needsPromo ? 4 : undefined });
        if (!walk(child, d - 1)) return false;
      }
    }
    return true;
  }

  for (const fen of PERFT_POS) {
    const r = parseFen(fen);
    if (!r.ok) throw new Error(`harvest: cannot parse ${fen}: ${r.error?.code}`);
    const pos = { ...r.value, halfmove: 0, fullmove: 1 };
    if (!walk(pos, depth)) break; // target reached
  }
  return { los, his, count };
}

export const name = "sliding";

export async function run(opts) {
  const o = { ...parseSuiteArgs(process.argv.slice(2)), ...opts };
  assertCorpus(CORPORA.perftsuite); // pin integrity of the corpus family this suite derives from
  const depth = o.depth ?? (o.quick ? 2 : 4);
  const target = o.samples ?? (o.quick ? 100_000 : 10_000_000);
  const parityBudget = o.quick ? 10_000 : 100_000;

  console.log(`\n=== suite: sliding (occupancies from perft(${depth}) trees, target ${target.toLocaleString()} unique) ===`);
  const t0 = performance.now();
  const { los, his, count } = harvestOccupancies(depth, target);
  console.log(`  harvested ${count.toLocaleString()} unique real occupancies in ${((performance.now() - t0) / 1000).toFixed(1)}s (dedup key lo*2^32+hi)`);
  if (count < target) {
    console.log(`  note: perft(${depth}) corpus exhausted at ${count.toLocaleString()} unique occupancies (target ${target.toLocaleString()}, design D3 exhaustion path)`);
  }

  // ---- Parity BEFORE timing: attack sets bit-identical on first 100k samples
  const parityTotal = Math.min(parityBudget, count * 64);
  let checked = 0;
  let mismatch = 0;
  const examples = [];
  outerParity: for (let i = 0; i < count; i++) {
    const lo = los[i], hi = his[i];
    const coOcc = new CoSS(lo | 0, hi | 0);
    for (let sq = 0; sq < 64; sq++) {
      const pc = pcQueen(sq, { lo, hi });
      const co = coQueen(sq, coOcc);
      if ((pc.lo >>> 0) !== (co.lo >>> 0) || (pc.hi >>> 0) !== (co.hi >>> 0)) {
        mismatch++;
        if (examples.length < 5) examples.push(`sq=${sq} occ={${lo},${hi}} pc={${pc.lo >>> 0},${pc.hi >>> 0}} co={${co.lo >>> 0},${co.hi >>> 0}}`);
      }
      if (++checked >= parityTotal) break outerParity;
    }
  }
  console.log(`  parity: ${checked - mismatch}/${checked} attack sets bit-identical (turbochess Black Magic vs chessops HQ)`);
  if (mismatch) examples.forEach((e) => console.log(`    MISMATCH ${e}`));

  // ---- Timing: MAttacks/s over the harvested real occupancies.
  // Two phases per the blob/lazy design (task 3.5, change
  // purechess-gates-green): phase 1 runs with the tables UNLOADED so the
  // naive ray-walk fallback serves (gate: ≥1.5× chessops — the chessops-
  // beating guarantee from the first call); then ensureMagicTablesLoaded()
  // swaps in the blob-backed fancy magic (gate: ≥2.5× chessops).
  const metrics = {};
  const gates = [];
  if (mismatch > 0) {
    console.log("  timing skipped — parity failed (a faster-but-wrong library must fail, not win)");
  } else {
    const occsUsed = Math.min(count, Math.ceil((o.quick ? 200_000 : 10_000_000) / 64));
    const pcOccs = new Array(occsUsed);
    const coOccs = new Array(occsUsed);
    for (let i = 0; i < occsUsed; i++) {
      const j = i % count;
      pcOccs[i] = { lo: los[j], hi: his[j] };
      coOccs[i] = new CoSS(los[j] | 0, his[j] | 0);
    }
    const runPc = () => {
      let acc = 0;
      for (let i = 0; i < occsUsed; i++) {
        const occ = pcOccs[i];
        for (let sq = 0; sq < 64; sq++) {
          const a = pcQueen(sq, occ);
          acc = (acc + a.lo + a.hi) | 0;
        }
      }
      return acc;
    };
    const runCo = () => {
      let acc = 0;
      for (let i = 0; i < occsUsed; i++) {
        const occ = coOccs[i];
        for (let sq = 0; sq < 64; sq++) {
          const a = coQueen(sq, occ);
          acc = (acc + a.lo + a.hi) | 0;
        }
      }
      return acc;
    };

    const benchPhase = (label) => {
      const pcM = measure(runPc);
      const coM = measure(runCo);
      const pcMa = thr(occsUsed * 64, pcM.median) / 1e6;
      const coMa = thr(occsUsed * 64, coM.median) / 1e6;
      console.log(`  [${label}] ${occsUsed.toLocaleString()} occupancies × 64 squares = ${(occsUsed * 64).toLocaleString()} attack calls per run`);
      console.log(`  [${label}] turbochess : ${pcMa.toFixed(1)} MAttacks/s (median ${pcM.median.toFixed(1)} ms, p10 ${pcM.p10.toFixed(1)} / p90 ${pcM.p90.toFixed(1)}, 20 runs, 3 warmups excluded)`);
      console.log(`  [${label}] chessops  : ${coMa.toFixed(1)} MAttacks/s (median ${coM.median.toFixed(1)} ms, p10 ${coM.p10.toFixed(1)} / p90 ${coM.p90.toFixed(1)})`);
      return { pcMa, coMa, ratio: pcMa / coMa };
    };

    // Phase 1: naive fallback (tables unloaded)
    if (pcMagicLoaded()) throw new Error("sliding: tables unexpectedly preloaded before phase 1");
    const naive = benchPhase("pre-load naive fallback");
    metrics.naive = { mAttacksPerSec: naive.pcMa, ratio: naive.ratio };
    gates.push(gate("pre-load naive fallback ≥1.5× chessops MAttacks/s", naive.ratio >= 1.5, "≥ 1.5×", `${naive.ratio.toFixed(2)}×`));

    // Phase 2: load the blob tables and re-benchmark (loaded magic path)
    const t0 = performance.now();
    await pcEnsureMagicTables();
    const loadMs = performance.now() - t0;
    console.log(`  magic tables loaded via ensureMagicTablesLoaded() in ${loadMs.toFixed(1)} ms (blob decode + dynamic import)`);
    const loaded = benchPhase("loaded blob magic");
    metrics.loaded = { mAttacksPerSec: loaded.pcMa, ratio: loaded.ratio, loadMs };
    gates.push(gate("loaded blob magic ≥2.5× chessops MAttacks/s", loaded.ratio >= 2.5, "≥ 2.5×", `${loaded.ratio.toFixed(2)}×`));
  }

  gates.push(
    gate(
      "sliding attack-set parity 100% on first 100k samples",
      mismatch === 0 && checked >= parityTotal,
      `${parityTotal.toLocaleString()} identical`,
      `${checked - mismatch}/${checked}`
    )
  );
  return { metrics, gates };
}
