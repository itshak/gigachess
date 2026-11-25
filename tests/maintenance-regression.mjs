// Cross-engine correctness regressions. Keep the Polyglot and moves2 wire
// contracts synchronized with gigachess-rs; never change them for FIDE draws.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Board, parseFen, isThreefoldRepetition, isFivefoldRepetition, repetitionKey, packMove } from "../dist/index.js";
import { analyzeCheckContext, legalMovesInto, countLegalMoves } from "../dist/chess.js";
import { Chess as GChess } from "../dist/chessjs.js";
import { Chess as ChessJs, validateFen } from "chess.js";
import { ensureZobristLoaded, calculateZobrist, zobristHex } from "../dist/zobrist.js";

// Zobrist becomes available between moves. Its first incremental update must
// be relative to the position BEFORE the next move, including after an undo.
{
  const b = new Board();
  b.makeMove(b.parseUci("e2e4"));
  await ensureZobristLoaded();
  const oldKey = zobristHex(calculateZobrist(b));
  const undo = b.makeMove(b.parseUci("e7e5"));
  assert.equal(b.zobristHex(), zobristHex(calculateZobrist(b)));
  assert.deepEqual(repetitionKey(b.pos), repetitionKey(b.toPosition()));
  b.unmakeMove(undo);
  assert.equal(b.zobristHex(), oldKey);
  const pass = b.makeNullMove();
  assert.equal(b.zobristHex(), zobristHex(calculateZobrist(b)));
  b.unmakeMove(pass);
  assert.equal(b.zobristHex(), oldKey);
}
console.log("PASS late Zobrist initialization, increment and undo");

// FIDE repetition compares legal positions, not literal FEN ep fields.
{
  const line = ["a4", "Nf6", "Nf3", "Ng8", "Ng1", "Nf6", "Nf3", "Ng8", "Ng1"];
  const a = new GChess(), c = new ChessJs();
  for (const san of line) { assert.ok(a.move(san)); assert.ok(c.move(san)); }
  assert.equal(c.isThreefoldRepetition(), true);
  assert.equal(a.isThreefoldRepetition(), c.isThreefoldRepetition());
  const withEp = parseFen("8/8/8/8/P7/8/8/K6k b - a3 0 1");
  const withoutEp = parseFen("8/8/8/8/P7/8/8/K6k b - - 0 1");
  assert.ok(withEp.ok && withoutEp.ok);
  assert.equal(isThreefoldRepetition([withEp.value, withoutEp.value, withoutEp.value]), true);
  assert.equal(isFivefoldRepetition([withEp.value, withoutEp.value, withoutEp.value, withoutEp.value, withoutEp.value]), true);
  // En-passant geometrically possible but pinned: Polyglot remains pseudo-legal,
  // whereas repetition must regard the illegal EP capture as unavailable.
  const pinEp = parseFen("k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
  const pinNo = parseFen("k3r3/8/8/3pP3/8/8/8/4K3 w - - 0 1");
  assert.ok(pinEp.ok && pinNo.ok);
  assert.equal(isThreefoldRepetition([pinEp.value,pinNo.value,pinNo.value]),true);
  assert.deepEqual(repetitionKey(pinEp.value), repetitionKey(pinNo.value));
  assert.notDeepEqual(calculateZobrist(pinEp.value), calculateZobrist(pinNo.value));
  // A truly legal capture means the two positions are NOT identical.
  const liveEp = parseFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
  const liveNo = parseFen("4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1");
  assert.ok(liveEp.ok && liveNo.ok);
  assert.equal(isThreefoldRepetition([liveEp.value,liveNo.value,liveNo.value]),false);
  assert.notDeepEqual(repetitionKey(liveEp.value), repetitionKey(liveNo.value));
}
console.log("PASS repetition with phantom, pinned and legal en-passant");

// The optimized standard castling tables MUST be truly immutable; frozen Set
// objects can still be mutated with clear()/delete().
{
  const a = new Board(), b = new Board(), c = a.clone();
  assert.equal(typeof a.castling.white.clear, "undefined");
  assert.equal(a.castling.white.has(7), true);
  assert.equal(b.castling.white.has(7), true);
  assert.equal(c.castling.white.has(7), true);
  assert.equal(a.toFen(), b.toFen());
  const chess960 = Board.fromFen("rnqbbknr/pppppppp/8/8/8/8/PPPPPPPP/RNQBBKNR w KQkq - 0 1", { chess960: true });
  assert.equal(chess960.isChess960, true);
  assert.equal(typeof chess960.castling.white.clear, "undefined");
  assert.equal(chess960.castling.white.has(7), true);
  const other = chess960.clone();
  assert.deepEqual([...other.castling.white], [...chess960.castling.white]);
}
console.log("PASS immutable castling rights, clone and Chess960 constructor");

// Raw packed replay remains a trusted-input fast path for backwards
// compatibility, while public checked replay refuses illegal words.
{
  const game = new GChess();
  for (const move of ["e4","e5","Nf3"]) game.move(move);
  const moves = game.toMoves2();
  assert.equal(Board.fromMoves2Checked(moves).toFen(), Board.fromMoves2(moves).toFen());
  const leBytes = new Uint8Array(1 + moves.length * 2);
  for (let i = 0; i < moves.length; i++) {
    leBytes[1 + i * 2] = moves[i] & 255;
    leBytes[2 + i * 2] = moves[i] >>> 8;
  }
  assert.equal(Board.fromMoves2(leBytes.subarray(1)).toFen(), Board.fromMoves2(moves).toFen());
  assert.equal(Board.fromMoves2Checked(leBytes.subarray(1)).toFen(), Board.fromMoves2(moves).toFen());
  assert.throws(() => Board.fromMoves2Checked(Uint16Array.of(packMove(0,16))), /illegal move/);
  assert.throws(() => Board.fromMoves2Checked(leBytes.subarray(1, leBytes.length - 1)), /truncated/);
}
console.log("PASS checked/untrusted moves2 and unaligned little-endian bytes");

// FEN halfmove counter denotes elapsed halfmoves, not a value capped by the
// automatic-draw threshold; historical FENs with 151+ remain representable.
for (const n of [150,151,200]) {
  const fen = `8/8/8/8/8/8/8/K6k w - - ${n} 1`;
  assert.equal(validateFen(fen).ok, true);
  const p = parseFen(fen);
  assert.ok(p.ok, `GigaChess must parse ${n}`);
  assert.equal(p.value.halfmoves, n);
}
console.log("PASS halfmove FEN acceptance agrees with chess.js");

// This TSV is byte-identical in both repos, not merely an algorithm sketch.
for (const line of readFileSync(new URL("./position-keys-v1.tsv", import.meta.url), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const [label, variant, fen, polyglot, repetition] = line.split("\t");
  const parsed = parseFen(fen, { chess960: variant === "960" });
  assert.ok(parsed.ok, label);
  assert.equal(zobristHex(calculateZobrist(parsed.value)), polyglot, label + " Polyglot");
  assert.equal(zobristHex(repetitionKey(parsed.value)), repetition, label + " repetition");
}
for (const line of readFileSync(new URL("./moves2-v1.tsv", import.meta.url), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const [label, from, to, promo, hex] = line.split("\t");
  assert.equal(packMove(Number(from), Number(to), Number(promo)).toString(16).padStart(4,"0"),hex,label);
}
console.log("PASS shared JS/Rust golden FEN, Polyglot, repetition and moves2 vectors");

// An analysis must be stable across subsequent nested / unrelated analyses.
// The old global castlingPlan scratch would silently mutate existing context
// objects; this is especially dangerous for retained Chess960 contexts.
{
  const fenA = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
  const fenB = "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1";
  const a = Board.fromFen(fenA);
  const b = Board.fromFen(fenB);
  const ctxA = analyzeCheckContext(a.pos);
  const planA = ctxA.castlingPlans.map((x) => [x.side, x.kingFrom, x.rookFrom, x.kingTo, x.rookTo]);
  const countA = countLegalMoves(a.pos, ctxA);
  analyzeCheckContext(b.pos);
  assert.deepEqual(ctxA.castlingPlans.map((x) => [x.side, x.kingFrom, x.rookFrom, x.kingTo, x.rookTo]), planA);
  assert.equal(countLegalMoves(a.pos, ctxA), countA);
  assert.equal(countLegalMoves(a.pos, analyzeCheckContext(a.pos)), countA);
  const shared = new Uint16Array(256);
  const expected = legalMovesInto(a.pos, shared);
  const reused = analyzeCheckContext(b.pos);
  const aReused = analyzeCheckContext(a.pos, reused);
  assert.equal(legalMovesInto(a.pos, shared, aReused), expected);
}
{
  // Exercise Chess960 rook-square plans whose coordinates change between
  // positions; reentrant calls must never rewrite the first returned plan.
  const a = Board.fromFen("3k4/8/8/8/8/8/8/R1K4R w AH - 0 1", { chess960: true });
  const b = Board.fromFen("3k4/8/8/8/8/8/8/1RK3R1 w BG - 0 1", { chess960: true });
  const first = analyzeCheckContext(a.pos);
  const prior = first.castlingPlans.map((p) => [p.rookFrom,p.kingTo,p.rookTo]);
  analyzeCheckContext(b.pos);
  assert.deepEqual(first.castlingPlans.map((p) => [p.rookFrom,p.kingTo,p.rookTo]), prior);
  assert.equal(first.castlingPlans.length, 2);
}
console.log("PASS reentrant caller-owned check/pin contexts across standard and Chess960");

// Perft uses its own temporary no-hash transition; the public Board must
// retain its exact FEN, legal move set and Polyglot hash after every unwind.
// This is particularly important when Zobrist was lazily loaded beforehand.
{
  await ensureZobristLoaded();
  const cases = [
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 4, 197281, false],
    ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 3, 97862, false],
    ["k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", 3, 530, false],
    ["nbrknrbq/pppppppp/8/8/8/8/PPPPPPPP/NBRKNRBQ w KQkq - 0 1", 2, null, true],
  ];
  for(const [fen, depth, expected, chess960] of cases) {
    const b = Board.fromFen(fen, chess960 ? { chess960:true }:undefined);
    const oldFen = b.toFen(),oldHash=b.zobristHex(),oldMoves=[...b.legalMoves()];
    const count=b.perft(depth);
    if(expected!==null) assert.equal(count,expected,fen);
    assert.equal(b.toFen(),oldFen,fen);
    assert.equal(b.zobristHex(),oldHash,fen);
    assert.deepEqual([...b.legalMoves()],oldMoves,fen);
    assert.equal(b.zobristHex(),zobristHex(calculateZobrist(b)),fen);
    // After an optimized perft run, NORMAL game moves still hash incrementally.
    const undo=b.makeMove(oldMoves[0]);
    assert.equal(b.zobristHex(),zobristHex(calculateZobrist(b)),fen+" first move");
    b.unmakeMove(undo);
    assert.equal(b.zobristHex(),oldHash,fen+" undo");
  }
}
console.log("PASS specialized perft skips hash only transiently; board state and hash survive including Chess960");
