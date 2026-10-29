// tests/chesstree-glyphs.mjs — annotation glyphs in the chesstree facade
// (ADR-019). The GPL baseline drops NAGs on import and glyphs on export, so
// these are checked on their own rather than in chesstree-parity.mjs:
// - import turns every NAG into a glyph (`{ id, symbol, name }`), move and
//   position assessments alike, and keeps an unknown NAG as `$n`;
// - export writes each glyph back as its NAG, after the move;
// - export → import → export is stable.
import { pgnImport, buildTree, pgnExport, NAG_GLYPHS, glyphForNag } from "../dist/chesstree.js";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

const movetext = (pgn) => pgn.split("\n").pop();
const exportOf = (data) =>
  pgnExport.renderFullTxt({ data: { game: data.game }, tree: buildTree(data.treeParts[0]) });

console.log("chesstree glyphs — NAG import and export\n");

// 1. Import: suffix glyphs, numeric NAGs and position NAGs become glyphs
{
  const data = pgnImport('[Result "*"]\n\n1. e4! $14 e5?! 2. Nf3 $146 $45 *');
  const e4 = data.treeParts[0].children[0];
  const e5 = e4.children[0];
  const nf3 = e5.children[0];
  check("import: e4! $14 → ! and ⩲", JSON.stringify(e4.glyphs?.map((g) => g.symbol)) === JSON.stringify(["!", "⩲"]));
  check("import: glyph carries its NAG id and name", e4.glyphs?.[1]?.id === 14 && e4.glyphs?.[1]?.name === "White is slightly better");
  check("import: e5?! → ?!", e5.glyphs?.[0]?.symbol === "?!" && e5.glyphs?.[0]?.id === 6);
  check("import: unknown NAG kept as $45", nf3.glyphs?.[1]?.symbol === "$45" && nf3.glyphs?.[1]?.id === 45);
  const plain = pgnImport('[Result "*"]\n\n1. e4 e5 *').treeParts[0].children[0];
  check("import: a move without NAGs has no glyphs", plain.glyphs === undefined);
}

// 2. Export writes each glyph as its NAG and round-trips
{
  const pgn = '[Result "*"]\n\n1. e4 $1 $14 e5 $6 2. Nf3 $146 $45 (2. f4 $5 $13) *';
  const once = exportOf(pgnImport(pgn));
  const twice = exportOf(pgnImport(once));
  check("export: NAGs after the move", movetext(once) === "1. e4 $1 $14 e5 $6 2. Nf3 $146 $45 (2. f4 $5 $13) *", movetext(once));
  check("export → import → export is stable", once === twice);
}

// 3. setGlyphsAt with a symbol only (no id) still exports its NAG
{
  const data = pgnImport('[Result "*"]\n\n1. e4 e5 *');
  const tree = buildTree(data.treeParts[0]);
  const e4 = tree.root.children[0];
  tree.setGlyphsAt([{ symbol: "!?", name: "Interesting move" }, { symbol: "±", name: "White is better" }], e4.id);
  tree.setGlyphsAt([{ symbol: "+-", name: "White is winning" }], e4.id + e4.children[0].id);
  const txt = movetext(pgnExport.renderFullTxt({ data: { game: data.game }, tree }));
  check("setGlyphsAt: symbols map to NAGs", txt === "1. e4 $5 $16 e5 $18 *", txt);
}

// 4. The table: every NAG maps to a distinct symbol and back
{
  const entries = Object.values(NAG_GLYPHS);
  const symbols = new Set(entries.map((g) => g.symbol));
  check("table: symbols are distinct", symbols.size === entries.length);
  check("table: glyphForNag returns a copy", glyphForNag(1) !== NAG_GLYPHS[1] && glyphForNag(1).symbol === "!");
  const all = entries.map((g) => `$${g.id}`).join(" ");
  const out = movetext(exportOf(pgnImport(`[Result "*"]\n\n1. e4 ${all} *`)));
  check("table: every NAG round-trips", out === `1. e4 ${all} *`, out);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail > 0 ? 1 : 0);
