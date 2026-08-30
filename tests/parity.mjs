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
// Documented deviation: castling dest representation.
// chessops represents castling as king-captures-rook (dest = rook square,
// e.g. e8h8 / e8a8). purechess follows the purechess-rules spec: castling
// dests are normalized to the king's landing square (G1/C1 style, e8g8/e8c8).
// The move set is semantically identical; we canonicalize both sides to the
// normalized representation before comparing.
// ---------------------------------------------------------------------------
function normDest(from, to, bd) {
  const piece = bdPieceAt(bd, from);
  if (!piece || piece.role !== 5 /* King */) return to;
  const rank = from >> 3;
  const file = to & 7;
  const rookSquares = [...sqIter(bd.rook)].map(Number);
  const isOwnRookSq = rookSquares.includes(to) && (bdPieceAt(bd, to)?.color === piece.color);
  if (!isOwnRookSq) return to;
  return (file > (from & 7)) ? (rank << 3) | 6 : (rank << 3) | 2; // g-file / c-file
}

// chessops-side canonicalization (chessops Board class API)
function normDestCo(from, to, coBoard) {
  const piece = coBoard.get(from);
  if (!piece || piece.role !== "king") return to;
  const rook = coBoard.pieces(piece.color, "rook");
  if (!rook.has(to)) return to;
  const rank = from >> 3;
  return ((to & 7) > (from & 7)) ? (rank << 3) | 6 : (rank << 3) | 2;
}

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
        for (const s of set) coBits |= 1n << BigInt(normDest(sqc, s, co.value.board));
        if (pcBits !== coBits) { same = false; break; }
      }
    }
    if (same) fenParity++; else fenBad.push(fen);
  } catch { }
}
const fenOk = fenN - fenFailPc - fenFailCo;
console.log(`  purechess parse ok: ${fenN - fenFailPc}/${fenN}, chessops parse ok: ${fenN - fenFailCo}/${fenN}`);
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
        // purechess makeSan expects the caller to flag castling (king two-square move)
        const isCastling = piece?.role === 5 /* King */ && Math.abs((to & 7) - (from & 7)) === 2;
        const pcSan = pcMakeSan({ from, to, promotion, isCastling }, kiwiPos);
        const coSet = coD.get(from);
        // map purechess g/c dest to chessops rook-square dest when needed
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
        const coNorm = normDestCo(from, to, co.value.board);
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

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail > 0 ? 1 : 0);
