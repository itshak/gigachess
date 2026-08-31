// tests/zobrist-parity.mjs — Zobrist hashing verification (change
// turbochess-unified-api-and-perf, task 2.1). Verifies, per the
// turbochess-zobrist-and-moves2 spec:
//   1. incremental (makeMove-maintained) key === from-scratch calculateZobrist
//      at EVERY ply of 100-ply games,
//   2. transposition equivalence (different move orders → identical key),
//   3. Polyglot en-passant legality filtering (unreachable ep file omitted),
//   4. known Polyglot reference hashes (startpos + after 1.e4 / 1.d4).
// Run from repo root after `npm run build`.
import { Chess, calculateZobrist, ensureZobristLoaded, zobristTablesLoaded, zobristHex, parseFen, makeMove, parseSan } from "../dist/index.js";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

function matchesScratch(g) {
  const k = g.zobrist();
  const s = calculateZobrist(g.pos);
  return k.lo === s.lo && k.hi === s.hi;
}

// Seeded LCG for reproducible playouts
let seed = 0x71a2b3c5;
function rnd(n) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % n;
}

// Known Polyglot Zobrist hashes (reference values from the Polyglot book
// format; fixed interop data).
const POLYGLOT_START = "463b96181691fc9c";
const POLYGLOT_E4 = "823c9b50fd114196"; // after 1.e4
const POLYGLOT_D4 = "830eb9b20758d1de"; // after 1.d4

await ensureZobristLoaded();
check("zobrist tables loaded", zobristTablesLoaded());

// ---- 1. known reference hashes (Polyglot interop) ----
{
  const g = new Chess();
  check("startpos hash matches Polyglot", zobristHex(g.zobrist()) === POLYGLOT_START, zobristHex(g.zobrist()));
  const g2 = new Chess();
  g2.move("e4");
  check("1.e4 hash matches Polyglot", zobristHex(g2.zobrist()) === POLYGLOT_E4, zobristHex(g2.zobrist()));
  const g3 = new Chess();
  g3.move("d4");
  check("1.d4 hash matches Polyglot", zobristHex(g3.zobrist()) === POLYGLOT_D4, zobristHex(g3.zobrist()));
}

// ---- 2. incremental === scratch at every ply of long random games ----
{
  let mismatches = 0, plies = 0;
  for (let game = 0; game < 12; game++) {
    const g = new Chess();
    for (let ply = 0; ply < 100; ply++) {
      const sans = g.moves();
      if (sans.length === 0) break;
      const before = g.pos;
      const mv = parseSan(sans[rnd(sans.length)], before);
      if (!mv.ok) { mismatches++; break; }
      g.play(mv.value);
      plies++;
      const inc = g.zobrist();
      const scratch = calculateZobrist(g.pos);
      if (inc.lo !== scratch.lo || inc.hi !== scratch.hi) { mismatches++; break; }
    }
  }
  check("incremental === scratch over random plies", mismatches === 0, `(${plies} plies verified)`);
}

// ---- 3. transposition equivalence ----
{
  const a = new Chess(); a.move("d4"); a.move("Nf6"); a.move("c4");
  const b = new Chess(); b.move("c4"); b.move("Nf6"); b.move("d4");
  const ka = a.zobrist(), kb = b.zobrist();
  check("transposition 1.d4 Nf6 2.c4 ≡ 1.c4 Nf6 2.d4", ka.lo === kb.lo && ka.hi === kb.hi, zobristHex(ka));
  const c = new Chess(); c.move("e4");
  const kc = c.zobrist();
  check("non-transposition keys differ", kc.lo !== ka.lo || kc.hi !== ka.hi);
}

// ---- 4. en-passant legality filtering (Polyglot semantics) ----
{
  // 1.e4 (no adjacent black pawn) — the ep square must NOT be hashed: the
  // key must equal the same position with the ep field stripped to '-'.
  const withEp = parseFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR b KQkq e3 0 1");
  const withoutEp = parseFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1");
  check("corpus FENs parse", withEp.ok && withoutEp.ok);
  if (withEp.ok && withoutEp.ok) {
    const k1 = calculateZobrist(withEp.value);
    const k2 = calculateZobrist(withoutEp.value);
    check("unreachable ep square omitted from hash", k1.lo === k2.lo && k1.hi === k2.hi, zobristHex(k1));
  }
  // A REAL ep possibility: after 1.e4 a6 2.e5 d5, a white pawn on e5 CAN
  // capture on d5 ep, so the ep file MUST be hashed (differs from '-' form).
  const g = new Chess();
  for (const san of ["e4", "a6", "e5", "d5"]) g.move(san);
  const realEp = parseFen(g.fen());
  const stripped = parseFen(g.fen().replace(/ d6 /, " - "));
  check("real-ep FEN parses", realEp.ok);
  if (realEp.ok && stripped.ok) {
    const k1 = calculateZobrist(realEp.value);
    const k2 = calculateZobrist(stripped.value);
    check("legal ep square IS hashed", k1.lo !== k2.lo || k1.hi !== k2.hi, zobristHex(k1));
    // and the game's incremental key equals the scratch key of the real FEN
    const inc = g.zobrist();
    check("ep game key matches scratch", inc.lo === k1.lo && inc.hi === k1.hi);
  }
}

// ---- 5. captures / castling / promotion / ep maintain the key exactly ----
{
  const g1 = new Chess(); for (const m of ["e4", "d5", "exd5"]) g1.move(m);
  check("capture key incremental === scratch", matchesScratch(g1));
  const g2 = new Chess();
  for (const m of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6", "d3", "d6"]) g2.move(m);
  check("castling key incremental === scratch", matchesScratch(g2));
  const g3 = new Chess("8/P6k/8/8/8/8/7K/8 w - - 0 1");
  g3.move("a8=Q");
  check("promotion key incremental === scratch", matchesScratch(g3));
  const g4 = new Chess();
  for (const m of ["e4", "a6", "e5", "d5", "exd6"]) g4.move(m);
  check("en-passant key incremental === scratch", matchesScratch(g4));
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail > 0 ? 1 : 0);
