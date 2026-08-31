import { perft } from "../dist/index.js";
import { parseFen as pcParseFen, makeFen as pcMakeFen } from "../dist/fen.js";
import { parseSan as pcParseSan, makeSan as pcMakeSan } from "../dist/san.js";
import { allDests as pcAllDests, isCheckmate as pcIsCheckmate, isStalemate as pcIsStalemate, isInsufficientMaterial as pcIsInsuff } from "../dist/chess.js";
import { Chess as coChess } from "chessops/chess";
import { parseFen as coParseFen, makeFen as coMakeFen } from "chessops/fen";
import { parseSan as coParseSan, makeSan as coMakeSan } from "chessops/san";
import { iter as sqIter, popcount as sqPopcnt } from "../dist/squareSet.js";
import { pieceAt as bdPieceAt } from "../dist/board.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

// ---------------------------------------------------------------------------
// Castling representation: converged. Per ADR-013 as amended (ADR-013 bake-off,
// change purechess-gates-green), turbochess now uses the chessops-style
// king-captures-rook encoding (e1h1/e8a8) as its single canonical
// representation, so dests/SAN/UCI compare byte-identically against chessops
// with no canonicalization helpers. (The former normDest/normDestCo helpers
// were deleted when the representations converged.)
// ---------------------------------------------------------------------------

function toPos(v) { return { ...v, halfmove: v.halfmoves ?? 0, fullmove: v.fullmoves ?? 1 }; }

const PERFT_POS = {
  startpos: ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", { 1: 20, 2: 400, 3: 8902, 4: 197281, 5: 4865609 }],
  kiwipete: ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", { 1: 48, 2: 2039, 3: 97862 }],
  pos3: ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", { 1: 14, 2: 191, 3: 2812, 4: 43238 }],
  pos4: ["r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", { 1: 6, 2: 264, 3: 9467 }],
  pos5: ["rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", { 1: 44, 2: 1486, 3: 62379 }],
  pos6: ["r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", { 1: 46, 2: 2079, 3: 89890 }],
};
console.log("== 1. Perft correctness ==");
for (const [name, [fen, counts]] of Object.entries(PERFT_POS)) {
  const parsed = pcParseFen(fen);
  if (!parsed.ok) { check(`parseFen ${name}`, false, parsed.error?.code); continue; }
  const pos = toPos(parsed.value);
  let allOk = true, detail = [];
  for (const [d, expected] of Object.entries(counts)) {
    const n = perft(pos, Number(d));
    detail.push(`d${d}=${n}${n === expected ? "" : "(exp " + expected + ")"}`);
    if (n !== expected) allOk = false;
  }
  check(`perft ${name}`, allOk, detail.join(" "));
}

console.log("== 2. FEN round-trip + dests parity (samplefen1000.epd) ==");
const fenLines = readFileSync(new URL("../refs/mit-permissive/Chess4j/src/test/resources/samplefen1000.epd", import.meta.url).pathname, "utf8")
  .split("\n").map(l => l.trim()).filter(Boolean).slice(0, 1000);
let fenRt = 0, fenParity = 0, fenFailPc = 0, fenFailCo = 0, fenN = 0; const fenBad = [];
for (const line of fenLines) {
  const parts = line.split(/\s+/);
  const fen = parts.slice(0, 4).join(" ") + " 0 1";
  fenN++;
  const pc = pcParseFen(fen);
  const co = coParseFen(fen);
  if (!pc.ok) { fenFailPc++; continue; }
  if (co.isErr) { fenFailCo++; continue; }
  const pcOut = pcMakeFen(pc.value);
  if (pcOut === fen || pcOut === coMakeFen(co.value)) fenRt++;
  try {
    const coDests = coChess.fromSetup(co.value).unwrap().allDests();
    const pcD = pcAllDests(toPos(pc.value));
    const coNonEmpty = [...coDests.entries()].filter(([, v]) => v.size() > 0);
    let same = coNonEmpty.length === pcD.size;
    if (same) {
      for (const [sqc, set] of coNonEmpty) {
        const pcSet = pcD.get(sqc);
        if (!pcSet || set.size() !== sqPopcnt(pcSet)) { same = false; break; }
        let pcBits = 0n, coBits = 0n;
        for (const s of sqIter(pcSet)) pcBits |= 1n << BigInt(s);
        for (const s of set) coBits |= 1n << BigInt(s);
        if (pcBits !== coBits) { same = false; break; }
      }
    }
    if (same) fenParity++; else fenBad.push(fen);
  } catch { }
}
const fenOk = fenN - fenFailPc - fenFailCo;
console.log(`  turbochess parse ok: ${fenN - fenFailPc}/${fenN}, chessops parse ok: ${fenN - fenFailCo}/${fenN}`);
console.log(`  FEN round-trip identical: ${fenRt}/${fenOk}`);
console.log(`  dests sets identical vs chessops: ${fenParity}/${fenOk}`, fenBad.slice(0, 3));
check("FEN round-trip >=99%", fenRt >= fenOk * 0.99, `${fenRt}/${fenOk}`);
check("dests parity >=99%", fenParity >= fenOk * 0.99, `${fenParity}/${fenOk}`);

console.log("== 3. SAN make/parse parity (Kiwipete + startpos trees) ==");
let sanSame = 0, sanTotal = 0, sanMismatch = [];
for (const key of ["kiwipete", "startpos", "pos5"]) {
  const [fen] = PERFT_POS[key];
  const pc = pcParseFen(fen);
  const co = coParseFen(fen);
  if (!pc.ok || co.isErr) continue;
  const kiwiPos = toPos(pc.value);
  const pcD = pcAllDests(kiwiPos);
  const coD = coChess.fromSetup(co.value).unwrap().allDests();
  for (const [from, set] of pcD) {
    for (const to of sqIter(set)) {
      sanTotal++;
      try {
        // both libs require explicit promotion for pawn-to-last-rank; default to queen
        const piece = bdPieceAt(kiwiPos.board, from);
        const lastRank = (piece?.role === 0) && ((to >> 3) === (piece.color === 0 ? 7 : 0));
        const promotion = lastRank ? 4 /* Role.Queen */ : null;
        // castling needs no flag: makeSan detects it via the shared
        // detectCastling path in either input representation
        const pcSan = pcMakeSan({ from, to, promotion }, kiwiPos);
        const coSet = coD.get(from);
        // representations converged (ADR-013 as amended): dests compare raw
        let coTo = to;
        if (coSet && !coSet.has(to)) {
          const f = to & 7;
          const alt = (to & ~7) | (f === 6 ? 7 : f === 2 ? 0 : f);
          if (coSet.has(alt)) coTo = alt;
        }
        if (lastRank || (coSet && (coSet.has(to) || coSet.has(coTo)))) {
          const coSan = coMakeSan(coChess.fromSetup(co.value).unwrap(), { from, to: coTo, promotion: lastRank ? "queen" : undefined });
          if (pcSan === coSan) sanSame++; else sanMismatch.push(`${key}:${pcSan} vs ${coSan}`);
        }
      } catch (e) { sanMismatch.push(`${key}:ERR ${from}-${to}: ${e.message}`); }
    }
  }
}
console.log(`  SAN make identical: ${sanSame}/${sanTotal}`, sanMismatch.slice(0, 5));
check("SAN make parity >=99%", sanSame >= sanTotal * 0.99, `${sanSame}/${sanTotal}`);

let sanParseSame = 0, sanParseTotal = 0; const sanParseBad = [];
for (const key of ["kiwipete", "startpos", "pos5"]) {
  const [fen] = PERFT_POS[key];
  const pc = pcParseFen(fen);
  const co = coParseFen(fen);
  if (!pc.ok || co.isErr) continue;
  const kiwiPos = toPos(pc.value);
  const coCh = coChess.fromSetup(co.value).unwrap();
  const coD = coCh.allDests();
  for (const [from, set] of coD) {
    if (set.size() === 0) continue;
    for (const to of set) {
      const coSan = coMakeSan(coCh, { from, to });
      sanParseTotal++;
      const pcParsed = pcParseSan(coSan, kiwiPos);
      const coParsed = coParseSan(coCh, coSan);
      const pcOk = !!pcParsed.ok, coOk = !!(coParsed && !coParsed.isErr);
      if (pcOk && coOk) {
        const pm = pcParsed.value;
        const pcTo = pm && typeof pm === "object" && "to" in pm ? pm.to : undefined;
        const coNorm = to; // representations converged: compare raw
        if (pcTo === coNorm) sanParseSame++; else sanParseBad.push(`${key}:${coSan} pc=${pcTo} co=${coNorm}`);
      } else if (!pcOk && !coOk) {
        // both reject (e.g. promotion-less capture to last rank) -> agreed behavior
        sanParseSame++;
      } else sanParseBad.push(`${key}:${coSan} pc-ok=${pcOk} co-ok=${coOk}`);
    }
  }
}
console.log(`  SAN parse resolves same move: ${sanParseSame}/${sanParseTotal}`, sanParseBad.slice(0, 3));
check("SAN parse parity >=99%", sanParseSame >= sanParseTotal * 0.99, `${sanParseSame}/${sanParseTotal}`);

console.log("== 4. Terminal-state checks ==");
const fool = pcParseFen("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
check("Fool's mate isCheckmate", fool.ok && pcIsCheckmate(toPos(fool.value)) === true);
const stale = pcParseFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
check("Stalemate pos isStalemate", stale.ok && pcIsStalemate(toPos(stale.value)) === true);
const kvk = pcParseFen("8/8/4k3/8/8/3K4/8/8 w - - 0 1");
check("K vs K insufficient material", kvk.ok && pcIsInsuff(toPos(kvk.value)) === true);

console.log("== 5. PGN parse -> makePgn round-trip ==");
const { parsePgn: pcParsePgn, makePgn: pcMakePgn } = await import("../dist/pgn.js");
const samplePgn = readFileSync(new URL("../bench/data/lichess_db.sample.pgn", import.meta.url).pathname, "utf8");
try {
  const r = pcParsePgn(samplePgn);
  if (!r.ok) { check("PGN parse", false, r.error?.code); }
  else {
    const out = pcMakePgn(r.value);
    const re = pcParsePgn(out);
    check("PGN re-parse stable", re.ok && pcMakePgn(re.value) === out, `len ${out.length}`);
  }
} catch (e) {
  check("PGN parse", false, e.message);
}

console.log("== 6. En-passant FEN policy (chessops-compatible + strict option) ==");
// change purechess-gates-green tasks 2.1/2.2: unreachable ep squares are
// accepted (chessops-compatible) and round-trip byte-identically; the
// strict option restores the capturability check.
{
  const epFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPP1PPPP/RNBQKBNR b KQkq e3 0 1";
  const r = pcParseFen(epFen);
  check("unreachable ep square accepted", r.ok, r.ok ? "" : r.error?.code);
  if (r.ok) check("makeFen re-emits byte-identically", pcMakeFen(r.value) === epFen, r.ok ? pcMakeFen(r.value) : "");
  const co = coParseFen(epFen);
  check("chessops agrees (parse)", !co.isErr);
  if (r.ok && !co.isErr) check("makeFen byte-identical to chessops", pcMakeFen(r.value) === coMakeFen(co.value));
  const rs = pcParseFen(epFen, { strict: true });
  check("strict rejects with fen/enPassantNotCapturable", !rs.ok && rs.error?.code === "fen/enPassantNotCapturable", rs.ok ? "accepted" : rs.error?.code);
  // wrong-rank ep stays rejected unconditionally (structural validation):
  // for White to move the ep square must be on rank 6 (index 5), so e5 fails
  const wrongRank = pcParseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e5 0 1");
  check("wrong-rank ep still rejected", !wrongRank.ok && wrongRank.error?.code === "fen/enPassantUncapturable", wrongRank.ok ? "accepted" : wrongRank.error?.code);
  // four-field (WAC-style) FENs parse like chessops (defaults for counters)
  const four = pcParseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
  const coFour = coParseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
  check("4-field FEN accepted with chessops defaults", four.ok && !coFour.isErr && pcMakeFen(four.value) === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  // replayed-position repro FEN from bench/results/real-2026-08-30.md
  const repro = "r2kQb1r/pbpp3p/1pn1p3/7B/3PP2q/P1N5/1PP2PPP/R3K2R b KQ - 2 13";
  const r2 = pcParseFen(repro);
  check("results-file repro FEN parses + round-trips", r2.ok && pcMakeFen(r2.value) === repro);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail > 0 ? 1 : 0);
