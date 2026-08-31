// tests/compat-chessops.mjs — API-compatibility suite (ADR-014, change
// purechess-gates-green follow-up). Exercises ONLY the chessops-shaped
// public API from `dist/chessops/index.js` and cross-checks every output
// against real chessops. Fails on any divergence.
import { Chess as CoChess } from "chessops/chess";
import { parseFen as coParseFen, makeFen as coMakeFen } from "chessops/fen";
import { makeSan as coMakeSan, parseSan as coParseSan } from "chessops/san";
import { perft as coPerft } from "chessops/debug";
import { SquareSet as CoSquareSet } from "chessops/squareSet";
import { parseUci as coParseUci, makeUci as coMakeUci } from "chessops/util";

import {
  Chess as PcChess,
  SquareSet as PcSquareSet,
  parseFen as pcParseFen,
  makeFen as pcMakeFen,
  makeSan as pcMakeSan,
  parseSan as pcParseSan,
  parseUci as pcParseUci,
  makeUci as pcMakeUci,
  perft as pcPerft,
  normalizeMove as pcNormalizeMove,
  Board as PcBoard,
} from "../dist/chessops/index.js";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

const FENS = [
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
  "r3k2r/8/8/8/8/8/8/3K4 b kq - 1 1",
  "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPP1PPPP/RNBQKBNR b KQkq e3 0 1",
  "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
];

console.log("== 1. parseFen/makeFen parity ==");
for (const fen of FENS) {
  const co = coParseFen(fen).unwrap();
  const pcR = pcParseFen(fen);
  if (pcR.isErr) { check(`parseFen ${fen.slice(0, 20)}`, false, pcR.error.message); continue; }
  const pc = pcR.unwrap();
  check(`makeFen byte-identical ${fen.slice(0, 20)}`, pcMakeFen(pc) === coMakeFen(co));
  check(`makeFen epd ${fen.slice(0, 20)}`, pcMakeFen(pc, { epd: true }) === coMakeFen(co, { epd: true }));
  check(`turn/ep/counters ${fen.slice(0, 20)}`,
    pc.turn === co.turn &&
    pc.epSquare === co.epSquare &&
    pc.halfmoves === co.halfmoves &&
    pc.fullmoves === co.fullmoves);
  check(`castlingRights bits ${fen.slice(0, 20)}`,
    pc.castlingRights.lo === co.castlingRights.lo && pc.castlingRights.hi === co.castlingRights.hi);
  check(`board bits ${fen.slice(0, 20)}`,
    pc.board.occupied.lo === co.board.occupied.lo && pc.board.occupied.hi === co.board.occupied.hi &&
    pc.board.white.lo === co.board.white.lo && pc.board.pawn.hi === co.board.pawn.hi);
}

console.log("== 2. Chess.play / dests / SAN / UCI / terminal parity over real games ==");
const GAMES = [
  "d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 Be7 e3 O-O Nf3 h6 Bh4 c5 Bd3 Nc6 O-O Be6 a3 c4 Bc2 b5 b3 cxb3 Bxb3 b4 axb4 Bxb4 Nxb5 Nbd7 Nxd5+ Nxd5 Qxd5 Rab8 Nd4 Nxd4 exd4 Bc3 Ra2 Rb6 g3 Qb8 Bf4 g5 Bxg5 hxg5 h4 gxh4 Rxh4 Bb7 Rg2 Rb8 Rg1 Be7 Rxa7 Rxb4 Rb1 Bb7 Rxb4 Bxd5 Bf3 Qb6 Rh1 g6 Bg4 f5 Bf3 Bf6 Rg1 Kg7 Rg2 Kg7 Bg2 Bd5 Bf3 Bf6 Bg2 Bd5 Bf3 Bf6",
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Na5 Bc2 c5 d4 Qc7 Nbd2 cxd4 cxd4 Nc6 Nb3 Nf6 Nbd2 Bb7 Bb3 d5 exd5 Nxd5 Nxd5 exd5 Rxe7 Nxe7 Qd3 Qc6 Qxd5 Qxd5 Bxd5 Bd6 Be3 Rfe8 O-O Rad8 Rxe8+ Rxe8 Rb1 Re2 Bf4 Rxb2 Rb1 Ra2 Rb3 g6 Bxd6 Bxd6 Ne5 Ne6",
  "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 f4 b5 a3 Bb7 Bd3 Nf6 Qf3 Bc5 O-O-O Ne7 Nxc6 Qxc6 Bxc5 Qxc5+ Kb1 O-O g4 d6 g5 Nd7 Rhg1 b4 axb4 Qxb4 Na4 Qb5 b3 Rfc8 Ne2 Rab8 Nc1 a5 Nd3 Qb6 Nb4 Rab7 Qg3 a4 Nxa6 Ra8 b4 axb3 cxb3 Qd8 Nc5 Nc6 Rxd6 Qxd6 Bc4 Ne5 Bxf7+ Kxf7 Qg7+ Ke8 Rxd6",
];
for (const sanMoves of GAMES) {
  const co = CoChess.default();
  const pc = PcChess.default();
  const name = sanMoves.slice(0, 22);
  let ok = true, detail = "";
  for (const san of sanMoves.split(" ")) {
    const coMove = coParseSan(co, san);
    const pcMove = pcParseSan(pc, san);
    if ((coMove === undefined) !== (pcMove === undefined)) {
      ok = false; detail = `parseSan disagreement ${san}: co=${!!coMove} pc=${!!pcMove}`; break;
    }
    if (coMove === undefined) continue; // both agree the SAN is illegal here
    // SAN make from flagless moves must be identical (incl. ep + castling)
    const coSan = coMakeSan(co, coMove);
    const pcSan = pcMakeSan(pc, pcMove);
    if (coSan !== pcSan) { ok = false; detail = `makeSan ${san}: co=${coSan} pc=${pcSan}`; break; }
    // UCI parity
    if (pcMakeUci(pcMove) !== coMakeUci(coMove)) { ok = false; detail = `makeUci ${san}`; break; }
    if (pcMakeUci(pcParseUci(pcMakeUci(pcMove))) !== coMakeUci(coMove)) { ok = false; detail = `parseUci ${san}`; break; }
    // play (mutates each instance, chessops-style)
    co.play(coMove);
    pc.play(pcMove);
    if (pcMakeFen(pc.toSetup()) !== coMakeFen(co.toSetup())) { ok = false; detail = `fen after ${san}`; break; }
    // allDests parity
    const coD = co.allDests();
    const pcD = pc.allDests();
    if (coD.size !== pcD.size) { ok = false; detail = `allDests size after ${san}`; break; }
    let destsOk = true;
    for (const [s, set] of coD) {
      const pcSet = pcD.get(s);
      if (!pcSet || pcSet.lo !== set.lo || pcSet.hi !== set.hi) { destsOk = false; detail = `allDests ${s} after ${san}`; break; }
    }
    if (!destsOk) { ok = false; break; }
    // terminal flags parity
    if (pc.isCheck() !== co.isCheck() || pc.isCheckmate() !== co.isCheckmate() ||
        pc.isStalemate() !== co.isStalemate() || pc.isInsufficientMaterial() !== co.isInsufficientMaterial() ||
        pc.isEnd() !== co.isEnd() || pc.hasDests() !== co.hasDests()) {
      ok = false; detail = `terminal flags after ${san}`; break;
    }
    // outcome parity
    const coOut = co.outcome(), pcOut = pc.outcome();
    if ((coOut === undefined) !== (pcOut === undefined) ||
        (coOut !== undefined && (coOut.winner ?? "x") !== (pcOut?.winner ?? "x"))) {
      ok = false; detail = `outcome after ${san}`; break;
    }
  }
  check(`game replay ${name}`, ok, detail);
  if (ok) {
    check(`hasInsufficientMaterial ${name}`,
      pc.hasInsufficientMaterial("white") === co.hasInsufficientMaterial("white") &&
      pc.hasInsufficientMaterial("black") === co.hasInsufficientMaterial("black"));
  }
}

console.log("== 3. perft via chessops-shaped API ==");
{
  const co = CoChess.fromSetup(coParseFen(FENS[1]).unwrap()).unwrap();
  const pc = PcChess.fromSetup(pcParseFen(FENS[1]).value);
  check("fromSetup kiwipete", pc.isOk);
  if (pc.isOk) {
    check("perft d3 kiwipete", pcPerft(pc.value, 3) === coPerft(co, 3), `${pcPerft(pc.value, 3)} vs ${coPerft(co, 3)}`);
  }
  check("perft d1 startpos", pcPerft(PcChess.default(), 1) === 20);
  check("perft d1 promotions corpus", pcPerft(PcChess.fromSetup(pcParseFen("n1n5/PPPk4/8/8/8/8/4Kppp/5N1N b - - 0 1").value).unwrap(), 1) === 24);
}

console.log("== 4. Chess.fromSetup validation ==");
{
  const fenR1 = pcParseFen("8/8/8/8/8/8/8/8 w - - 0 1");
  check("kings-count FEN rejected by parseFen", fenR1.isErr);
  // construct the Setup directly (the FEN itself has no legal Setup) to prove
  // fromSetup performs its own validation, exactly like chessops.fromSetup
  const emptySetupObj = {
    board: PcBoard.empty(), pockets: undefined, turn: "white",
    castlingRights: new PcSquareSet(0, 0), epSquare: undefined,
    remainingChecks: undefined, halfmoves: 0, fullmoves: 1,
  };
  const bad = PcChess.fromSetup(emptySetupObj);
  check("fromSetup empty board rejected", bad.isErr);
  const fenR2 = pcParseFen("8/8/8/8/8/8/8/P6k w - - 0 1");
  check("pawns-on-backrank FEN rejected by parseFen", fenR2.isErr);
  const good = PcChess.fromSetup(pcParseFen(FENS[1]).value);
  check("kiwipete accepted", good.isOk);
}

console.log("== 5. SquareSet class parity ==");
{
  const a = new PcSquareSet(0x12345678, 0x0fedcba0);
  const b = new CoSquareSet(0x12345678, 0x0fedcba0);
  const c = new PcSquareSet(0x0f0f0f0f, 0x11111111);
  const c2 = new CoSquareSet(0x0f0f0f0f, 0x11111111);
  let ok =
    a.union(c).lo === b.union(c2).lo &&
    a.intersect(c).hi === b.intersect(c2).hi &&
    a.diff(c).lo === b.diff(c2).lo &&
    a.size() === b.size() &&
    a.first() === b.first() && a.last() === b.last() &&
    a.moreThanOne() === b.moreThanOne() &&
    a.shl64(3).lo === b.shl64(3).lo &&
    a.shr64(5).hi === b.shr64(5).hi &&
    a.bswap64().lo === b.bswap64().lo &&
    a.rbit64().hi === b.rbit64().hi &&
    a.minus64(c).lo === b.minus64(c2).lo &&
    a.complement().hi === b.complement().hi &&
    a.xor(c).equals(b.xor(c2)) &&
    a.isDisjoint(PcSquareSet.fromSquare(40)) === b.isDisjoint(CoSquareSet.fromSquare(40));
  const pcArr = [...a], coArr = [...b];
  ok = ok && pcArr.length === coArr.length && pcArr.every((s, i) => s === coArr[i]);
  check("SquareSet ops + iteration parity", ok);
  check("SquareSet statics",
    PcSquareSet.full().size() === 64 && PcSquareSet.empty().size() === 0 &&
    PcSquareSet.lightSquares().size() === 32 && PcSquareSet.backrank("black").lo === 0 &&
    PcSquareSet.corners().size() === 4 && PcSquareSet.center().size() === 4 &&
    PcSquareSet.backranks().size() === 16);
}

console.log("== 6. normalizeMove / castlingSide (chessops semantics) ==");
{
  const pc = PcChess.default();
  // chessops normalizeMove maps the UCI king two-square form to king-captures-rook
  const m = pcNormalizeMove(pc, { from: 4, to: 6 });
  check("normalizeMove e1g1 -> e1h1", m.from === 4 && m.to === 7, JSON.stringify(m));
  // castling is not legal from the START position (knights block f1/g1) —
  // use kiwipete where O-O is legal, exactly like chessops
  const kiwi = PcChess.fromSetup(pcParseFen(FENS[1]).value).unwrap();
  check("isLegal rejects un-normalized e1g1 (chessops-exact)", !kiwi.isLegal({ from: 4, to: 6 }));
  check("isLegal accepts normalized e1h1", kiwi.isLegal({ from: 4, to: 7 }));
  const clone = pc.clone();
  pc.play({ from: 4, to: 7 });
  check("play mutated instance (chessops semantics)", pc.board.kingOf("white") === 6 && clone.board.kingOf("white") === 4);
  check("clone independent", pcMakeFen(pc.toSetup()) !== pcMakeFen(clone.toSetup()));
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail > 0 ? 1 : 0);

