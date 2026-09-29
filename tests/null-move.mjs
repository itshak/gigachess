// tests/null-move.mjs — first-class null move (pass) contract.
//
// The pass is the single 16-bit sentinel word 0xffff (gigachess-rs
// `Move(0xffff)`, board.rs make_null_move). This suite pins the whole
// contract: the word sentinel, the `0000` UCI round-trip, SAN `--`/`Z0` in
// and `--` out, rejection of `null`/`pass`, the pass state transition
// (ep cleared, halfmove+1, fullmove+1 whoever passed, turn flipped), refusal
// while in check (judged fresh from the attack tables, never from the cached
// `checkers` bitboard), legalMoves never yielding a pass, and the chesstree
// regression — ply/path/FEN must stay in step across a pass.
//
// Run from repo root after `npm run build`.
import {
  parseFen, makeFen, makeMove, makeNullMove, makeSan, parseSan, parseUci, makeUci,
  packOf, unpackToMove, unpackMove, packMove,
  isNull, isNullMove, nullMove, isNullMoveSan, isNullMoveLegal, isCheck, isLegal,
  legalMovesInto, forEachLegalMove, Board, calculateZobrist, ensureZobristLoaded,
  NULL_MOVE_WORD, NULL_MOVE_SAN, NULL_MOVE_UCI, NULL_MOVE_SANS, PROMO_NONE,
} from "../dist/index.js";
import { pgnImport, buildTree } from "../dist/chesstree.js";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// 1. e4 — Black to move, ep square e3, halfmove 0, fullmove 1
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
// White has just been mated: a pass must be refused here
const IN_CHECK = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
const startPos = () => parseFen(START).value;
const boardFen = (fen) => fen.split(" ")[0];

// ---- 1. the word sentinel ----
{
  check("NULL_MOVE_WORD is the single u16 sentinel", NULL_MOVE_WORD === 0xffff, `0x${NULL_MOVE_WORD.toString(16)}`);
  check("isNull() is exactly `word === 0xffff`", isNull(0xffff) === true && isNull(0xfffe) === false);
  // no legal move packs to the sentinel — the widest legal word is 0x43ff
  let collides = false;
  for (let from = 0; from < 64; from++) {
    for (let to = 0; to < 64; to++) {
      for (let promo = 0; promo <= 4; promo++) {
        if (packMove(from, to, promo) === NULL_MOVE_WORD) collides = true;
      }
    }
  }
  check("no from/to/promo triple packs to the sentinel", collides === false);

  const n = nullMove();
  check("nullMove() is flagged as a pass", isNullMove(n) === true);
  check("packOf(nullMove()) === 0xffff", packOf(n) === NULL_MOVE_WORD, `0x${packOf(n).toString(16)}`);
  // the masking defect: 0xffff must NOT decode as the normal word
  // from=63, to=63, promo=15
  check("the sentinel is not masked through as a normal word",
    unpackMove(0xffff).promo === 15 && unpackToMove(0xffff).isNull === true,
    `raw promo=${unpackMove(0xffff).promo}, decoded isNull=${unpackToMove(0xffff).isNull}`);
  check("sentinel round-trips word -> Move -> word",
    packOf(unpackToMove(NULL_MOVE_WORD)) === NULL_MOVE_WORD);
  check("an ordinary move is not a pass", isNullMove(unpackToMove(packMove(4, 28))) === false);
  check("real words still decode unchanged (promo bits survive)",
    unpackMove(packMove(56, 0, 4)).promo === 4 && unpackToMove(packMove(56, 0, 4)).promotion === 4,
    `code=${unpackMove(packMove(56, 0, 4)).promo} role=${unpackToMove(packMove(56, 0, 4)).promotion}`);
  check("a non-promotion word decodes with no promotion role",
    unpackMove(packMove(4, 28)).promo === PROMO_NONE && unpackToMove(packMove(4, 28)).promotion === null);
}

// ---- 2. UCI: 0000 out, parseUci("0000") in ----
{
  const n = nullMove();
  check("makeUci(nullMove()) === '0000'", makeUci(n) === NULL_MOVE_UCI && makeUci(n) === "0000");
  const parsed = parseUci("0000");
  check("parseUci('0000') succeeds", parsed.ok === true);
  check("parseUci('0000') yields a pass", parsed.ok && isNullMove(parsed.value) === true);
  check("UCI round-trips 0000", parsed.ok && makeUci(parsed.value) === "0000");
  const real = parseUci("e2e4");
  check("parseUci('e2e4') is not a pass", real.ok === true && isNullMove(real.value) === false);
}

// ---- 3. SAN: `--` and `Z0` in, `--` out ----
{
  const pos = startPos();
  check("NULL_MOVE_SANS is exactly ['--', 'Z0']",
    JSON.stringify([...NULL_MOVE_SANS]) === JSON.stringify(["--", "Z0"]), JSON.stringify([...NULL_MOVE_SANS]));
  check("NULL_MOVE_SAN is exactly '--'", NULL_MOVE_SAN === "--");
  for (const token of ["--", "Z0"]) {
    const r = parseSan(token, pos);
    check(`parseSan('${token}') succeeds and yields a pass`, r.ok === true && isNullMove(r.value) === true);
  }
  check("isNullMoveSan accepts only the two tokens",
    isNullMoveSan("--") && isNullMoveSan("Z0") &&
    !isNullMoveSan("null") && !isNullMoveSan("pass") && !isNullMoveSan("0") && !isNullMoveSan("-"));

  // out: exactly `--`, never suffixed with + or #
  const san = makeSan(nullMove(), pos);
  check("makeSan(null) === '--'", san === "--", JSON.stringify(san));
  check("makeSan(null) carries no + or # suffix", !san.endsWith("+") && !san.endsWith("#"));
  // makeSan must return BEFORE any check/mate suffix logic: use a position
  // where the side to move has a mate available, so an ordinary move WOULD be
  // suffixed, and confirm the pass is not. Black king g8 boxed in by f7/g7/h7;
  // the rook on a1 mates on a8.
  const mateIn1 = parseFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1").value;
  const rookSan = makeSan({ from: 0, to: 56, promotion: null, isPromotion: false, isEnPassant: false, isCastling: false }, mateIn1);
  check("control: that position really does offer a mating move", rookSan === "Ra8#", rookSan);
  check("makeSan(null) in the same position is still bare '--'", makeSan(nullMove(), mateIn1) === "--");
}

// ---- 4. `null`, `pass` and other spellings are rejected ----
{
  const pos = startPos();
  for (const bad of ["null", "pass", "NULL", "Pass", "PASS", "0", "-", "Z", "0000", "----", "--+", "--#", "Z0+"]) {
    check(`parseSan('${bad}') is rejected`, parseSan(bad, pos).ok === false);
  }
}

// ---- 5. the pass state transition ----
{
  // ep present, halfmove 0, fullmove 1, Black to move
  const pos = parseFen(AFTER_E4).value;
  check("fixture ep square is set", pos.epSquare !== null, `ep=${pos.epSquare}`);
  const after = makeMove(pos, nullMove());
  check("pass clears the ep square", after.epSquare === null);
  check("pass advances the halfmove clock", after.halfmoves === 1, `halfmoves=${after.halfmoves}`);
  check("pass advances the fullmove number (a pass is a FULL move)", after.fullmoves === 2, `fullmoves=${after.fullmoves}`);
  check("pass flips the turn", after.turn !== pos.turn);
  check("pass leaves the pieces untouched", boardFen(makeFen(after)) === boardFen(AFTER_E4), boardFen(makeFen(after)));
  check("pass preserves castling rights",
    [...after.castling.white].join() === [...pos.castling.white].join() &&
    [...after.castling.black].join() === [...pos.castling.black].join());
  check("pass FEN is exactly the canonical result",
    makeFen(after) === "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2", makeFen(after));

  // fullmove+1 regardless of which side passed: White passes too
  const w = startPos();
  const wAfter = makeMove(w, nullMove());
  check("a White pass also advances the fullmove number", wAfter.fullmoves === 2, `fullmoves=${wAfter.fullmoves}`);
  check("a White pass flips the turn to Black", wAfter.turn === 1);
  check("a White pass FEN is 'b ... 1 2'",
    makeFen(wAfter) === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 1 2", makeFen(wAfter));
  // and the halfmove clock keeps climbing across consecutive passes
  const twice = makeMove(makeMove(w, nullMove()), nullMove());
  check("two passes: halfmove 2, fullmove 3, White to move",
    twice.halfmoves === 2 && twice.fullmoves === 3 && twice.turn === 0,
    `h=${twice.halfmoves} f=${twice.fullmoves} turn=${twice.turn}`);

  // makeNullMove and the makeMove dispatch agree
  check("makeNullMove === makeMove(nullMove())", makeFen(makeNullMove(pos)) === makeFen(after));
  check("the input position is never mutated",
    pos.epSquare !== null && pos.halfmoves === 0 && pos.fullmoves === 1 && pos.turn === 1);

  // Zobrist: the incrementally maintained key equals a full recompute
  await ensureZobristLoaded();
  const zpos = parseFen(AFTER_E4).value;
  const zafter = makeMove(zpos, nullMove());
  const inc = { lo: zafter.zobristLo, hi: zafter.zobristHi };
  const full = calculateZobrist(zafter);
  check("pass keeps the incremental Zobrist key exact", inc.lo === full.lo && inc.hi === full.hi,
    `${(inc.hi >>> 0).toString(16)}/${(inc.lo >>> 0).toString(16)}`);

  // stateful Board parity
  const st = new Board(AFTER_E4);
  const undo = st.makeMove(NULL_MOVE_WORD);
  check("Board.makeMove(0xffff) applies the same transition", st.toFen() === makeFen(after), st.toFen());
  check("Board null undo is discriminated", undo.isNull === true);
  st.unmakeMove(undo);
  check("unmakeMove restores the exact prior position", st.toFen() === AFTER_E4, st.toFen());
}

// ---- 6. a pass is refused while in check ----
{
  const checked = parseFen(IN_CHECK).value;
  check("fixture is genuinely in check", isCheck(checked) === true);
  check("isNullMoveLegal is false while in check", isNullMoveLegal(checked) === false);
  check("isLegal refuses a pass while in check", isLegal(checked, nullMove()) === false);
  check("parseSan('--') refuses a pass while in check", parseSan("--", checked).ok === false);
  check("parseSan('Z0') refuses a pass while in check", parseSan("Z0", checked).ok === false);
  let threw = false;
  try { makeMove(checked, nullMove()); } catch { threw = true; }
  check("makeMove refuses a pass while in check", threw);
  threw = false;
  try { makeNullMove(checked); } catch { threw = true; }
  check("makeNullMove refuses a pass while in check", threw);
  threw = false;
  try { new Board(IN_CHECK).makeNullMove(); } catch { threw = true; }
  check("Board.makeNullMove refuses a pass while in check", threw);

  // a pass IS legal out of check
  const free = parseFen(AFTER_E4).value;
  check("a pass is legal when not in check", isNullMoveLegal(free) === true && isLegal(free, nullMove()) === true);

  // The verdict must come from the attack tables, NOT the cached `checkers`
  // bitboard: poison the cache so it claims "not in check" and require the
  // pass to still be refused.
  const lyingCache = { ...checked, checkers: { lo: 0, hi: 0 } };
  check("poisoned cache claims not-in-check", isCheck(lyingCache) === false);
  check("the pass is still refused (fresh scan, not the cache)", isNullMoveLegal(lyingCache) === false);
  check("parseSan still refuses with a poisoned cache", parseSan("--", lyingCache).ok === false);
  // ...and the converse: a stale non-empty cache must not refuse a legal pass
  const staleCache = { ...free, checkers: { lo: 1, hi: 0 } };
  check("a stale non-empty cache does not refuse a legal pass", isNullMoveLegal(staleCache) === true);
}

// ---- 7. legalMoves() never contains a pass ----
{
  const POSITIONS = [START, AFTER_E4,
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "n1n5/PPPk4/8/8/8/8/4Kppp/5N1N b - - 0 1",
    "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"];
  let total = 0, bad = 0;
  for (const fen of POSITIONS) {
    const buf = new Uint16Array(256);
    const n = legalMovesInto(parseFen(fen).value, buf);
    total += n;
    for (let i = 0; i < n; i++) if (isNull(buf[i])) bad++;
    forEachLegalMove(parseFen(fen).value, (word) => { if (isNull(word)) bad++; });
    for (const word of new Board(fen).legalMoves()) if (isNull(word)) bad++;
  }
  check(`none of ${total} generated legal moves is a pass`, bad === 0);
  const { Chess } = await import("../dist/chessjs.js");
  let sanLeaks = 0;
  for (const san of new Chess().moves()) if (san === NULL_MOVE_SAN) sanLeaks++;
  check("Chess.moves() never lists a pass", sanLeaks === 0);
}

// ---- 8. chesstree regression: ply/path/FEN stay in step across a pass ----
//
// Before the fix the null branch neither advanced the position/ply/path nor
// descended the mainline, so every later node on the line was one ply out of
// step and carried the PARENT's FEN. Each assertion below targets that.
{
  const pgn = '[Event "T"]\n[Result "*"]\n\n1. e4 -- 2. Nf3 *';
  const data = pgnImport(pgn);
  const root = data.treeParts[0];
  const mainline = [];
  for (let n = root.children[0]; n; n = n.children[0]) mainline.push(n);
  // index safely: a regression that drops the pass must report FAILED checks,
  // not crash on a missing node
  const at = (i) => mainline[i] ?? { san: "<missing>", uci: "<missing>", fen: "<missing>", ply: -1, children: [] };

  check("the pass is kept as a ply (not dropped)", mainline.length === 3, `mainline=${mainline.length}`);
  check("mainline SANs are e4, --, Nf3",
    mainline.map((x) => x.san).join(" ") === "e4 -- Nf3", mainline.map((x) => x.san).join(" "));
  check("plies run 1,2,3 across the pass", mainline.map((x) => x.ply).join(",") === "1,2,3",
    mainline.map((x) => x.ply).join(","));
  check("the pass node carries san '--' and uci '0000'",
    at(1).san === NULL_MOVE_SAN && at(1).uci === NULL_MOVE_UCI, `${at(1).san}/${at(1).uci}`);

  // the regression itself: the pass node FEN must be the RESULT position
  check("pass node FEN is the result position, not the parent's",
    at(1).fen === "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2", at(1).fen);
  check("pass node FEN differs from its parent FEN", at(1).fen !== at(0).fen);
  // and the move AFTER the pass must be parsed from the post-pass position
  check("the move after the pass is parsed from the post-pass position",
    at(2).uci === "g1f3" &&
    at(2).fen === "rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 2",
    `${at(2).uci} ${at(2).fen}`);
  // both agree with an independent engine replay of the same line
  const replay1 = makeMove(startPos(), parseSan("e4", startPos()).value);
  const replay2 = makeMove(replay1, nullMove());
  const replay3 = makeMove(replay2, parseSan("Nf3", replay2).value);
  check("pass node FEN matches an independent engine replay", at(1).fen === makeFen(replay2));
  check("post-pass node FEN matches an independent engine replay", at(2).fen === makeFen(replay3));

  // path bookkeeping: the mainline path resolves node-for-node
  const tree = buildTree(root);
  check("lastPly() counts the pass", tree.lastPly() === 3, String(tree.lastPly()));
  let path = "", walker = root;
  while (walker.children.length > 0) { walker = walker.children[0]; path += walker.id; }
  const nodes = tree.getNodeList(path);
  check("path resolution walks all three plies", nodes.length === 4, `nodes=${nodes.length}`);
  check("path resolution lands on the post-pass node",
    nodes[3] === mainline[2] && tree.nodeAtPath(path) === mainline[2]);
  check("pathIsMainline for the full line", tree.pathIsMainline(path) === true);
  check("the pass node is addressable mid-path", tree.nodeAtPath(path.slice(0, 4)) === mainline[1]);
  check("the pass node is a real parent, not a leaf", at(1).children.length === 1);

  // ctx.path must advance through the pass: a comment on the move AFTER the
  // pass gets a pgn-comment-comment-<full path>-<i> id, and the full path has
  // one chunk per ply — the pass chunk included.
  const commented = pgnImport('[Result "*"]\n\n1. e4 -- 2. Nf3 {after pass} *').treeParts[0];
  let cn = commented.children[0], afterPass = null;
  while (cn) { if (cn.comments !== undefined) afterPass = cn; cn = cn.children[0]; }
  const commentId = afterPass?.comments?.[0]?.id ?? "";
  check("a comment after the pass carries the full path (pass included)",
    afterPass?.san === "Nf3" && commentId === `pgn-comment-comment-${path}-0`, commentId);

  // the exporter emits `--` instead of dropping the ply, and the numbering
  // stays consistent with the FENs (the pass completes a full move)
  const exported = tree.export();
  const movetext = exported.trim().split("\n").pop();
  check("exporter emits the pass as '--'", movetext === "1. e4 -- 2. Nf3 *", movetext);
  // and the export re-imports to the very same tree
  const reimported = pgnImport(exported).treeParts[0];
  let r = reimported.children[0], k = 0, same = true;
  for (; r; r = r.children[0], k++) {
    if (r.san !== mainline[k].san || r.fen !== mainline[k].fen || r.ply !== mainline[k].ply) same = false;
  }
  check("export -> import round-trips the pass exactly", same === true && k === 3, `plies=${k}`);

  // Z0 is the accepted input spelling and normalizes to -- / 0000
  const zPass = pgnImport('[Result "*"]\n\n1. e4 Z0 2. Nf3 *').treeParts[0].children[0].children[0];
  check("Z0 imports as san '--' / uci '0000'", zPass.san === NULL_MOVE_SAN && zPass.uci === NULL_MOVE_UCI);
  check("Z0 also advances the position (same result FEN as '--')",
    zPass.fen === "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2", zPass.fen);

  // `null` is no longer an accepted spelling
  const nul = pgnImport('[Result "*"]\n\n1. e4 null 2. Nf3 *').treeParts[0];
  check("'null' is no longer imported as a pass",
    isNullMoveSan(nul.children[0].children[0]?.san ?? "x") === false);

  // a pass token sitting on an in-check position is skipped, never thrown:
  // the FEN header puts White in check (mate already delivered) with `--` to play
  let threwImport = false, icTree;
  try {
    icTree = pgnImport(`[SetUp "1"]\n[FEN "${IN_CHECK}"]\n[Result "*"]\n\n1. -- *`).treeParts[0];
  } catch { threwImport = true; }
  check("pgnImport never throws on a refused pass", threwImport === false);
  check("a pass refused while in check is skipped, not imported", icTree.children.length === 0,
    `children=${icTree.children.length}`);
  let icTree2;
  try {
    icTree2 = pgnImport('[Result "*"]\n\n1. f3 e5 2. g4 Qh4#').treeParts[0];
  } catch { threwImport = true; }
  check("a normal mating line is unaffected",
    icTree2.children[0].children[0].children[0].children[0].san === "Qh4#");
  // a pass played by a side that is NOT in check is legal and advances the
  // number: here White passes while Black's Qh4+ is still a move away
  const legalPass = pgnImport('[Result "*"]\n\n1. f3 e5 2. g4 -- 3. Qh4# *').treeParts[0];
  let lp = legalPass.children[0], lpPlies = [], lpPassFen = "";
  for (; lp; lp = lp.children[0]) { lpPlies.push(lp.ply); if (isNullMoveSan(lp.san ?? "")) lpPassFen = lp.fen; }
  check("a legal pass is imported and advances the number",
    lpPlies.join(",") === "1,2,3,4" && lpPassFen === "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
    `plies=${lpPlies.join(",")} passFen=${lpPassFen}`);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail > 0 ? 1 : 0);
