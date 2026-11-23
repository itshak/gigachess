// Cross-engine correctness regressions. Keep the Polyglot and moves2 wire
// contracts synchronized with gigachess-rs; never change them for FIDE draws.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Board, parseFen, isThreefoldRepetition, isFivefoldRepetition, repetitionKey, packMove } from "../dist/index.js";
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
for (const line of readFileSync(new URL("./position-keys-v1.tsv", import.meta.url), "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const [label, variant, fen, polyglot, repetition] = line.split("\t");
  const parsed = parseFen(fen, { chess960: variant === "960" });
  assert.ok(parsed.ok, label);
  assert.equal(zobristHex(calculateZobrist(parsed.value)), polyglot, label + " Polyglot");
  assert.equal(zobristHex(repetitionKey(parsed.value)), repetition, label + " repetition");
}
for (const line of readFileSync(new URL("./moves2-v1.tsv", import.meta.url), "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const [label, from, to, promo, hex] = line.split("\t");
  assert.equal(packMove(Number(from), Number(to), Number(promo)).toString(16).padStart(4,"0"),hex,label);
}
console.log("PASS shared JS/Rust golden FEN, Polyglot, repetition and moves2 vectors");
