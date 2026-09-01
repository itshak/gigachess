// bench/suites/lib/common.mjs — shared harness foundation for the real-world
// benchmark suites (change: purechess-bench-real, task 1.1).
//
// Methodology (purechess-benchmarks spec, amended): 3 warmup iterations are
// run and excluded, then the median of 20 timed runs is reported alongside
// p10/p90. `global.gc()` is forced before every iteration (--expose-gc is
// mandatory). The clock is performance.now().
//
// Driver decision (design D1 fallback rule): tinybench's setup/teardown hooks
// run once per Task, not per iteration, so they cannot provide the per-
// iteration forced-GC granularity the spec mandates. We therefore use the
// sanctioned hand-rolled performance.now() loop implementing the identical
// methodology. Recorded in bench/README.md.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

// Pinned Node versions (see bench/README.md): the spec pin (v22.5.0) and the
// dev-verified version. Anything else fails fast; BENCH_ALLOW_NODE=1 overrides.
export const PINNED_NODE_VERSIONS = ["v22.5.0", "v24.19.0"];

export const WARMUPS = 3;
export const RUNS = 20;

export const CORPORA = {
  lichessZst: {
    path: "bench/data/lichess_db_standard_rated_2013-01.pgn.zst",
    sha256: "aa40b3671fa3cf1072eb182892cd90b0e1e003a4a5943492f64b77e7f3fd1635",
  },
  lichessSample: {
    path: "bench/data/lichess_db.sample.pgn",
    sha256: "f5c0644769394e3169828dd6f224ab3204bb83f40fb535396e3de076ed7dc0f8",
  },
  perftsuite: {
    path: "bench/data/perftsuite.epd",
    sha256: "cb27ea3a61e11e8466ab4f76305e5db8f5de47eb413a723398217d490dfdab41",
  },
  wac150: {
    path: "bench/data/wac_150.epd",
    sha256: "54a984ab7a1ba74ae021ab2a646fc157933995722b90321ea9de9a33d1ed381c",
  },
  samplefen1000: {
    path: "bench/data/samplefen1000.epd",
    // hash recorded in bench/README.md; verified when the corpus is used
    sha256: "88ff90cfa8bd67593d044ea245ccdc1b3f82be2a3c9ea2d8c2b3efe6166b72aa",
  },
};

export function fail(msg) {
  console.error(`\n[bench-real] FATAL: ${msg}`);
  process.exit(2);
}

export function assertEnvironment() {
  const v = process.version;
  if (!PINNED_NODE_VERSIONS.includes(v) && process.env.BENCH_ALLOW_NODE !== "1") {
    fail(
      `Node ${v} is not a pinned version (${PINNED_NODE_VERSIONS.join(", ")}). ` +
      `See bench/README.md for the pinned versions. Override with BENCH_ALLOW_NODE=1.`
    );
  }
  if (typeof global.gc !== "function") {
    fail(
      "global.gc() is unavailable — the spec mandates forced GC between iterations. " +
      "Re-run with: node --expose-gc bench/bench-real.mjs  (npm run bench:real wires this)."
    );
  }
  if (!existsSync(join(REPO_ROOT, "dist", "index.js"))) {
    fail("dist/ not found — run `npm run build` before benching.");
  }
}

export function sha256File(abs) {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}


// ---------------------------------------------------------------------------
// Measurement: 3 warmups excluded, median of 20 runs, global.gc() forced
// between iterations, performance.now() clock.
// ---------------------------------------------------------------------------
export function measure(fn, label = "") {
  for (let i = 0; i < WARMUPS; i++) {
    global.gc();
    fn();
  }
  const samples = new Array(RUNS);
  for (let i = 0; i < RUNS; i++) {
    global.gc();
    const t0 = performance.now();
    fn();
    samples[i] = performance.now() - t0;
    // Real-time progress (turbochess-unified-api-and-perf, task 4.2 / spec:
    // the harness SHALL emit live progress during long measurement cycles so
    // contributors and CI never perceive a hang). Suites that don't pass a
    // label keep the previous silent behavior.
    if (label) {
      process.stdout.write(`\r    ${label} run ${String(i + 1).padStart(2)}/${RUNS} — ${samples[i].toFixed(0)} ms   `);
    }
  }
  if (label) process.stdout.write("\r" + " ".repeat(60) + "\r");
  samples.sort((a, b) => a - b);
  const q = (p) => samples[Math.min(RUNS - 1, Math.floor(p * RUNS))];
  return { median: q(0.5), p10: q(0.1), p90: q(0.9), samples };
}

export function thr(count, ms) {
  return count / (ms / 1000);
}

export function peakHeapMb() {
  return Math.round(process.memoryUsage().heapUsed / 1048576);
}

// ---------------------------------------------------------------------------
// PGN corpus handling
// ---------------------------------------------------------------------------

/** Splits a multi-game PGN text into at most `maxGames` game strings. */
export function splitGames(text, maxGames = Infinity) {
  const games = [];
  if (maxGames <= 0) return games;
  const re = /\n\n(?=\[Event\s)/g;
  let start = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    games.push(text.slice(start, m.index));
    start = m.index + 2;
    if (games.length >= maxGames) return games;
  }
  const last = text.slice(start);
  if (last.trim()) games.push(last);
  return games;
}

/**
 * Chunked PGN reader (task 1.1): yields complete games from `text`, consuming
 * the text in `chunkSize` slices (streaming buffering at that granularity).
 */
export function* chunkedGames(text, chunkSize, maxGames = Infinity) {
  let pos = 0;
  let buf = "";
  let yielded = 0;
  while (pos < text.length && yielded < maxGames) {
    const end = Math.min(pos + chunkSize, text.length);
    buf += text.slice(pos, end);
    pos = end;
    let idx;
    while (yielded < maxGames && (idx = buf.search(/\n\n(?=\[Event\s)/)) !== -1) {
      yield buf.slice(0, idx);
      yielded++;
      buf = buf.slice(idx + 2);
    }
  }
  if (yielded < maxGames && buf.trim()) {
    yield buf;
    yielded++;
  }
}

let lichessTextCache; // decompressed corpus, cached across suites in-process

/**
 * Decompresses the pinned Lichess .zst. Lichess DB files interleave standard
 * zstd frames with self-describing "skippable" metadata frames (magics
 * 0x184D2A50..0x184D2A5F); Node's zstd decoder rejects skippable frames
 * (ZSTD_error_prefix_unknown), so we demux: skip each skippable frame (8-byte
 * header + payload), stream-decompress each real frame segment, concatenate.
 */
export async function decompressLichessZst(abs) {
  const { pipeline } = await import("node:stream/promises");
  const { Readable } = await import("node:stream");
  const { createZstdDecompress } = await import("node:zlib");
  const buf = readFileSync(abs);
  const SKIPPABLE_MIN = 0x184d2a50, SKIPPABLE_MAX = 0x184d2a5f;
  const candidates = [];
  for (
    let off = buf.indexOf(Buffer.from([0x50, 0x2a, 0x4d, 0x18]));
    off !== -1;
    off = buf.indexOf(Buffer.from([0x50, 0x2a, 0x4d, 0x18]), off + 1)
  ) {
    if (off + 8 > buf.length) continue;
    const magic = buf.readUInt32LE(off);
    const size = buf.readUInt32LE(off + 4);
    if (magic >= SKIPPABLE_MIN && magic <= SKIPPABLE_MAX && size < 1_048_576 && off + 8 + size <= buf.length) {
      candidates.push({ off, size });
    }
  }
  const segments = [];
  let cursor = 0;
  for (const c of candidates) {
    if (c.off < cursor) continue; // false positive inside compressed data
    segments.push([cursor, c.off]);
    cursor = c.off + 8 + c.size;
  }
  segments.push([cursor, buf.length]);

  let text = "";
  for (const [s, e] of segments) {
    if (e <= s) continue;
    const chunks = [];
    await pipeline(
      Readable.from(buf.subarray(s, e)),
      createZstdDecompress(),
      async function* (src) { for await (const c of src) chunks.push(c); }
    );
    text += Buffer.concat(chunks).toString("utf8");
  }
  return text;
}

/**
 * Loads the pinned Lichess corpus, returning the first N games.
 * Full mode: 100,000 games from the pinned .zst (sha256-verified).
 * If the .zst is absent, falls back to the vendored 10-game sample
 * (hash-pinned) — only meaningful for --quick smoke runs.
 */
export async function loadLichessGames({ quick, games: gamesOpt } = {}) {
  const maxGames = gamesOpt ?? (quick ? 1000 : 100000);
  const zstAbs = join(REPO_ROOT, CORPORA.lichessZst.path);
  if (existsSync(zstAbs) && typeof createZstdDecompress === "function") {
    assertCorpus(CORPORA.lichessZst);
    if (!lichessTextCache) {
      lichessTextCache = await decompressLichessZst(zstAbs);
    }
    const games = splitGames(lichessTextCache, maxGames);
    if (games.length < maxGames) {
      fail(`pinned corpus yielded only ${games.length} games (need ${maxGames})`);
    }
    return { games, source: `lichess_db_standard_rated_2013-01.pgn.zst (first ${games.length} games, sha256-pinned)` };
  }
  if (!quick && !process.env.BENCH_ALLOW_SAMPLE) {
    fail(
      `pinned corpus ${CORPORA.lichessZst.path} is missing — download it per bench/data/README.md ` +
      `or use --quick (vendored 10-game sample).`
    );
  }
  const sampleAbs = assertCorpus(CORPORA.lichessSample);
  const games = splitGames(readFileSync(sampleAbs, "utf8"), maxGames);
  return { games, source: `lichess_db.sample.pgn (vendored ${games.length}-game sample, sha256-pinned)` };
}

// ---------------------------------------------------------------------------
// Shared CLI + result plumbing
// ---------------------------------------------------------------------------

export function parseSuiteArgs(argv) {
  const o = { quick: false, json: false, help: false, samples: null, games: null, positions: null, depth: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--quick") o.quick = true;
    else if (a === "--json") o.json = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--samples") o.samples = Number(argv[++i]);
    else if (a === "--games") o.games = Number(argv[++i]);
    else if (a === "--positions") o.positions = Number(argv[++i]);
    else if (a === "--depth") o.depth = Number(argv[++i]);
  }
  return o;
}

export function gate(name, pass, target, actual) {
  return { name, pass: !!pass, target, actual };
}

export function summarizeGates(gates) {
  return gates.every((g) => g.pass) ? "PASS" : "FAIL";
}

export function fmtMs(ms) {
  return ms >= 100 ? ms.toFixed(0) : ms >= 10 ? ms.toFixed(1) : ms.toFixed(2);
}

/** Verifies a corpus exists and matches its pinned sha256. Returns abs path. */
export function assertCorpus(corpus) {
  const abs = join(REPO_ROOT, corpus.path);
  if (!existsSync(abs)) {
    fail(`corpus missing: ${corpus.path} — see bench/data/README.md for the pinned URL`);
  }
  if (corpus.sha256) {
    const actual = sha256File(abs);
    if (actual !== corpus.sha256) {
      fail(`corpus sha256 mismatch for ${corpus.path}\n  got:  ${actual}\n  want: ${corpus.sha256}`);
    }
  }
  return abs;
}
