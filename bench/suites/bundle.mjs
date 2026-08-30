// bench/suites/bundle.mjs — bundle tree-shake gate (task 2.6).
// esbuild-bundles a consumer importing Chess from `purechess/core`,
// `purechess` (full), and `chessops` (full); reports gzipped sizes and gates:
// core ≥30% smaller than chessops full, full ≤110%. Also verifies parsePgn
// and Chess960 castling table bytes are absent from the core bundle.
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gate } from "./lib/common.mjs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

const ENTRIES = {
  "purechess/core": `import { Chess } from "purechess/core"; export const C = Chess;`,
  "purechess (full)": `import { Chess } from "purechess"; export const C = Chess;`,
  "chessops (full)": `import { Chess } from "chessops"; export const C = Chess;`,
};

async function bundle(entrySource, dir) {
  const entry = join(dir, `entry-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(entry, entrySource);
  const res = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
    nodePaths: [join(REPO, "node_modules")],
    alias: {
      // package.json exports map of the local repo (name is purechess-workstation)
      "purechess/core": join(REPO, "dist/core.js"),
      "purechess/pgn": join(REPO, "dist/pgn.js"),
      "purechess/chess960": join(REPO, "dist/chess960.js"),
      "purechess": join(REPO, "dist/index.js"),
    },
  });
  return Buffer.from(res.outputFiles[0].text, "utf8");
}

export const name = "bundle";

export async function run(opts) {
  console.log(`\n=== suite: bundle (esbuild minified + gzip; tree-shake gate) ===`);
  const dir = mkdtempSync(join(tmpdir(), "purechess-bench-bundle-"));
  const out = {};
  for (const [label, src] of Object.entries(ENTRIES)) {
    const buf = await bundle(src, dir);
    const gz = gzipSync(buf).length;
    out[label] = { raw: buf.length, gz };
    console.log(`  ${label.padEnd(18)} ${buf.length.toLocaleString()} B raw → ${gz.toLocaleString()} B gz`);
  }

  const coreGz = out["purechess/core"].gz;
  const fullGz = out["purechess (full)"].gz;
  const coGz = out["chessops (full)"].gz;
  const coreSaving = (1 - coreGz / coGz) * 100;
  const fullRatio = fullGz / coGz * 100;
  console.log(`  core vs chessops: ${(100 - coreSaving).toFixed(1)}% of size (${coreSaving.toFixed(1)}% smaller)`);
  console.log(`  full vs chessops: ${fullRatio.toFixed(1)}% of size`);

  // Dead-code absence in the core bundle: parsePgn (pgn module) and Chess960
  // (chess960 module / 960 castling tables) must not be reachable from core.
  const coreText = (await bundle(ENTRIES["purechess/core"], dir)).toString("utf8");
  const hasPgn = coreText.includes("parsePgn") || coreText.includes("pgn/");
  const hasChess960 = coreText.includes("Chess960") || coreText.includes("chess960");
  console.log(`  dead-code check: core bundle ${hasPgn ? "INCLUDES parsePgn ✗" : "excludes parsePgn ✓"}; ${hasChess960 ? "INCLUDES Chess960 ✗" : "excludes Chess960 ✓"}`);

  const gates = [
    gate("bundle: purechess/core gzipped ≥30% smaller than chessops full", coreGz <= coGz * 0.70, "≤70% of chessops gz", `${(coreGz / coGz * 100).toFixed(1)}%`),
    gate("bundle: purechess full ≤110% of chessops", fullGz <= coGz * 1.10, "≤110% of chessops gz", `${fullRatio.toFixed(1)}%`),
    gate("bundle: parsePgn + Chess960 tables absent from core bundle", !hasPgn && !hasChess960, "absent", `${hasPgn ? "parsePgn present " : ""}${hasChess960 ? "Chess960 present" : ""}`.trim() || "absent"),
  ];
  return { metrics: out, gates };
}
