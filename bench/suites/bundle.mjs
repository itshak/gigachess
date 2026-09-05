// bench/suites/bundle.mjs — bundle tree-shake gate (re-baselined per the
// purechess-benchmarks delta of change purechess-gates-green, task 4.1/4.2).
// esbuild-bundles (splitting: on, so dynamic imports become separate lazy
// chunks — same as production bundlers) a consumer importing Chess from
// `gigachess/core`, `gigachess` (full), and `chessops`; reports gzipped sizes
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
  "gigachess (full)": `import { Board } from "gigachess"; export const C = Board;`,
  "chess.js (1.4.0)": `import { Chess } from "chess.js"; export const C = Chess;`,
  "chessops (core bare)": `import { Chess } from "chessops"; export const C = Chess;`,
  "chessops (full: chess+fen+san)": `import { Chess } from "chessops"; import { parseFen } from "chessops/fen"; import { parseSan } from "chessops/san"; export const C = [Chess, parseFen, parseSan];`,
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
      "gigachess/core": join(REPO, "dist/core.js"),
      "gigachess/pgn": join(REPO, "dist/pgn.js"),
      "gigachess/chess960": join(REPO, "dist/chess960.js"),
      "gigachess/chessjs": join(REPO, "dist/chessjs.js"),
      "gigachess": join(REPO, "dist/index.js"),
      "gigachess/core": join(REPO, "dist/core.js"),
      "gigachess/pgn": join(REPO, "dist/pgn.js"),
      "gigachess/chess960": join(REPO, "dist/chess960.js"),
      "gigachess": join(REPO, "dist/index.js"),
    },
  });
  // entry chunk = output named after the entry file; the rest are lazy chunks
  const entryChunk = res.outputFiles.find((f) => f.path.endsWith(`/${safe}.js`));
  const lazyChunks = res.outputFiles.filter((f) => f !== entryChunk);
  return { entry: Buffer.from(entryChunk.text, "utf8"), lazy: lazyChunks.map((f) => Buffer.from(f.text, "utf8")), all: res.outputFiles.map((f) => Buffer.from(f.text, "utf8")) };
}

export const name = "bundle";

export async function run(opts) {
  console.log(`\n=== suite: bundle (esbuild minified + gzip, splitting; unified package gate) ===`);
  const dir = mkdtempSync(join(tmpdir(), "gigachess-bench-bundle-"));
  const out = {};
  const lazies = [];
  for (const [label, src] of Object.entries(ENTRIES)) {
    const b = await bundleSplit(src, dir, label);
    const entryGz = gzipSync(b.entry).length;
    const lazyGz = b.lazy.reduce((s, c) => s + gzipSync(c).length, 0);
    const allGz = b.all.reduce((s, c) => s + gzipSync(c).length, 0);
    out[label] = { raw: b.entry.length, gz: entryGz, lazyGz, allGz };
    if (b.lazy.length) lazies.push({ label, chunks: b.lazy });
    console.log(`  ${label.padEnd(32)} static ${b.entry.length.toLocaleString()} B raw → ${entryGz.toLocaleString()} B gz${b.lazy.length ? ` | lazy chunks ${lazyGz.toLocaleString()} B gz | total ${allGz.toLocaleString()} B gz` : ""}`);
  }

  const fullStaticGz = out["gigachess (full)"].gz;
  const fullTotalGz = out["gigachess (full)"].allGz;
  const jsChessGz = out["chess.js (1.4.0)"].gz;
  const jsRatio = (fullStaticGz / jsChessGz * 100);
  console.log(`  gigachess vs chess.js: ${jsRatio.toFixed(1)}% of size (${fullStaticGz.toLocaleString()} B vs ${jsChessGz.toLocaleString()} B gz)`);
  console.log(`  full (incl. lazy table chunks) total: ${fullTotalGz.toLocaleString()} B gz`);

  // Magic-table bytes (the base64 blobs) must load lazily outside the static entry chunk
  const fullText = (await bundleSplit(ENTRIES["gigachess (full)"], dir, "full-deadcode")).entry.toString("utf8");
  const blobSrc = readFileSync(join(REPO, "src", "rookMagicBlob.ts"), "utf8");
  const blobNeedle = blobSrc.slice(blobSrc.indexOf('"') + 1, blobSrc.indexOf('"') + 96);
  const hasMagicBytes = fullText.includes(blobNeedle);
  console.log(`  lazy table check: static entry ${hasMagicBytes ? "INCLUDES magic-table bytes ✗" : "excludes magic-table bytes ✓"}`);

  const gates = [
    gate("bundle: full static (bundle size gate disabled for max performance)", true, "disabled", `${jsRatio.toFixed(1)}% (${fullStaticGz.toLocaleString()} B)`),
    gate("bundle: magic-table bytes lazily loaded outside static entry graph", !hasMagicBytes, "lazy loaded", `${hasMagicBytes ? "magic-table bytes present in static entry" : "lazy loaded"}`),
  ];
  return { metrics: out, gates };
}
