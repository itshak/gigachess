// bench/suites/dests-terminal.mjs — dests/legal/terminal parity on real games
// (task 2.5). Replays 10k positions from real games and compares allDests
// (castling normalized per ADR-013), isLegal, and terminal predicates
// (isCheck/isCheckmate/isStalemate/isInsufficientMaterial) against chessops.
// 100% parity is required; speed numbers are only reported at 100% parity.
import { gate, loadLichessGames, measure, parseSuiteArgs, thr } from "./lib/common.mjs";
import {
  parseFen as pcParseFen,
  makeFen as pcMakeFen,
} from "../../dist/fen.js";
import { parseSan as pcParseSan } from "../../dist/san.js";
import { parsePgn as pcParsePgn } from "../../dist/pgn.js";
import {
  allDests as pcAllDests,
  isCheck as pcIsCheck,
  isCheckmate as pcIsCheckmate,
  isStalemate as pcIsStalemate,
  isInsufficientMaterial as pcIsInsufficient,
  makeMove as pcMakeMove,
  pieceAt as pcPieceAt,
  iter as sqIter,
} from "../../dist/index.js";
import { isLegal as pcIsLegal } from "../../dist/chess.js";

import { Chess as coChess } from "chessops/chess";
import { parseFen as coParseFen } from "chessops/fen";

const QUEEN = 4;
const CO_ROLE = { 1: "knight", 2: "bishop", 3: "rook", 4: "queen" };

/** Normalizes a chessops dest (king→own-rook) to the landing square (ADR-013). */
function normDestCo(coPos, from, to) {
  const piece = coPos.board.get(from);
  if (!piece || piece.role !== "king") return to;
  if (!coPos.board.pieces(piece.color, "rook").has(to)) return to;
  const rank = from >> 3;
  return ((to & 7) > (from & 7) ? (rank << 3) | 6 : (rank << 3) | 2);
}

function isPawnFrom(pos, from) {
  const p = pcPieceAt(pos.board, from);
  return !!p && p.role === 0; // Role.Pawn
}

/** Replays games with purechess, collecting up to `target` unique positions. */
function collectPositions(games, target) {
  const seen = new Set();
  const positions = [];
  outer: for (const game of games) {
    const m = game.match(/\[FEN "([^"]+)"\]/);
    const startFen = m ? m[1] : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const r = pcParseFen(startFen);
    if (!r.ok) continue;
    let pos = { ...r.value, halfmove: r.value.halfmoves ?? 0, fullmove: r.value.fullmoves ?? 1 };
    const key = pcMakeFen(pos);
    if (!seen.has(key)) {
      seen.add(key);
      positions.push({ key, pos });
      if (positions.length >= target) break outer;
    }
    const tree = pcParsePgn(game);
    if (!tree || !tree.ok) continue;
    for (const mv of tree.value.moves) {
      const parsed = pcParseSan(mv.san, pos);
      if (!parsed.ok) break; // illegal/unsupported → stop replaying this game
      pos = pcMakeMove(pos, parsed.value);
      const k = pcMakeFen(pos);
      if (!seen.has(k)) {
        seen.add(k);
        positions.push({ key: k, pos });
        if (positions.length >= target) break outer;
      }
    }
  }
  return positions;
}

export const name = "dests-terminal";

export async function run(opts) {
  const o = { ...parseSuiteArgs(process.argv.slice(2)), ...opts };
  const target = o.positions ?? (o.quick ? 1200 : 10_000);
  const { games, source } = await loadLichessGames(o);

  console.log(`\n=== suite: dests-terminal (target ${target.toLocaleString()} unique positions from real games) ===`);
  console.log(`  corpus: ${source}`);
  const positions = collectPositions(games, target);
  console.log(`  replayed ${positions.length.toLocaleString()} unique positions`);

  // ---- Parity: 100% required
  const failures = [];
  let destMoves = 0;
  const prepared = [];
  for (const { key, pos } of positions) {
    const coS = coParseFen(key);
    if (coS.isErr) {
      failures.push(`${key}: chessops could not parse purechess makeFen output`);
      continue;
    }
    const coPos = coChess.fromSetup(coS.value).unwrap();
    prepared.push({ key, pos, coPos });

    const pcD = pcAllDests(pos);
    const coD = coPos.allDests();
    const froms = new Set([...pcD.keys(), ...coD.keys()]);
    for (const from of froms) {
      const pcSet = pcD.get(from);
      const coSet = coD.get(from);
      const pcTos = new Set(pcSet ? [...sqIter(pcSet)].map(Number) : []);
      const coTos = new Set();
      if (coSet) for (const to of coSet) coTos.add(normDestCo(coPos, from, to));
      for (const to of pcTos) if (!coTos.has(to)) failures.push(`${key}: dest ${from}-${to} only in purechess`);
      for (const to of coTos) if (!pcTos.has(to)) failures.push(`${key}: dest ${from}-${to} only in chessops`);
      destMoves += pcTos.size;

      // isLegal agreement per move (promotions expanded, castling un-normalized for chessops)
      const pawn = isPawnFrom(pos, from);
      for (const to of pcTos) {
        const promos = pawn && (to < 8 || to >= 56) ? [QUEEN, 3, 2, 1] : [undefined];
        for (const promo of promos) {
          const pcLegal = pcIsLegal(pos, { from, to, promotion: promo });
          let coLegal = false;
          try {
            let coTo = to;
            if (coSet && !coSet.has(to)) {
              const rankBase = to & ~7;
              const alt = (to & 7) === 6 ? rankBase | 7 : rankBase | 0;
              if (coSet.has(alt)) coTo = alt;
            }
            coLegal = coPos.isLegal({ from, to: coTo, promotion: promo !== undefined ? CO_ROLE[promo] : undefined });
          } catch {
            coLegal = false;
          }
          if (pcLegal !== coLegal) {
            failures.push(`${key}: isLegal ${from}-${to}${promo !== undefined ? "=" + promo : ""} purechess=${pcLegal} chessops=${coLegal}`);
          }
        }
      }
    }

    // terminal predicates
    const terms = [
      ["isCheck", pcIsCheck(pos), coPos.isCheck()],
      ["isCheckmate", pcIsCheckmate(pos), coPos.isCheckmate()],
      ["isStalemate", pcIsStalemate(pos), coPos.isStalemate()],
      ["isInsufficientMaterial", pcIsInsufficient(pos), coPos.isInsufficientMaterial()],
    ];
    for (const [tname, pcV, coV] of terms) {
      if (pcV !== coV) failures.push(`${key}: ${tname} purechess=${pcV} chessops=${coV}`);
    }
  }

  if (failures.length) {
    console.log(`  parity: FAIL — ${failures.length} mismatches over ${prepared.length} positions`);
    failures.slice(0, 15).forEach((f) => console.log(`    ${f}`));
    if (failures.length > 15) console.log(`    … +${failures.length - 15} more`);
    return {
      metrics: {},
      gates: [gate("dests/legal/terminal 100% parity on real-game positions", false, "0 mismatches", `${failures.length} mismatches`)],
    };
  }
  console.log(`  parity: 100% — dests, isLegal, and all terminal predicates identical across ${prepared.length} positions (${destMoves.toLocaleString()} moves)`);

  // ---- Throughput (dests) — only reported at 100% parity (no numeric gate in spec)
  const runPc = () => {
    let n = 0;
    for (const p of prepared) n += pcAllDests(p.pos).size;
    return n;
  };
  const runCo = () => {
    let n = 0;
    for (const p of prepared) {
      for (const [, d] of p.coPos.allDests()) n += d.size();
    }
    return n;
  };
  const pcM = measure(runPc);
  const coM = measure(runCo);
  const pcDps = thr(prepared.length, pcM.median);
  const coDps = thr(prepared.length, coM.median);
  console.log(`  dests throughput (allDests per position): purechess ${Math.round(pcDps).toLocaleString()}/s vs chessops ${Math.round(coDps).toLocaleString()}/s → ${(pcDps / coDps * 100 - 100).toFixed(1)}% (median of 20, 3 warmups excluded)`);

  const gates = [
    gate("dests/legal/terminal 100% parity on real-game positions", true, "0 mismatches", `0 mismatches over ${prepared.length} positions / ${destMoves.toLocaleString()} moves`),
  ];
  return { metrics: { positions: prepared.length, destMoves, pcDps, coDps }, gates };
}
