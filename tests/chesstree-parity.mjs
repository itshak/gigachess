// tests/chesstree-parity.mjs — chesstree-compat parity suite (change
// turbochess-adopt, tasks 5.2). Cross-checks every output of the clean-room
// `dist/chesstree.js` facade against the GPL-3.0 `@itshak/chesstree@2.0.0`
// DEV-ONLY baseline (never imported from src/ — same policy as
// tests/compat-chessops.mjs). Castling UCI is compared under the ADR-013
// e1h1≡e1g1 equivalence (our canonical encoding; chessops renders e1g1).
import fs from "node:fs";
import path from "node:path";

// The baseline bundles chessops@0.14 whose nested package.json says
// "type": "module" while shipping CJS — the workstation patches this in its
// postinstall (scripts/patch-chessops-package.mjs). Apply the same idempotent
// patch here before importing the baseline.
for (const rel of ["@itshak/chesstree/node_modules/chessops", "chessops"]) {
  const pkgPath = path.resolve("node_modules", rel, "package.json");
  if (!fs.existsSync(pkgPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const cjsEntry = (pkg.exports ? JSON.stringify(pkg.exports) : String(pkg.main ?? "")).includes("cjs");
  if (cjsEntry && pkg.type === "module") {
    delete pkg.type;
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`  patched ${path.relative(process.cwd(), pkgPath)} (CJS interop, same as workstation postinstall)`);
  }
}

const chesstreeMod = await import("@itshak/chesstree");
const coImport = chesstreeMod.pgnImport ?? chesstreeMod.default?.pgnImport;
const coBuild = chesstreeMod.buildTree ?? chesstreeMod.default?.buildTree;
const coExport = chesstreeMod.pgnExport ?? chesstreeMod.default?.pgnExport;
const { pgnImport: tcImport, buildTree: tcBuild, pgnExport: tcExport } = await import("../dist/chesstree.js");

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

/** Castling UCI normalization: our canonical king-to-rook (e1h1) vs chessops
 * king-to-landing (e1g1) — equivalent under ADR-013. */
const normUci = (uci) =>
  uci
    .replace(/^e1h1$/, "e1g1").replace(/^e1a1$/, "e1c1")
    .replace(/^e8h8$/, "e8g8").replace(/^e8a8$/, "e8c8");

/** Deep structural comparison ignoring nondeterministic node ids (only path
 * resolution and comment-id SCHEME are checked, matching the baseline's
 * pgn-comment-comment-<path>-<index> scheme). */
function stripNode(node, pathPrefix = "") {
  const full = pathPrefix + node.id;
  return {
    san: node.san,
    uci: normUci(node.uci ?? ""),
    fen: node.fen,
    ply: node.ply,
    comments: (node.comments ?? []).map((c, i) => ({
      text: c.text,
      idScheme: c.id.startsWith("pgn-comment-comment-") && c.id.endsWith(`-${i}`),
    })),
    glyphs: node.glyphs,
    kids: node.children.map((c) => stripNode(c, full)),
  };
}

function compareTree(name, pgn) {
  let co, coErr;
  try { co = coImport(pgn); } catch (e) { coErr = e; }
  const tc = tcImport(pgn);
  if (coErr !== undefined) {
    // baseline throws on invalid positions/moves; we must NOT throw and must
    // return an empty/degenerate result consumers can fall back from
    check(`${name}: baseline throws, ours never throws`, Array.isArray(tc.treeParts));
    return { co: undefined, tc };
  }
  check(`${name}: treeParts count`, co.treeParts.length === tc.treeParts.length,
    `(${co.treeParts.length} vs ${tc.treeParts.length})`);
  for (let g = 0; g < Math.min(co.treeParts.length, tc.treeParts.length); g++) {
    const a = JSON.stringify(stripNode(co.treeParts[g]));
    const b = JSON.stringify(stripNode(tc.treeParts[g]));
    check(`${name}: game ${g} tree structure`, a === b);
    if (a !== b && process.env.VERBOSE) {
      console.log(`    CO: ${a.slice(0, 600)}`);
      console.log(`    TC: ${b.slice(0, 600)}`);
    }
  }
  check(`${name}: game metadata`, JSON.stringify(co.game) === JSON.stringify(tc.game));
  if (JSON.stringify(co.game) !== JSON.stringify(tc.game) && process.env.VERBOSE) {
    console.log(`    CO game: ${JSON.stringify(co.game)}`);
    console.log(`    TC game: ${JSON.stringify(tc.game)}`);
  }
  return { co, tc };
}

function compareExport(name, co, tc) {
  if (!co) return;
  const coTxt = coExport.renderFullTxt({ data: { game: co.game }, tree: coBuild(co.treeParts[0]) });
  const tcTxt = tcExport.renderFullTxt({ data: { game: tc.game }, tree: tcBuild(tc.treeParts[0]) });
  check(`${name}: renderFullTxt bytes`, coTxt === tcTxt);
  if (coTxt !== tcTxt && process.env.VERBOSE) {
    console.log(`    CO: ${JSON.stringify(coTxt)}`);
    console.log(`    TC: ${JSON.stringify(tcTxt)}`);
  }
}

// ---------- corpus ----------
console.log("chesstree-compat parity — turbochess/chesstree vs @itshak/chesstree@2.0.0 (dev baseline)\n");

// 1. Standard start, variations, comments
const r1 = compareTree("standard+variations",
  '[Event "T"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 {best} e5 (1... c5 2. Nf3 {sharp}) (1... e6) 2. Nf3 Nc6 3. Bb5 1-0');
compareExport("standard+variations", r1.co, r1.tc);

// 2. Castling (O-O), captures, checks
const r2 = compareTree("castling+captures",
  '[Event "C"]\n[Result "*"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 Be7 6. e3 O-O 7. Qc2 *');
compareExport("castling+captures", r2.co, r2.tc);

// 3. FEN header start
const r3 = compareTree("fen-header",
  '[SetUp "1"]\n[FEN "k7/8/8/8/8/8/8/K5Q1 w - - 0 1"]\n\n1. Qg7 {edge} *');
compareExport("fen-header", r3.co, r3.tc);

// 4. Clocks stay as raw comment text (baseline behavior)
const r4 = compareTree("clock-comments",
  '[Event "L"]\n[Result "*"]\n\n1. e4 {[%clk 0:05:00]} c6 {[%clk 0:04:57]} 2. d4 *');
compareExport("clock-comments", r4.co, r4.tc);

// 5. Promotion SAN
const r5 = compareTree("promotion",
  '[Event "P"]\n[Result "*"]\n\n1. h4 g5 2. h5 gxh5 3. h6 h4 4. hxg7 h3 5. gxh8=Q h2 *');
compareExport("promotion", r5.co, r5.tc);

// 6. Multi-game input: baseline parses only the first game
const r6 = compareTree("multi-game",
  '[Event "One"]\n\n1. a3 *\n\n[Event "Two"]\n\n1. b3 *');

// 7. Comment before the first move of a variation
const r7 = compareTree("variation-lead-comment",
  '[Result "*"]\n\n1. e4 e5 2. Nf3 (2. f4 {attack} exf4 3. Nf3) 2... Nc6 *');
compareExport("variation-lead-comment", r7.co, r7.tc);

// 8. Garbage input: baseline throws; we return empty treeParts, never throw
{
  let threw = false;
  let tc;
  try { tc = tcImport("this is not a pgn ]{"); } catch { threw = true; }
  check("garbage: ours never throws", !threw && Array.isArray(tc.treeParts) && tc.treeParts.length === 0);
}

// ---------- wrapper semantics (independent trees, same expectations) ----------
{
  const pgn = '[Event "W"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *';
  const coData = coImport(pgn), tcData = tcImport(pgn);
  const coW = coBuild(coData.treeParts[0]), tcW = tcBuild(tcData.treeParts[0]);
  const coRoot = coData.treeParts[0], tcRoot = tcData.treeParts[0];
  const coE4 = coRoot.children[0], tcE4 = tcRoot.children[0];

  check("wrapper: nodeAtPath root", coW.nodeAtPath("") === coRoot && tcW.nodeAtPath("") === tcRoot);
  check("wrapper: nodeAtPath ply1 resolves", coW.nodeAtPath(coE4.id)?.san === "e4" && tcW.nodeAtPath(tcE4.id)?.san === "e4");
  const coDeep = coE4.id + coE4.children[0].id + coE4.children[0].children[0].id;
  const tcDeep = tcE4.id + tcE4.children[0].id + tcE4.children[0].children[0].id;
  check("wrapper: deep nodeAtPath", coW.nodeAtPath(coDeep)?.san === tcW.nodeAtPath(tcDeep)?.san);
  check("wrapper: getNodeList includes root + path",
    coW.getNodeList(coDeep).length === tcW.getNodeList(tcDeep).length &&
    coW.getNodeList(coDeep)[0] === coRoot && tcW.getNodeList(tcDeep)[0] === tcRoot);
  check("wrapper: lastPly", coW.lastPly() === tcW.lastPly(), `(${coW.lastPly()} vs ${tcW.lastPly()})`);
  check("wrapper: pathIsMainline", coW.pathIsMainline(coDeep) === true && tcW.pathIsMainline(tcDeep) === true);
  check("wrapper: pathExists false on bogus", coW.pathExists("ZZ") === false && tcW.pathExists("ZZ") === false);

  // addNode: no dedup, returns path+id (baseline semantics)
  const node = (id, san) => ({ id, ply: 3, san, fen: "f", uci: "", children: [] });
  const coP = coW.addNode(node("QX", "c5"), coE4.id);
  const tcP = tcW.addNode(node("QX", "c5"), tcE4.id);
  check("wrapper: addNode returns path+id", typeof coP === "string" && typeof tcP === "string" &&
    coP.endsWith("QX") && tcP.endsWith("QX"));
  check("wrapper: addNode appends (no dedup)",
    coE4.children.length === tcE4.children.length &&
    coE4.children[coE4.children.length - 1].san === tcE4.children[tcE4.children.length - 1].san);

  // setCommentAt / deleteCommentAt: replace-by-id, filter
  coW.setCommentAt({ id: "k1", text: "hello" }, coE4.id);
  tcW.setCommentAt({ id: "k1", text: "hello" }, tcE4.id);
  check("wrapper: setCommentAt appends", JSON.stringify(coE4.comments) === JSON.stringify(tcE4.comments));
  coW.setCommentAt({ id: "k1", text: "updated" }, coE4.id);
  tcW.setCommentAt({ id: "k1", text: "updated" }, tcE4.id);
  check("wrapper: setCommentAt replaces same id", JSON.stringify(coE4.comments) === JSON.stringify(tcE4.comments));
  coW.deleteCommentAt("k1", coE4.id);
  tcW.deleteCommentAt("k1", tcE4.id);
  check("wrapper: deleteCommentAt filters", JSON.stringify(coE4.comments ?? []) === JSON.stringify(tcE4.comments ?? []));

  check("wrapper: parentNode", coW.parentNode(coE4.id) === coRoot && tcW.parentNode(tcE4.id) === tcRoot);

  // export()/pgn() — used by Game.tsx localStorage persistence. The baseline
  // wrapper has no export/pgn (Game.tsx typeof-guards them), so we verify our
  // export parses with BOTH importers and reproduces the same structure.
  const tcPgn = tcW.export();
  const tcRe = tcImport(tcPgn);
  const coRe = coImport(tcPgn);
  check("wrapper: export round-trips through both importers",
    JSON.stringify(stripNode(tcRe.treeParts[0])) === JSON.stringify(stripNode(coRe.treeParts[0])));
  check("wrapper: export movetext matches baseline renderFullTxt movetext",
    tcPgn.includes("1. e4 e5 (1... c5) 2. Nf3 *"));
}

// ---- unified Chess.toTree/loadTree (change turbochess-unified-api-and-perf,
// task 3.1) — root Chess exposes native tree navigation + PGN rendering ----
{
  const { Chess: UnifiedChess, makeFen } = await import("../dist/index.js");
  const g = new UnifiedChess();
  for (const san of ["e4", "e5", "Nf3", "Nc6", "Bb5"]) g.move(san);
  const tree = g.toTree();
  check("toTree returns a TreeWrapper", typeof tree.nodeAtPath === "function" && typeof tree.pgn === "function");
  check("toTree lastPly === 5", tree.lastPly() === 5, String(tree.lastPly()));
  // build the mainline path by walking first children (ids are wrapper-assigned)
  let mainPath = "";
  let walker = tree.root;
  while (walker.children.length > 0) {
    walker = walker.children[0];
    mainPath += walker.id;
  }
  const nodes = tree.getNodeList(mainPath);
  check("toTree mainline node chain", nodes.length === 6 && nodes[1].san === "e4" && nodes[5].san === "Bb5");
  check("toTree node FENs track the game", nodes[3].fen === makeFen(g.historyEntries[2].after));
  check("toTree recursive PGN renders movetext", tree.pgn().includes("1. e4 e5 2. Nf3 Nc6 3. Bb5"));
  // addNode / setCommentAt through the wrapper
  const path = mainPath;
  tree.setCommentAt({ id: "c1", text: "Ruy Lopez" }, path);
  check("toTree wrapper setCommentAt", tree.nodeAtPath(path).comments?.[0]?.text === "Ruy Lopez");
  // loadTree: import PGN, replay mainline into live state
  const pgn = '[Event "t"]\n[Site "?"]\n[Result "*"]\n\n1. d4 d5 2. c4 *';
  const g2 = new UnifiedChess();
  const tree2 = g2.loadTree(pgn);
  check("loadTree returns a wrapper", typeof tree2.pgn === "function");
  check("loadTree replays mainline into the game", g2.history().length === 3 && g2.fen().startsWith("rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq"), g2.fen().slice(0, 30));
  check("loadTree navigates imported tree", tree2.nodeAtPath(tree2.longestValidPath("zzzzzzzzzz")) !== undefined);
  // chessops subpath exposes the integrated tree API (task 3.3)
  const co = await import("../dist/chessops/index.js");
  check("turbochess/chessops exposes buildTree + pgnImport", typeof co.buildTree === "function" && typeof co.pgnImport === "function");
  const coData = co.pgnImport(pgn);
  // mainline is a nested chain under the root (chesstree convention)
  let chain = 0, node = coData.treeParts[0];
  while (node.children.length > 0) { node = node.children[0]; chain++; }
  check("chessops.pgnImport builds mainline chain", coData.treeParts.length > 0 && chain === 3);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail === 0 ? 0 : 1);
