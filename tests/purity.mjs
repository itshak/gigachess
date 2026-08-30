// tests/purity.mjs — runtime verification of the FP/immutability contract:
// public ops take a Position and never mutate it (observable purity), even
// when the input is deep-frozen (any accidental in-place write throws in
// strict-mode ESM because assignment to a frozen object throws).
import { parseFen } from "../dist/fen.js";
import { makeFen } from "../dist/fen.js";
import { allDests, dests, isLegal, makeMove, isCheck, isCheckmate, isStalemate, perft } from "../dist/chess.js";
import { makeSan } from "../dist/san.js";

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; } else { fail++; console.error(`FAIL: ${name}`); }
}

// deterministic deep serialization (handles Sets and Maps)
function deepStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (v instanceof Set) return `Set{${[...v].sort((a, b) => a - b).join(",")}}`;
  if (v instanceof Map) {
    const keys = [...v.keys()].sort((a, b) => a - b);
    return `Map{${keys.map((k) => `${k}:${deepStringify(v.get(k))}`).join(";")}}`;
  }
  if (Array.isArray(v)) return `[${v.map(deepStringify).join(",")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${k}:${deepStringify(v[k])}`).join(",")}}`;
}

// deep-freeze plain objects/arrays; Sets/Maps are covered by snapshot compare
function deepFreeze(v, seen = new Set()) {
  if (v === null || typeof v !== "object" || seen.has(v)) return v;
  seen.add(v);
  if (v instanceof Set || v instanceof Map) return v;
  Object.freeze(v);
  for (const k of Object.keys(v)) deepFreeze(v[k], seen);
  if (Array.isArray(v)) v.forEach((e) => deepFreeze(e, seen));
  return v;
}

import { iter as sqIter } from "../dist/squareSet.js";

function firstLegalMove(pos) {
  for (const [from, ds] of allDests(pos)) {
    for (const to of sqIter(ds)) {
      const mv = { from, to, promotion: null, isPromotion: false, isEnPassant: false, isCastling: false };
      if (isLegal(pos, mv)) return mv;
    }
  }
  return null;
}

const FENS = [
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", // startpos
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", // kiwipete
  "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", // ep pins
  "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", // promotions
];

for (const fen of FENS) {
  const label = fen.split(" ").slice(0, 2).join(" ");
  const parsed = parseFen(fen);
  check(`${label}: parsed ok`, parsed.ok === true);
  if (!parsed.ok) continue;
  const pos = parsed.value;

  // freeze every plain object (Position, Board, SquareSets) — any in-place
  // mutation inside an op now throws instead of silently corrupting input
  deepFreeze(pos);
  const before = deepStringify(pos);

  // read ops
  const ds = allDests(pos);
  check(`${label}: allDests non-empty`, ds.size > 0);
  for (const [from, set] of ds) check(`${label}: dests(from) parity`, deepStringify(dests(pos, from)) === deepStringify(set));
  check(`${label}: isCheck boolean`, typeof isCheck(pos) === "boolean");
  perft(pos, 2);

  // write op: playMove must return a NEW position and leave input untouched
  const mv = firstLegalMove(pos);
  check(`${label}: legal move exists`, mv !== null);
  if (mv) {
    const san = makeSan(mv, pos);
    check(`${label}: makeSan string`, typeof san === "string" && san.length > 0);
    const next = makeMove(pos, mv);
    check(`${label}: makeMove returns new object`, next !== pos);
    check(`${label}: makeMove advances turn`, next.turn !== pos.turn);
    check(`${label}: input unmodified after ops`, deepStringify(pos) === before);
    // result must round-trip through FEN and differ from input
    check(`${label}: result fen differs`, makeFen(next) !== makeFen(pos));
  }
}

console.log(`purity: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
