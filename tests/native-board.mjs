// tests/native-board.mjs — Comprehensive tests for stateful native Board engine class
// Mirrors gigachess::Board in Rust (ADR-001, ADR-003, spec: gigachess-native-board).

import { Board, ensureZobristLoaded, packOf, INITIAL_FEN } from "../dist/index.js";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.error(`  FAIL ${name} ${extra}`); }
}

await ensureZobristLoaded();

console.log("== 1. Board instantiation & statics ==");
{
  const b1 = Board.startpos();
  check("startpos FEN matches initial FEN", b1.toFen() === INITIAL_FEN, b1.toFen());
  check("startpos turn is 0 (White)", b1.turn === 0);
  check("startpos fullmoves is 1", b1.fullmoves === 1);
  check("startpos inCheck is false", b1.inCheck() === false);

  const bEmpty = Board.empty();
  check("empty board occupied is 0", bEmpty.occupied.lo === 0 && bEmpty.occupied.hi === 0);

  const customFen = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
  const bCustom = Board.fromFen(customFen);
  check("fromFen matches input FEN", bCustom.toFen() === customFen);
}

console.log("== 2. Zero-allocation legal move generation ==");
{
  const b = Board.startpos();
  const buf = new Uint16Array(256);
  const moves = b.legalMoves(buf);
  check("startpos has 20 legal moves", moves.length === 20);

  const collected = [];
  b.forEachLegalMove((mv) => collected.push(mv));
  check("forEachLegalMove yields 20 moves", collected.length === 20);
  check("buffer matches forEachLegalMove elements", collected.every((m, idx) => m === buf[idx]));
}

console.log("== 3. in-place makeMove and unmakeMove round-trip ==");
{
  const b = Board.startpos();
  const startFen = b.toFen();
  const startHash = b.zobristHex();

  // 1. e4 (e2e4 -> 12 to 28)
  const e4 = b.parseSan("e4");
  check("parseSan('e4') resolves", e4 !== null && e4 !== undefined);
  const u1 = b.makeMove(e4);
  check("after e4: turn is Black", b.turn === 1);
  check("after e4: epSquare is 20", b.epSquare === 20);
  check("after e4: FEN contains e3", b.toFen().includes("e3"));
  check("after e4: hash changed", b.zobristHex() !== startHash);

  // 1... e5 (e7e5 -> 52 to 36)
  const e5 = b.parseSan("e5");
  const u2 = b.makeMove(e5);
  check("after e5: turn is White", b.turn === 0);

  // Unmake e5
  b.unmakeMove(u2);
  check("after unmake e5: turn is Black", b.turn === 1);
  check("after unmake e5: epSquare restored to 20", b.epSquare === 20);

  // Unmake e4
  b.unmakeMove(u1);
  check("after unmake e4: FEN matches startpos", b.toFen() === startFen, b.toFen());
  check("after unmake e4: Zobrist matches startpos", b.zobristHex() === startHash, b.zobristHex());
}

console.log("== 4. Castling & Promotions make/unmake ==");
{
  // Scholar's Mate / Fool's Mate & Castling
  const b = Board.startpos();
  const moves = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"];
  const undos = [];
  for (const m of moves) {
    const word = b.parseSan(m);
    check(`parse ${m}`, word !== null);
    undos.push(b.makeMove(word));
  }
  check("White kingside castled: king on g1 (6)", (b.king.lo & (1 << 6)) !== 0);
  check("White kingside castled: rook on f1 (5)", (b.rook.lo & (1 << 5)) !== 0);
  check("White castling rights cleared", b.castling.white.size === 0);

  // Unmake all moves back to startpos
  while (undos.length > 0) {
    b.unmakeMove(undos.pop());
  }
  check("unmake all returns to startpos", b.toFen() === INITIAL_FEN);

  // Promotion test
  const promoFen = "8/4P3/8/8/8/8/8/4K2k w - - 0 1";
  const bPromo = Board.fromFen(promoFen);
  const qPromo = bPromo.parseUci("e7e8q");
  check("parseUci promotion resolves", qPromo !== null);
  const uPromo = bPromo.makeMove(qPromo);
  check("queen promoted on e8", (bPromo.queen.hi & (1 << (60 - 32))) !== 0);
  bPromo.unmakeMove(uPromo);
  check("unmake restores pawn on e7", bPromo.toFen() === promoFen);
}

console.log("== 5. Direct Zobrist & Check status access ==");
{
  const b = Board.startpos();
  const bi = b.zobristBigInt();
  check("zobristBigInt returns bigint", typeof bi === "bigint");
  check("zobristHex matches hex string", b.zobristHex() === bi.toString(16).padStart(16, "0"));
  check("inCheck initially false", b.inCheck() === false);

  // Checkmate position
  const bMate = Board.fromFen("rnbqkbnr/ppppp2p/5p2/6pQ/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 3");
  check("inCheck in mate is true", bMate.inCheck() === true);
}

console.log("== 6. Projections: toSan, toUci, parseSan, parseUci ==");
{
  const b = Board.startpos();
  const e4Word = b.parseSan("e4");
  check("toSan matches e4", b.toSan(e4Word) === "e4");
  check("toUci matches e2e4", b.toUci(e4Word) === "e2e4");
  check("parseUci('e2e4') matches parseSan('e4')", b.parseUci("e2e4") === e4Word);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====\n`);
if (fail > 0) process.exit(1);
