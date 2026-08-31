// tests/chessjs-parity.mjs — parity suite for the turbochess/chessjs façade
// (change: purechess-remaining-cleanroom, tasks 4.1/4.2). Cross-checks every
// observable output against chess.js@1.4.0 (dev-only bench baseline; never
// imported in src/). Fails on any divergence.
import { Chess as PcChess } from "../dist/chessjs.js";
import { Chess as JsChess } from "chess.js";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

// Seeded LCG for reproducible playouts
let seed = 0x2f6e2b1;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

console.log("== 1. FEN/SAN/history after each ply on 3 game SAN streams ==");
const GAMES = [
  "d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 Be7 e3 O-O Nf3 h6 Bh4 c5",
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O",
  "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 f4 b5 a3 Bb7",
];
for (const [gi, game] of GAMES.entries()) {
  const pc = new PcChess(), js = new JsChess();
  let ok = true, detail = "";
  for (const san of game.split(" ")) {
    const mp = pc.move(san), mj = js.move(san);
    if (!mp || !mj) { ok = false; detail = `move ${san} rejected (pc=${!!mp} js=${!!mj})`; break; }
    if (pc.fen() !== js.fen()) { ok = false; detail = `after ${san}: ${pc.fen()} vs ${js.fen()}`; break; }
    if (mp.san !== mj.san) { ok = false; detail = `san after ${san}: ${mp.san} vs ${mj.san}`; break; }
    if (JSON.stringify(pc.history()) !== JSON.stringify(js.history())) { ok = false; detail = `history after ${san}`; break; }
  }
  check(`game ${gi + 1} ply-by-ply parity`, ok, detail);
}

console.log("== 2. Fool's mate isCheckmate + check/mate suffixes ==");
{
  const fen = "rnbqkbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
  const pc = new PcChess(fen), js = new JsChess(fen);
  check("isCheckmate matches on Fool's mate", pc.isCheckmate() === true && js.isCheckmate() === true);
  const p2 = new PcChess(), j2 = new JsChess();
  const mp = p2.move("e4"), mj = j2.move("e4");
  check("SAN byte-identical (quiet)", mp.san === mj.san && mp.san === "e4");
  const mate = new PcChess(), mateJs = new JsChess();
  for (const m of ["f3", "e5", "g4", "Qh4"]) { mate.move(m); mateJs.move(m); }
  check("history SAN byte-identical incl # suffix", JSON.stringify(mate.history()) === JSON.stringify(mateJs.history()), JSON.stringify(mate.history()));
}

console.log("== 3. moves({square, verbose}) shape + SAN sets on 1k random positions ==");
{
  let positions = 0, sanMismatches = 0, fenMismatches = 0, shapeMismatches = 0;
  let gamesPlayed = 0;
  while (positions < 1000) {
    const pc = new PcChess(), js = new JsChess();
    gamesPlayed++;
    for (let ply = 0; ply < 120; ply++) {
      // compare at every position, including the start
      const pcSans = pc.moves().slice().sort();
      const jsSans = js.moves().slice().sort();
      if (JSON.stringify(pcSans) !== JSON.stringify(jsSans)) sanMismatches++;
      if (pc.fen() !== js.fen()) fenMismatches++;
      const pcV = pc.moves({ square: "e2", verbose: true });
      const jsV = js.moves({ square: "e2", verbose: true });
      const norm = (arr) => JSON.stringify(arr
        .map((m) => [m.from, m.to, m.san, m.piece, m.color, m.flags, m.lan, m.captured ?? null, m.promotion ?? null])
        .sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1])));
      if (norm(pcV) !== norm(jsV)) shapeMismatches++;
      positions++;
      const sans = js.moves();
      if (sans.length === 0 || js.isGameOver()) break;
      const mv = sans[Math.floor(rnd() * sans.length)];
      if (!pc.move(mv) || !js.move(mv)) break;
    }
    if (gamesPlayed > 300) break; // safety
  }
  check(`SAN sets identical on ${positions} positions (mismatches=${sanMismatches})`, sanMismatches === 0);
  check(`FEN identical on ${positions} positions (mismatches=${fenMismatches})`, fenMismatches === 0);
  check(`verbose {square:e2} shape identical (mismatches=${shapeMismatches})`, shapeMismatches === 0);
}

console.log("== 4. makeSan +/#/O-O/=Q byte-identical on random playouts ==");
{
  let n = 0, bad = 0, castles = 0, promos = 0, checks = 0;
  while (n < 1000) {
    const pc = new PcChess(), js = new JsChess();
    for (let ply = 0; ply < 200; ply++) {
      const sans = js.moves();
      if (sans.length === 0) break;
      // steer toward castling/promotions sometimes
      let mv = sans[Math.floor(rnd() * sans.length)];
      const cast = sans.find((s) => s.startsWith("O-O"));
      const promo = sans.find((s) => s.includes("="));
      if (cast && rnd() < 0.5) mv = cast;
      else if (promo && rnd() < 0.5) mv = promo;
      const mp = pc.move(mv), mj = js.move(mv);
      if (!mp || !mj) { bad++; break; }
      if (mp.san !== mj.san) bad++;
      if (mp.san.startsWith("O-O")) castles++;
      if (mp.san.includes("=")) promos++;
      if (mp.san.includes("+") || mp.san.includes("#")) checks++;
      n++;
    }
    if (n >= 1000) break;
  }
  check(`makeSan byte-identical on ${n} moves (bad=${bad}) [O-O:${castles} =Q:${promos} +/#:${checks}]`, bad === 0 && castles > 0 && promos > 0);
}

console.log("== 5. en-passant FEN semantics (chess.js baseline) ==");
{
  const g = new PcChess(), gj = new JsChess();
  for (const m of ["e4", "a6", "e5", "d5"]) { g.move(m); gj.move(m); }
  check("ep square emitted when legal capture exists", g.fen() === gj.fen() && g.fen().includes(" d6 "), g.fen());
  const g2 = new PcChess(), g2j = new JsChess();
  g2.move("e4"); g2j.move("e4");
  check("no ep square when no capturer", g2.fen() === g2j.fen() && g2.fen().includes(" - "), g2.fen());
  const fenWithEp = "rnbqkbnr/pppppppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
  const g3 = new PcChess(fenWithEp), g3j = new JsChess(fenWithEp);
  check("input-FEN ep square not echoed (baseline quirk)", g3.fen() === g3j.fen(), g3.fen());
  check("legal ep capture still available after load", g3.moves().includes("dxe3") === g3j.moves().includes("dxe3") && g3.moves().includes("dxe3"));
}

console.log("== 6. undo / pgn / board / turn / moveNumber ==");
{
  const pc = new PcChess(), js = new JsChess();
  for (const m of ["e4", "e5", "Nf3"]) { pc.move(m); js.move(m); }
  const up = pc.undo(), uj = js.undo();
  check("undo restores identical FEN", pc.fen() === js.fen());
  check("undo returns identical san", up.san === uj.san && up.san === "Nf3");
  check("turn matches", pc.turn() === js.turn());
  check("moveNumber matches", pc.moveNumber() === js.moveNumber());
  const bPc = JSON.stringify(pc.board()), bJs = JSON.stringify(js.board());
  check("board() identical", bPc === bJs);
  // full verbose object parity over streams with capture / ep / castle / promotion
  const streams = [
    ["e4", "d5", "exd5", "Nf6"],               // ordinary capture
    ["e4", "a6", "e5", "d5", "exd6", "Nf6"],   // en passant capture
    ["Nf3", "Nf6", "g3", "g6", "Bg2", "Bg7", "O-O", "O-O"], // castling
    ["e4", "d6", "e5", "dxe5", "d4", "e6", "dxe5", "a6"],   // mixed
  ];
  let vbad = "";
  for (const [si, stream] of streams.entries()) {
    const sp = new PcChess(), sj = new JsChess();
    for (const san of stream) {
      const mp = sp.move(san), mj = sj.move(san);
      const pick = (m) => m && JSON.stringify([m.san, m.flags, m.lan, m.captured ?? null, m.promotion ?? null, m.from, m.to, m.before, m.after]);
      if (pick(mp) !== pick(mj)) { vbad = `stream ${si + 1} move ${san}: ${pick(mp)} vs ${pick(mj)}`; break; }
      if (sp.fen() !== sj.fen()) { vbad = `stream ${si + 1} fen after ${san}`; break; }
    }
    if (vbad) break;
  }
  check("verbose move objects identical on capture/ep/castle streams", !vbad, vbad);
  check("squareColor a1=light h1=dark", pc.squareColor("a1") === "light" && pc.squareColor("h1") === "dark");
  check("pgn() contains numbered movetext and result", pc.pgn().includes("1. e4 e5") && pc.pgn().trimEnd().endsWith("*"));
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail > 0 ? 1 : 0);
