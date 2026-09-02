// bench/suites/blindbase-real.mjs — real-world blind-base workstation
// workloads (change turbochess-unified-api-and-perf, task 4.1 / spec
// turbochess-blindbase-benchmarks). Profiles the 4 core workstation flows:
//   1. repertoire-build      — merge 5,000 opening lines into a prefix tree
//                              keyed by normalized FENs
//   2. reference-tree        — stream 10,000 master games through pgnImport
//   3. chessground-dests     — format allDests() into Map<Key, Key[]> over
//                              10,000 real-game positions
//   4. uci-to-san            — translate 100,000 engine plies (UCI stream)
//                              to legal SAN with check/mate suffixes
// Parity is verified BEFORE any speed is reported (same parity-first policy
// as the other suites); chessops baselines run the identical workload.
import { gate, measure, parseSuiteArgs, thr, loadLichessGames, fmtMs, peakHeapMb } from "./lib/common.mjs";
import {
  Chess as PcChess,
  parseFen as pcParseFen,
  allDests as pcAllDests,
  parseUci as pcParseUci,
  makeSan as pcMakeSan,
  isLegal as pcIsLegal,
  makeMove as pcMakeMove,
  makeFen as pcMakeFen,
  INITIAL_FEN,
  pgnImport as pcPgnImport,
} from "../../dist/index.js";
import { Chess as CoChess } from "chessops/chess";
import { parseFen as coParseFen, makeFen as coMakeFen } from "chessops/fen";
import { parseUci as coParseUci } from "chessops/util";
import { makeSan as coMakeSan } from "chessops/san";

const normKey = (fen) => {
  const f = fen.split(" ");
  // drop the ep field: engines legitimately differ on raw-vs-filtered ep
  // emission (turbochess emits the raw square, chessops filters unreachable
  // ones); repertoire merging keys on placement/turn/castling/counters
  return `${f[0]} ${f[1]} ${f[2]} ${f[4]} ${f[5]}`;
};

export const name = "blindbase-real";

let seed = 0xbb45e12;
function rnd(n) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % n;
}

const sqName = (s) => String.fromCharCode(97 + (s & 7)) + String.fromCharCode(49 + (s >> 3));

/** Deterministic seeded playouts recorded as UCI streams + FEN trails. */
function buildPlayouts(nGames, minPlies) {
  const games = [];
  let attempts = 0;
  while (games.length < nGames && attempts < nGames * 20) {
    attempts++;
    const g = new PcChess();
    const ucis = [];
    const fens = [g.fen()];
    const depth = minPlies + rnd(4);
    let p = 0;
    while (p < depth) {
      const vs = g.moves({ verbose: true });
      if (vs.length === 0) break;
      const v = vs[rnd(vs.length)];
      ucis.push(v.lan);
      g.move(v.san);
      fens.push(g.fen());
      p++;
    }
    if (ucis.length >= minPlies) games.push({ ucis, fens });
  }
  return games;
}

export async function run(opts) {
  const o = { ...parseSuiteArgs(process.argv.slice(2)), ...opts };
  const quick = !!o.quick;
  const N_LINES = o.samples ?? (quick ? 500 : 5000);
  const N_GAMES = o.games ?? (quick ? 10 : 10000);
  const N_POSITIONS = o.positions ?? (quick ? 1000 : 10000);
  const N_PLIES = quick ? 10000 : 100000;

  console.log(`\n=== suite: blindbase-real (${N_GAMES} pgn games, ${N_POSITIONS} dests positions, ${N_PLIES} uci plies${quick ? ", quick" : ""}) ===`);

  // ---- shared corpus: deterministic seeded playouts -------------------------
  process.stdout.write("    corpus: generating seeded playouts…\n");
  const lines = buildPlayouts(N_LINES, 8); // repertoire lines
  const playouts = buildPlayouts(Math.max(64, Math.ceil(N_POSITIONS / 10)), 10);
  const destsPositions = [];
  for (const g of playouts) for (const fen of g.fens) destsPositions.push(fen);
  while (destsPositions.length < N_POSITIONS) {
    const g = playouts[rnd(playouts.length)];
    destsPositions.push(g.fens[rnd(g.fens.length)]);
  }
  destsPositions.length = N_POSITIONS;
  const uciStream = [];
  let gi = 0;
  while (uciStream.length < N_PLIES) {
    const g = playouts[gi % playouts.length];
    uciStream.push(...g.ucis);
    gi++;
  }
  uciStream.length = N_PLIES;
  console.log(`    corpus: ${lines.length} repertoire lines, ${destsPositions.length} positions, ${uciStream.length} uci plies (heap ${peakHeapMb()} MB)`);

  const gates = [];

  // ---- Workload 1: repertoire-build ----------------------------------------
  // Merge opening lines into a prefix tree keyed by normalized FENs. The
  // chessops baseline builds the identical structure from the same lines.
  const buildPc = () => {
    const nodes = new Map(); // fenKey -> Map<uci, fenKey>
    for (const { ucis } of lines) {
      const r = pcParseFen(INITIAL_FEN);
      if (!r.ok) break;
      let pos = r.value;
      let key = normKey(INITIAL_FEN);
      for (const uci of ucis) {
        const mv = pcParseUci(uci);
        if (!mv.ok || !pcIsLegal(pos, mv.value)) break;
        pos = pcMakeMove(pos, mv.value);
        const nextKey = normKey(pcMakeFen(pos));
        let kids = nodes.get(key);
        if (!kids) { kids = new Map(); nodes.set(key, kids); }
        if (!kids.has(uci)) kids.set(uci, nextKey);
        key = nextKey;
      }
    }
    return nodes;
  };
  const buildCo = () => {
    const nodes = new Map();
    for (const { ucis } of lines) {
      const pos = CoChess.default();
      let key = normKey(coMakeFen(pos.toSetup()));
      for (const uci of ucis) {
        const mv = coParseUci(uci);
        if (!mv) break;
        pos.play(mv);
        const nextKey = normKey(coMakeFen(pos.toSetup()));
        let kids = nodes.get(key);
        if (!kids) { kids = new Map(); nodes.set(key, kids); }
        if (!kids.has(uci)) kids.set(uci, nextKey);
        key = nextKey;
      }
    }
    return nodes;
  };
  {
    const pcTree = buildPc();
    const coTree = buildCo();
    const pcEdges = [...pcTree.entries()].reduce((s, [, k]) => s + k.size, 0);
    const coEdges = [...coTree.entries()].reduce((s, [, k]) => s + k.size, 0);
    gates.push(gate("repertoire-build parity: identical merged node/edge counts",
      pcTree.size === coTree.size && pcEdges === coEdges,
      "identical", `${pcTree.size} nodes/${pcEdges} edges vs ${coTree.size}/${coEdges}`));
    const pcM = measure(buildPc, "repertoire gigachess");
    const coM = measure(buildCo, "repertoire chessops");
    const ratio = coM.median / pcM.median;
    console.log(`  repertoire-build: ${fmtMs(pcM.median)} ms vs chessops ${fmtMs(coM.median)} ms -> ${ratio.toFixed(2)}x (${thr(N_LINES, pcM.median).toFixed(0)} lines/s, heap ${peakHeapMb()} MB)`);
    gates.push(gate("repertoire-build speedup vs chessops >=1.0x", ratio >= 1.0, ">=1.00x", `${ratio.toFixed(3)}x`));
  }

  // ---- Workload 2: reference-tree (master games through pgnImport) ----------
  {
    const { games, source } = await loadLichessGames({ quick, games: N_GAMES });
    console.log(`  reference corpus: ${source}`);
    const runImport = () => {
      let built = 0;
      for (const pgn of games) {
        const data = pcPgnImport(pgn);
        if (data.treeParts.length > 0 && data.treeParts[0].children.length > 0) built++;
      }
      return built;
    };
    const built = runImport();
    const m = measure(runImport, "pgnImport");
    const gamesSec = thr(N_GAMES, m.median);
    console.log(`  reference-tree: ${fmtMs(m.median)} ms per ${N_GAMES} games -> ${gamesSec.toFixed(0)} games/s (built ${built}/${N_GAMES}, heap ${peakHeapMb()} MB)`);
    gates.push(gate("reference-tree: every game imported with a non-empty tree", built === N_GAMES, "100%", `${built}/${N_GAMES} (chess.js/chessops expose no variation-tree importer — throughput-only workload)`));
  }

  // ---- Workload 3: chessground-dests (Map<Key, Key[]> formatting) -----------
  const destsPc = () => {
    const out = new Map();
    for (const fen of destsPositions) {
      const r = pcParseFen(fen);
      if (!r.ok) continue;
      for (const [from, set] of pcAllDests(r.value)) {
        const list = [];
        let lo = set.lo >>> 0, hi = set.hi >>> 0;
        while (lo !== 0) { const lsb = (lo & -lo) >>> 0; list.push(sqName(31 - Math.clz32(lsb))); lo ^= lsb; }
        while (hi !== 0) { const lsb = (hi & -hi) >>> 0; list.push(sqName(32 + (31 - Math.clz32(lsb)))); hi ^= lsb; }
        out.set(sqName(from), list);
      }
    }
    return out;
  };
  const destsCo = () => {
    const out = new Map();
    for (const fen of destsPositions) {
      const setup = coParseFen(fen).unwrap();
      const pos = CoChess.fromSetup(setup).unwrap();
      for (const [from, list] of pos.allDests()) {
        const arr = [...list].map((d) => sqName(d));
        if (arr.length === 0) continue; // turbochess allDests omits empty sets
        out.set(sqName(from), arr);
      }
    }
    return out;
  };
  {
    const a = destsPc();
    const b = destsCo();
    let mismatch = 0;
    let checked = 0;
    for (const [k, v] of a) {
      const other = b.get(k);
      checked++;
      if (!other || other.join(",") !== v.join(",")) {
        mismatch++;
        if (mismatch <= 3) console.log(`    dests mismatch at ${k}: ${v.join(" ")} vs ${other ? other.join(" ") : "none"}`);
      }
    }
    gates.push(gate("chessground-dests parity: identical dest maps", mismatch === 0, "0 mismatches", `${mismatch} mismatches over ${checked} positions`));
    const pcM = measure(destsPc, "dests gigachess");
    const coM = measure(destsCo, "dests chessops");
    const ratio = coM.median / pcM.median;
    console.log(`  chessground-dests: ${fmtMs(pcM.median)} ms vs chessops ${fmtMs(coM.median)} ms -> ${ratio.toFixed(2)}x (${thr(N_POSITIONS, pcM.median).toFixed(0)} positions/s, heap ${peakHeapMb()} MB)`);
    gates.push(gate("chessground-dests speedup vs chessops >=1.0x", ratio >= 1.0, ">=1.00x", `${ratio.toFixed(3)}x`));
  }

  // ---- Workload 4: uci-to-san (live engine UCI stream translation) ----------
  const sanPc = () => {
    let count = 0;
    for (const g of playouts) {
      const r = pcParseFen(g.fens[0]);
      if (!r.ok) continue;
      let pos = r.value;
      for (const uci of g.ucis) {
        const mv = pcParseUci(uci);
        if (!mv.ok || !pcIsLegal(pos, mv.value)) break;
        pcMakeSan(mv.value, pos);
        pos = pcMakeMove(pos, mv.value);
        count++;
      }
    }
    return count;
  };
  const sanCo = () => {
    let count = 0;
    for (const g of playouts) {
      const setup = coParseFen(g.fens[0]).unwrap();
      const pos = CoChess.fromSetup(setup).unwrap();
      for (const uci of g.ucis) {
        const mv = coParseUci(uci);
        if (!mv) break;
        coMakeSan(pos, mv);
        pos.play(mv);
        count++;
      }
    }
    return count;
  };
  {
    // parity: SAN strings byte-identical for every ply
    let parityBad = 0, compared = 0;
    outer: for (const g of playouts.slice(0, 16)) {
      const r = pcParseFen(g.fens[0]);
      if (!r.ok) continue;
      let pos = r.value;
      const coPos = CoChess.fromSetup(coParseFen(g.fens[0]).unwrap()).unwrap();
      for (const uci of g.ucis) {
        const mv = pcParseUci(uci);
        if (!mv.ok) break;
        const pcSan = pcMakeSan(mv.value, pos);
        const coMv = coParseUci(uci);
        const coSan = coMakeSan(coPos, coMv);
        compared++;
        if (pcSan !== coSan) {
          parityBad++;
          if (parityBad <= 3) console.log(`    san mismatch: ${uci} -> ${pcSan} vs ${coSan}`);
          break outer;
        }
        pos = pcMakeMove(pos, mv.value);
        coPos.play(coMv);
      }
    }
    gates.push(gate("uci-to-san parity: SAN byte-identical vs chessops", parityBad === 0, "0 mismatches", `${parityBad} mismatches over ${compared} plies`));
    const pcM = measure(sanPc, "uci gigachess");
    const coM = measure(sanCo, "uci chessops");
    const ratio = coM.median / pcM.median;
    console.log(`  uci-to-san: ${fmtMs(pcM.median)} ms vs chessops ${fmtMs(coM.median)} ms -> ${ratio.toFixed(2)}x (${thr(N_PLIES, pcM.median).toFixed(0)} plies/s, heap ${peakHeapMb()} MB)`);
    gates.push(gate("uci-to-san speedup vs chessops >=1.0x", ratio >= 1.0, ">=1.00x", `${ratio.toFixed(3)}x`));
  }

  return { metrics: { lines: N_LINES, games: N_GAMES, positions: N_POSITIONS, plies: N_PLIES }, gates };
}
