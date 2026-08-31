// tests/packed-moves.mjs — 16-bit packed move encoding ("moves2") verification
// (change turbochess-unified-api-and-perf, task 2.2). Verifies, per the
// turbochess-zobrist-and-moves2 spec:
//   1. lossless round-trip of every legal move (normal, castling, en passant,
//      underpromotions) through packMove/unpackMove,
//   2. high-speed binary replay: Chess.fromMoves2(Uint16Array) reproduces the
//      exact final position of SAN replay,
//   3. little-endian Uint8Array wire form round-trip,
//   4. memory footprint (160 bytes per 80-ply game in Uint16Array).
// Run from repo root after `npm run build`.
import { Chess, packMove, unpackMove, roleToPromoCode, promoCodeToRole, PROMO_NONE, PROMO_KNIGHT, PROMO_QUEEN } from "../dist/index.js";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

// Seeded LCG for reproducible playouts
let seed = 0x3c2f6e21;
function rnd(n) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % n;
}

// ---- 1. bit-layout + lossless round-trip ----
{
  const w = packMove(12, 28, PROMO_QUEEN);
  check("packMove bit layout from|to<<6|promo<<12", w === (12 | (28 << 6) | (4 << 12)), `0x${w.toString(16)}`);
  const u = unpackMove(w);
  check("unpackMove round-trip", u.from === 12 && u.to === 28 && u.promo === 4);
  const plain = unpackMove(packMove(4, 12));
  check("no-promotion packs promo=0", plain.promo === PROMO_NONE);
  // role mapping
  check("roleToPromoCode/promoCodeToRole inverse",
    promoCodeToRole(roleToPromoCode(2)) === 2 && promoCodeToRole(roleToPromoCode(5)) === undefined && PROMO_KNIGHT === 1);
}

// ---- 2. every legal move (incl. underpromotions) round-trips ----
{
  const FENS = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", // kiwipete (castling)
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", // ep tricks
    "n1n5/PPPk4/8/8/8/8/4Kppp/5N1N b - - 0 1", // promotions galore
    "8/P6k/8/8/8/8/6pK/8 w - - 0 1", // underpromotions
  ];
  let tested = 0, bad = 0;
  for (const fen of FENS) {
    const g = new Chess(fen);
    for (const v of g.moves({ verbose: true })) {
      const word = packMove(
        (v.from.charCodeAt(0) - 97) + (v.from.charCodeAt(1) - 49) * 8,
        (v.to.charCodeAt(0) - 97) + (v.to.charCodeAt(1) - 49) * 8,
        v.promotion ? roleToPromoCode({ q: 4, r: 3, b: 2, n: 1 }[v.promotion]) : PROMO_NONE,
      );
      const u = unpackMove(word);
      tested++;
      if (u.from !== (v.from.charCodeAt(0) - 97) + (v.from.charCodeAt(1) - 49) * 8 ||
          u.to !== (v.to.charCodeAt(0) - 97) + (v.to.charCodeAt(1) - 49) * 8 ||
          u.promo !== (v.promotion ? roleToPromoCode({ q: 4, r: 3, b: 2, n: 1 }[v.promotion]) : 0)) bad++;
    }
  }
  check(`all ${tested} legal moves round-trip losslessly`, bad === 0);
}

// ---- 3. binary replay from Uint16Array matches SAN replay ----
{
  const LINES = [
    ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O"],
    ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "O-O"],
    ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "g6"],
    ["e4", "a6", "e5", "d5", "exd6"], // includes en passant
  ];
  for (const sans of LINES) {
    const game = new Chess();
    for (const san of sans) game.move(san);
    const packed = game.toMoves2();
    check(`toMoves2 length ${sans.length}`, packed.length === sans.length);
    const replay = Chess.fromMoves2(packed);
    check(`fromMoves2 final FEN matches SAN replay (${sans[0]}...)`,
      replay.fen() === game.fen(), replay.fen().slice(0, 30));
    check(`fromMoves2 history length ${sans.length}`, replay.history().length === sans.length);
  }
  // underpromotion replay (custom start FEN)
  const promoFen = "8/P6k/8/8/8/8/7K/8 w - - 0 1";
  const promo = new Chess(promoFen);
  promo.move("a8=N");
  const promoReplay = Chess.fromMoves2(promo.toMoves2(), promoFen);
  check("underpromotion replay (a8=N)", promoReplay.fen() === promo.fen());
  // illegal replay must throw
  let threw = false;
  try {
    Chess.fromMoves2(Uint16Array.from([packMove(4, 32)])); // e1-a5: king teleport
  } catch { threw = true; }
  check("illegal moves2 stream rejected", threw);
}

// ---- 4. little-endian Uint8Array wire form ----
{
  const game = new Chess();
  for (const san of ["e4", "e5", "Nf3"]) game.move(san);
  const words = game.toMoves2();
  const bytes = new Uint8Array(words.length * 2);
  for (let i = 0; i < words.length; i++) {
    bytes[i * 2] = words[i] & 0xff;
    bytes[i * 2 + 1] = (words[i] >>> 8) & 0xff;
  }
  const replay = Chess.fromMoves2(bytes);
  check("Uint8Array (LE) wire form replays identically", replay.fen() === game.fen());
  // odd-length byte buffer: trailing half-word dropped, no crash
  const odd = Chess.fromMoves2(bytes.subarray(0, bytes.length - 1));
  check("truncated stream tolerated", odd.history().length === 2);
}

// ---- 5. memory footprint: 160 bytes per 80-ply game ----
{
  // deterministic legal 80-ply game via seeded random playouts
  let seed2 = 0x5eed1234;
  const rnd2 = (n) => { seed2 = (Math.imul(seed2, 1664525) + 1013904223) >>> 0; return seed2 % n; };
  let game = null;
  for (let attempt = 0; attempt < 200 && game === null; attempt++) {
    const g2 = new Chess();
    let p = 0;
    while (p < 80) {
      const sans = g2.moves();
      if (sans.length === 0) break;
      g2.move(sans[rnd2(sans.length)]);
      p++;
    }
    if (p === 80) game = g2;
  }
  check("seeded 80-ply game generated", game !== null);
  if (game) {
    const packed = game.toMoves2();
    check("80-ply game packs to 160 bytes", packed.length === 80 && packed.byteLength === 160,
      `${packed.length} plies, ${packed.byteLength} bytes`);
    const replay = Chess.fromMoves2(packed);
    check("80-ply replay matches", replay.fen() === game.fen());
  }
  // fixed opening line: only legal moves are packed, 2 bytes each
  const fixed = new Chess();
  let plies = 0;
  const line = ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "g6"];
  for (const san of line) { if (fixed.move(san) !== null) plies++; }
  const packed2 = fixed.toMoves2();
  check("fixed line packs 2 bytes per ply", packed2.length === plies && packed2.byteLength === 2 * plies,
    `${packed2.length} plies, ${packed2.byteLength} bytes`);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail > 0 ? 1 : 0);
