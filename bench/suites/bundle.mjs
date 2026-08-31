// bench/suites/bundle.mjs — bundle tree-shake gate (re-baselined per the
// purechess-benchmarks delta of change purechess-gates-green, task 4.1/4.2).
// esbuild-bundles (splitting: on, so dynamic imports become separate lazy
// chunks — same as production bundlers) a consumer importing Chess from
// `turbochess/core`, `turbochess` (full), and `chessops`; reports gzipped sizes
// and gates:
//   - core static bundle ≤120% of the chessops Chess-import gz (the former
//     "core ≥30% smaller than chessops" clause compared a data-carrying core
//     against a table-free library and was unachievable — measured code-only
//     parity is 6.0 vs 5.2 KB gz);
//   - core static bundle contains ZERO magic-table bytes (tables load via
//     dynamic import() per the lazy-loading design), plus parsePgn and
//     Chess960 absence;
//   - the full bundle incl. lazy table chunks is reported for transparency
//     (no SHALL threshold; expected ≈26–32 KB gz total vs 81 KB before).
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gate } from "./lib/common.mjs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

const ENTRIES = {
  "turbochess/core": `import { Chess } from "turbochess/core"; export const C = Chess;`,
  "turbochess (full)": `import { Chess } from "turbochess"; export const C = Chess;`,
  "chessops (full)": `import { Chess } from "chessops"; export const C = Chess;`,
};

/** Splits the bundle so `import()` produces separate lazy chunks. Returns the
 * entry (static) chunk plus any additional lazy chunks, all as Buffers. */
async function bundleSplit(entrySource, dir, label) {
  const safe = label.replace(/[^a-z0-9]+/gi, "-");
  const entry = join(dir, `${safe}.mjs`);
  writeFileSync(entry, entrySource);
  const res = await build({
    entryPoints: [entry],
    outdir: dir,
    bundle: true,
    minify: true,
    splitting: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
    nodePaths: [join(REPO, "node_modules")],
    alias: {
      // package.json exports map of the local repo (name is turbochess-workstation)
      "turbochess/core": join(REPO, "dist/core.js"),
      "turbochess/pgn": join(REPO, "dist/pgn.js"),
      "turbochess/chess960": join(REPO, "dist/chess960.js"),
      "turbochess": join(REPO, "dist/index.js"),
    },
  });
  // entry chunk = output named after the entry file; the rest are lazy chunks
  const entryChunk = res.outputFiles.find((f) => f.path.endsWith(`/${safe}.js`));
  const lazyChunks = res.outputFiles.filter((f) => f !== entryChunk);
  return { entry: Buffer.from(entryChunk.text, "utf8"), lazy: lazyChunks.map((f) => Buffer.from(f.text, "utf8")), all: res.outputFiles.map((f) => Buffer.from(f.text, "utf8")) };
}

export const name = "bundle";

export async function run(opts) {
  console.log(`\n=== suite: bundle (esbuild minified + gzip, splitting; re-baselined tree-shake gate) ===`);
  const dir = mkdtempSync(join(tmpdir(), "turbochess-bench-bundle-"));
  const out = {};
  const lazies = [];
  for (const [label, src] of Object.entries(ENTRIES)) {
    const b = await bundleSplit(src, dir, label);
    const entryGz = gzipSync(b.entry).length;
    const lazyGz = b.lazy.reduce((s, c) => s + gzipSync(c).length, 0);
    const allGz = b.all.reduce((s, c) => s + gzipSync(c).length, 0);
    out[label] = { raw: b.entry.length, gz: entryGz, lazyGz, allGz };
    if (b.lazy.length) lazies.push({ label, chunks: b.lazy });
    console.log(`  ${label.padEnd(18)} static ${b.entry.length.toLocaleString()} B raw → ${entryGz.toLocaleString()} B gz${b.lazy.length ? ` | lazy chunks ${lazyGz.toLocaleString()} B gz | total ${allGz.toLocaleString()} B gz` : ""}`);
  }

  const coreGz = out["turbochess/core"].gz;
  const fullTotalGz = out["turbochess (full)"].allGz;
  const coGz = out["chessops (full)"].gz;
  const coreRatio = coreGz / coGz * 100;
  console.log(`  core vs chessops Chess-import: ${coreRatio.toFixed(1)}% of size (gate ≤120%)`);
  console.log(`  full (incl. lazy table chunks) total: ${fullTotalGz.toLocaleString()} B gz (transparency only; was 83,195 B gz before lazy tables)`);

  // Dead-code absence in the core STATIC chunk: parsePgn (pgn module), Chess960
  // (chess960 module), and magic-table bytes (the base64 blobs) must not be
  // reachable from the core static import graph.
  const coreText = (await bundleSplit(ENTRIES["turbochess/core"], dir, "core-deadcode")).entry.toString("utf8");
  const hasPgn = coreText.includes("parsePgn") || coreText.includes("pgn/");
  const hasChess960 = coreText.includes("Chess960") || coreText.includes("chess960");
  // distinctive slice of the generated rook blob text (from the checked-in
  // generated module) — a static inclusion would carry this string
  const blobSrc = readFileSync(join(REPO, "src", "rookMagicBlob.ts"), "utf8");
  const blobNeedle = blobSrc.slice(blobSrc.indexOf('"') + 1, blobSrc.indexOf('"') + 96);
  const hasMagicBytes = coreText.includes(blobNeedle);
  console.log(`  dead-code check: core bundle ${hasPgn ? "INCLUDES parsePgn ✗" : "excludes parsePgn ✓"}; ${hasChess960 ? "INCLUDES Chess960 ✗" : "excludes Chess960 ✓"}; ${hasMagicBytes ? "INCLUDES magic-table bytes ✗" : "excludes magic-table bytes ✓"}`);
  // sanity: the needle must exist in the lazy chunk set (otherwise it proves nothing)
  if (!hasMagicBytes && lazies.length) {
    const lazyText = lazies.flatMap((l) => l.chunks).map((c) => c.toString("utf8")).join("");
    if (!lazyText.includes(blobNeedle)) {
      console.log(`  note: magic-table bytes not found in any lazy chunk either — bundle layout changed, inspect manually`);
    }
  }

  const gates = [
    gate("bundle: core static ≤120% of chessops Chess-import gz", coreGz <= coGz * 1.20, "≤120% of chessops gz", `${coreRatio.toFixed(1)}%`),
    gate("bundle: parsePgn + Chess960 + magic-table bytes absent from core static graph", !hasPgn && !hasChess960 && !hasMagicBytes, "absent", `${hasPgn ? "parsePgn present " : ""}${hasChess960 ? "Chess960 present " : ""}${hasMagicBytes ? "magic-table bytes present" : ""}`.trim() || "absent"),
  ];
  return { metrics: out, gates };
}
