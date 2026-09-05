// bench/suites/fen-san-uci.mjs — FEN/SAN/UCI parity + throughput (task 2.4).
// 10k+ FENs from real games plus Chess960/X-FEN samples. FEN parse→make
// round-trips must be byte-identical vs chessops; SAN make/parse (incl. +/#/=Q
// disambiguation) byte-identical; makeUci identical modulo ADR-013 castling
// normalization (gigachess e1g1 vs chessops e1h1 → canonicalized to landing
// square). Parity ≥99% with failures enumerated BEFORE throughput reporting.
import { assertCorpus, CORPORA, gate, loadLichessGames, measure, parseSuiteArgs, thr } from "./lib/common.mjs";
import { readFileSync } from "node:fs";
import {
  parseFen as pcParseFen,
  makeFen as pcMakeFen,
} from "../../dist/fen.js";
import { parseSan as pcParseSan, makeSan as pcMakeSan, makeUci as pcMakeUci } from "../../dist/san.js";
import { parsePgn as pcParsePgn } from "../../dist/pgn.js";
import { allDests as pcAllDests, makeMove as pcMakeMove, pieceAt as pcPieceAt, iter as sqIter } from "../../dist/index.js";

import { Chess as coChess } from "chessops/chess";
import { parseFen as coParseFen, makeFen as coMakeFen } from "chessops/fen";
import { parseSan as coParseSan, makeSan as coMakeSan } from "chessops/san";
import { makeUci as coMakeUci } from "chessops/util";

// Role constants (const-enum values per src/types.ts)
const PAWN = 0, KNIGHT = 1, BISHOP = 2, ROOK = 3, QUEEN = 4, KING = 5;
const CO_ROLE = { [KNIGHT]: "knight", [BISHOP]: "bishop", [ROOK]: "rook", [QUEEN]: "queen" };

// Chess960 / X-FEN samples: SP000 (bbqnnrkr, rooks a/h), standard SP518,
// and a Shredder-castling sample (rooks d/h → D/H files).
const CHESS960_SAMPLES = [
  "bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w HAha - 0 1",
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "bbnrkqnr/pppppppp/8/8/8/8/PPPPPPPP/BBNRKQNR w DHdh - 0 1",
];

/** No-op: the ADR-013 bake-off converged both representations
 * (king-captures-rook everywhere — ADR-013 as amended, change
 * purechess-gates-green), so dests/UCI compare byte-for-byte. */
function normDestCo(_pos, _from, to) {
  return to;
}

/** No-op for the same reason (makeUci now emits e1h1 exactly like chessops). */
function normUciCo(_pos, _move, uci) {
  return uci;
}

function fenFromFile(line) {
  return line.split(" c9 ")[0].trim();
}

/**
 * Builds the FEN corpus: unique positions replayed from real games (gigachess
 * SAN replay) + samplefen1000.epd + perftsuite.epd FENs + Chess960 samples.
 */
function buildFenCorpus(games, target, quick) {
  const seen = new Set();
  const fens = [];

  const add = (fen, force) => {
    if (!seen.has(fen) && (force || fens.length < target)) {
      seen.add(fen);
      fens.push(fen);
    }
    return fens.length >= target;
  };

  // Real-game replayed positions
  for (const game of games) {
    const m = game.match(/\[FEN "([^"]+)"\]/);
    const startFen = m ? m[1] : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    let r = pcParseFen(startFen);
    if (!r.ok) continue;
    let pos = { ...r.value, halfmove: r.value.halfmoves ?? 0, fullmove: r.value.fullmoves ?? 1 };
    if (add(pcMakeFen(pos))) break;
    const tree = pcParsePgn(game);
    if (!tree || !tree.ok) continue;
    for (const mv of tree.value.moves) {
      const parsed = pcParseSan(mv.san, pos);
      if (!parsed.ok) break; // illegal/unsupported in replay → stop this game
      pos = pcMakeMove(pos, parsed.value);
      if (add(pcMakeFen(pos))) break;
    }
  }

  // samplefen1000.epd (MIT, Chess4j) — real-game positions
  try {
    const abs = assertCorpus(CORPORA.samplefen1000);
    for (const line of readFileSync(abs, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      add(fenFromFile(line));
    }
  } catch {
    console.log("  note: samplefen1000.epd unavailable — corpus from games only");
  }

  // perftsuite.epd FENs
  try {
    const abs = assertCorpus(CORPORA.perftsuite);
    for (const line of readFileSync(abs, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      add(line.split(";")[0].trim());
    }
  } catch {
    /* perftsuite asserted elsewhere too; ignore */
  }

  // Chess960 / X-FEN samples (always included, even beyond target)
  for (const fen of CHESS960_SAMPLES) add(fen, true);

  return fens;
}

export const name = "fen-san-uci";

export async function run(opts) {
  const o = { ...parseSuiteArgs(process.argv.slice(2)), ...opts };
  const target = o.positions ?? (o.quick ? 1200 : 10_000);
  const { games, source } = await loadLichessGames(o);
  const fens = buildFenCorpus(games, target, o.quick);

  console.log(`\n=== suite: fen-san-uci (${fens.length.toLocaleString()} FENs incl. ${CHESS960_SAMPLES.length} Chess960/X-FEN samples) ===`);
  console.log(`  corpus: ${source}${fens.length < target ? " (target not reached — small corpus)" : ""}`);

  // ---- Parity BEFORE throughput (≥99%, failures enumerated)
  const failures = [];
  let fenCompared = 0;
  const positions = [];

  for (const fen of fens) {
    const is960 = CHESS960_SAMPLES.includes(fen);
    const pcR = pcParseFen(fen, { chess960: is960 });
    const coS = coParseFen(fen);
    if (pcR.ok !== !coS.isErr) {
      failures.push(`${fen}: parse agreement broken (gigachess ok=${pcR.ok}, chessops ok=${!coS.isErr})`);
      continue;
    }
    if (!pcR.ok) continue; // both reject
    const pcSetup = pcR.value;
    const pcPos = { ...pcSetup, halfmove: pcSetup.halfmoves ?? 0, fullmove: pcSetup.fullmoves ?? 1 };
    const coPos = coChess.fromSetup(coS.value).unwrap();
    fenCompared++;

    // FEN parse→make round-trip: byte-identical between libs
    const pcFen = pcMakeFen(pcSetup, { chess960: is960 });
    const coFen = coMakeFen(coS.value);
    if (pcFen !== coFen) failures.push(`${fen}: makeFen differs | gigachess: ${pcFen} | chessops: ${coFen}`);

    positions.push({ fen, pcPos, coPos, is960, pcSetup, coSetup: coS.value });
  }
  const fenDiff = failures.filter((f) => f.includes("makeFen differs")).length;
  console.log(`  FEN round-trip: ${fenCompared} compared, makeFen byte-identical (failures: ${fenDiff})`);

  // SAN/UCI phase runs on the parsed positions (parse-rejected FENs are
  // excluded — they are already enumerated as parse-agreement failures).
  const sanSubset = positions.slice(0, o.quick ? 300 : 3000);
  return await sanUciPhase({ fens, sanSubset, positions, failures });
}

export async function sanUciPhase(ctx) {
  const { fens, sanSubset, positions, failures } = ctx;
  let sanMakeTotal = 0, sanMakeSame = 0;
  let sanParseTotal = 0, sanParseSame = 0;
  let uciTotal = 0, uciSame = 0;
  let shown = { sanDiff: 0, sanParse: 0, uci: 0 }; // per-category detail caps
  const show = (kind, msg) => {
    if (shown[kind] < 10) { failures.push(msg); shown[kind]++; }
  };

  for (const { fen, pcPos, coPos } of sanSubset) {
    let pcDests, coDests;
    try {
      pcDests = pcAllDests(pcPos);
      coDests = coPos.allDests();
    } catch (e) {
      failures.push(`${fen}: allDests threw: ${e.message}`);
      continue;
    }
    for (const [from, set] of pcDests) {
      const piece = pcPieceAtRole(pcPos, from);
      const coSet = coDests.get(from);
      for (const to of sqIter(set)) {
        const promos = piece === PAWN && (to < 8 || to >= 56) ? [QUEEN, ROOK, BISHOP, KNIGHT] : [undefined];
        for (const promo of promos) {
          const pcMove = { from, to, promotion: promo };
          // gigachess-normalized castling dest (g/c) → chessops rook-square dest
          let coTo = to;
          if (piece === KING && coSet && !coSet.has(to)) {
            const rankBase = to & ~7;
            const alt = (to & 7) === 6 ? rankBase | 7 : rankBase | 0;
            if (coSet.has(alt)) coTo = alt;
          }
          const coMove = { from, to: coTo, promotion: promo !== undefined ? CO_ROLE[promo] : undefined };
          sanMakeTotal++;
          let pcSan, coSan;
          try {
            pcSan = pcMakeSan(pcMove, pcPos);
            coSan = coMakeSan(coPos, coMove);
          } catch (e) {
            failures.push(`${fen}: makeSan threw: ${e.message} (${from}-${to})`);
            continue;
          }
          if (pcSan !== coSan) {
            show("sanDiff", `${fen}: SAN differs ${from}-${to}: gigachess "${pcSan}" vs chessops "${coSan}"`);
            continue;
          }
          sanMakeSame++;

          sanParseTotal++;
          const pcParsed = pcParseSan(pcSan, pcPos);
          const coParsed = coParseSan(coPos, pcSan);
          const pcTo = pcParsed.ok && pcParsed.value && typeof pcParsed.value === "object" ? pcParsed.value.to : undefined;
          const coToN = coParsed ? normDestCo(coPos, coParsed.from ?? coMove.from, coParsed.to) : undefined;
          if (pcTo === coToN) sanParseSame++;
          else show("sanParse", `${fen}: SAN parse "${pcSan}" resolves differently: gigachess=${pcTo} chessops=${coToN}`);

          uciTotal++;
          const pcUci = pcMakeUci(pcMove);
          const coUci = normUciCo(coPos, coMove, coMakeUci(coMove));
          if (pcUci === coUci) uciSame++;
          else show("uci", `${fen}: UCI differs for ${pcSan}: gigachess=${pcUci} chessops(norm)=${coUci}`);
        }
      }
    }
  }

  const sanParity = sanMakeTotal ? sanMakeSame / sanMakeTotal : 1;
  const sanParseParity = sanParseTotal ? sanParseSame / sanParseTotal : 1;
  const uciParity = uciTotal ? uciSame / uciTotal : 1;
  const fenDiff = failures.filter((f) => f.includes("makeFen differs")).length;
  const parseAgree = failures.filter((f) => f.includes("parse agreement broken")).length;
  const fenParity = fens.length ? (fens.length - fenDiff - parseAgree) / fens.length : 1;
  console.log(`  SAN make: ${sanMakeSame}/${sanMakeTotal} identical | SAN parse: ${sanParseSame}/${sanParseTotal} | UCI (ADR-013 normalized): ${uciSame}/${uciTotal}`);
  console.log(`  parse agreement: ${fens.length - parseAgree}/${fens.length} (gigachess rejects ${parseAgree} FENs chessops accepts)`);
  for (const f of failures) {
    if (f.includes("SAN differs") || f.includes("resolves differently") || f.includes("UCI differs")) console.log(`    ${f}`);
  }
  const fenExamples = failures.filter((f) => f.includes("makeFen differs") || f.includes("parse agreement broken")).slice(0, 8);
  fenExamples.forEach((f) => console.log(`    ${f}`));
  const totalListed = failures.length;
  if (totalListed > fenExamples.length + shown.sanDiff + shown.sanParse + shown.uci) {
    console.log(`    … ${totalListed} failures recorded in total (see --json for the full list)`);
  }

  // ---- Throughput
  const fenWorkPc = () => {
    let n = 0;
    for (const fen of fens) {
      const is960 = CHESS960_SAMPLES.includes(fen);
      const r = pcParseFen(fen, { chess960: is960 });
      if (r.ok) { pcMakeFen(r.value, { chess960: is960 }); n++; }
    }
    return n;
  };
  const fenWorkCo = () => {
    let n = 0;
    for (const fen of fens) {
      const s = coParseFen(fen);
      if (!s.isErr) { coMakeFen(s.value); n++; }
    }
    return n;
  };
  const pcM = measure(fenWorkPc);
  const coM = measure(fenWorkCo);
  const pcFps = thr(fens.length, pcM.median);
  const coFps = thr(fens.length, coM.median);
  const fenRatio = pcFps / coFps;
  console.log(`  FEN parse+make throughput: gigachess ${Math.round(pcFps).toLocaleString()}/s vs chessops ${Math.round(coFps).toLocaleString()}/s → ${(fenRatio * 100 - 100).toFixed(1)}% (median of 20, 3 warmups excluded)`);

  const gates = [
    gate(
      "fen-san-uci parity ≥99% with failures enumerated",
      sanParity >= 0.99 && sanParseParity >= 0.99 && uciParity >= 0.99 && fenParity >= 0.99,
      "≥99% each (FEN/SAN make/SAN parse/UCI)",
      `FEN ${(fenParity * 100).toFixed(2)}%, SAN ${(sanParity * 100).toFixed(2)}%, parse ${(sanParseParity * 100).toFixed(2)}%, UCI ${(uciParity * 100).toFixed(2)}%`
    ),
    gate("FEN parse+make ≥20% faster than chessops", fenRatio >= 1.2, "≥1.20x", `${fenRatio.toFixed(3)}x`),
  ];
  return { metrics: { fens: fens.length, sanMakeSame, sanMakeTotal, pcFps, coFps, fenRatio }, gates };
}

function pcPieceAtRole(pos, sq) {
  const p = pcPieceAt(pos.board, sq);
  return p ? p.role : undefined;
}
