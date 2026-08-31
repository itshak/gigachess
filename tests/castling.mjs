// tests/castling.mjs — castling correctness regression tests (task 1.3 of
// change purechess-gates-green). Covers the two minimal repros from
// bench/results/real-2026-08-30.md plus SAN/UCI/legality contracts of the
// unified detectCastling path (ADR-013 as amended).
import { parseFen, makeFen } from "../dist/fen.js";
import { makeMove, allDests, perft, detectCastling, isCheckmate } from "../dist/index.js";
import { isLegal } from "../dist/chess.js";
import { parseSan, makeSan } from "../dist/san.js";
import { iter as sqIter } from "../dist/squareSet.js";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
const toPos = (v) => ({ ...v, halfmove: v.halfmoves ?? 0, fullmove: v.fullmoves ?? 1 });

console.log("== Castling: minimal repros (real-2026-08-30) ==");

// Repro 1: makeMove with the canonical castling move must complete the rook
// relocation (the old defect moved only the king: `r1k4r/…`).
{
  const pos = toPos(parseFen("r3k2r/8/8/8/8/8/8/3K4 b kq - 1 1").value);
  const q = makeMove(pos, { from: 60, to: 58 }); // e8c8 (normalized landing input)
  check("queenside makeMove → 2kr3r (rook on d8)", makeFen(q) === "2kr3r/8/8/8/8/8/8/3K4 w - - 2 2", makeFen(q));
  const k = makeMove(pos, { from: 60, to: 62 }); // e8g8
  check("kingside makeMove → r4rk1 (rook on f8)", makeFen(k) === "r4rk1/8/8/8/8/8/8/3K4 w - - 2 2", makeFen(k));
  // chessops-style king-captures-rook input (e8a8 / e8h8) applies identically
  const q2 = makeMove(pos, { from: 60, to: 56 });
  check("e8a8 input → 2kr3r", makeFen(q2) === "2kr3r/8/8/8/8/8/8/3K4 w - - 2 2", makeFen(q2));
  const k2 = makeMove(pos, { from: 60, to: 63 });
  check("e8h8 input → r4rk1", makeFen(k2) === "r4rk1/8/8/8/8/8/8/3K4 w - - 2 2", makeFen(k2));
}

// Repro 2: makeSan of a canonical castling move renders O-O (never Kg1/Kxh1),
// even without the isCastling flag.
{
  const pos = toPos(parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1").value);
  check("makeSan {e1,g1} === O-O", makeSan({ from: 4, to: 6 }, pos) === "O-O", makeSan({ from: 4, to: 6 }, pos));
  check("makeSan {e1,c1} === O-O-O", makeSan({ from: 4, to: 2 }, pos) === "O-O-O", makeSan({ from: 4, to: 2 }, pos));
  check("makeSan {e1,h1} === O-O (rook input)", makeSan({ from: 4, to: 7 }, pos) === "O-O", makeSan({ from: 4, to: 7 }, pos));
  check("makeSan {e1,a1} === O-O-O (rook input)", makeSan({ from: 4, to: 0 }, pos) === "O-O-O", makeSan({ from: 4, to: 0 }, pos));
}

// Perft: castling-heavy corpus values (incl. Kiwipete d4 = 4,085,603 — the
// count the old double castling path got wrong as 4,085,607; also verified by
// PERFT_FULL=1 node tests/perft.mjs).
{
  const cases = [
    ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 4, 4085603],
    ["r3k2r/8/8/8/8/8/8/4K3 w kq - 0 1", 4, 22180],
    ["4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", 4, 17945],
    ["r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", 3, 13744],
  ];
  for (const [fen, d, expected] of cases) {
    const n = perft(toPos(parseFen(fen).value), d);
    check(`perft d${d} = ${expected}`, n === expected, `${fen} got ${n}`);
  }
}

// Castling legality contracts.
{
  const pos = toPos(parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1").value);
  const bits = new Set([...sqIter(allDests(pos).get(4))]);
  check("dests(e1) contains rook squares h1 and a1 (canonical rep)", bits.has(7) && bits.has(0), [...bits].join(","));
  check("dests(e1) does NOT contain g1/c1 (landing squares)", !bits.has(6) && !bits.has(2));
  check("isLegal e1h1", isLegal(pos, { from: 4, to: 7 }));
  check("isLegal e1a1", isLegal(pos, { from: 4, to: 0 }));
  check("isLegal e1g1 (normalized input tolerated)", isLegal(pos, { from: 4, to: 6 }));
  // play completes both relocations
  const after = makeMove(pos, { from: 4, to: 7 });
  check("play O-O → R4RK1 with white kq rights removed", makeFen(after) === "r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1", makeFen(after));
  // through-check castling rejected: bishop b4 attacks f1
  const through = toPos(parseFen("r3k2r/8/8/8/1b6/8/8/R3K2R w KQkq - 0 1").value);
  check("castling through check illegal (e1h1)", !isLegal(through, { from: 4, to: 7 }));
  check("dests(e1) omits h1 through check", !new Set([...sqIter(allDests(through).get(4))]).has(7));
  // detectCastling exposes the full plan
  const plan = detectCastling(pos, 4, 7);
  check("detectCastling plan: king 4→6 rook 7→5", !!plan && plan.kingTo === 6 && plan.rookFrom === 7 && plan.rookTo === 5);
  // a plain king step to g1/c1 is NOT castling (root cause of the old perft
  // defect: opponent rights misclassified normal king moves)
  const step = toPos(parseFen("r3k2r/8/8/8/8/8/8/4K3 w kq - 0 1").value);
  check("plain king move e1-d1 not castling", detectCastling(step, 4, 3) === null);
  const stepPos = toPos(parseFen("4k3/8/8/8/8/8/8/R4RK1 w KQ - 0 1").value);
  check("king step f1-g1 not castling even with rights present", detectCastling(stepPos, 5, 6) === null);
}

// SAN parse of O-O resolves to the canonical rook-square move.
{
  const pos = toPos(parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1").value);
  const r = parseSan("O-O", pos);
  check("parseSan O-O → {4,7}", r.ok && r.value.to === 7, r.ok ? `${r.value.from}-${r.value.to}` : r.error?.code);
  const r0 = parseSan("0-0", pos); // tolerant zero form
  check("parseSan 0-0 tolerant", r0.ok && r0.value.to === 7);
}

// Replayed-position defect (dests-terminal repro, design D4): the bogus
// 59-58 dest moving the opponent's queen must not be offered, and
// isCheckmate must agree with chessops (true).
{
  const fen = "r2kQb1r/pbpp3p/1pn1p3/7B/3PP2q/P1N5/1PP2PPP/R3K2R b KQ - 2 13";
  const pos = toPos(parseFen(fen).value);
  const m = allDests(pos);
  // every dest-set origin must be a black piece (59=d8 holds the WHITE queen)
  const b = pos.board.black;
  const allBlack = [...m.keys()].every((from) => (from < 32 ? ((b.lo >>> from) & 1) === 1 : ((b.hi >>> (from - 32)) & 1) === 1));
  check("allDests keys are all black pieces (no bogus 59-…)", allBlack, [...m.keys()].join(","));
  check("no dest 58 from d8 (opponent queen)", !m.has(59) || ![...sqIter(m.get(59))].includes(58));
  check("isCheckmate agrees with chessops (true)", isCheckmate(pos) === true);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail > 0 ? 1 : 0);

