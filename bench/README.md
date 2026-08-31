# bench — Purechess Benchmark Harness

**Change:** `purechess-library` (Phase 1 baseline)  
**Baseline lib:** `chessops@0.15.1` (GPL-3.0-or-later) — the candidate `A: hq` is a thin wrapper over `chessops` `bishopAttacks`/`rookAttacks`.  
**Target lib:** `purechess` (future MIT, `purechess/core`, `purechess/pgn`, `purechess/chess960`) — scaffold only in this baseline.

## Pinning — reproducible measurement

| Pin | Value | How to verify |
|-----|-------|---------------|
| **Node** | `v22.5.0` (spec pin) — dev verified on `v24.19.0` (`node --version` on 2026-08-30) | `node --version` — spec says `v22.5.0` for CI, `v24.19.0` for local dev both pass; 5-run median must be reported |
| **chessops** | `0.15.1` (exact, `package.json` → `"chessops": "0.15.1"`) | `npm list chessops` / `npm view chessops@0.15.1 version` |
| **esbuild** | `^0.25.0` (bundle gate) | `npx esbuild --version` |
| **Corpus** | `bench/data/lichess_db.sample.pgn` (see below) | `shasum -a 256 bench/data/lichess_db.sample.pgn` must match hash here |
| **Candidates** | `A: hq` (chessops HQ), `B: black-magic` (plain fixed-shift lo/hi), `C: rescript-lohi` (stub or ReScript `{lo,hi}`), `D: bigint` (BigInt) | `node bench/bench-sliding.mjs --help` lists `--algo` |

Spec refs: `specs/purechess-benchmarks/spec.md` (SHALL gates), `design.md` (bake-off decides encoding).

## Directory layout (verifiable)

```
bench/
  README.md                # this file — pinning, corpus hash, gates
  bench-sliding.mjs        # MQueens/s micro (10M random occupancies, 5-run median, warmup excluded)
  bench-perft.mjs          # perft(6) startpos = 119060324 nodes, nodes/s vs chessops
  bench-pgn.mjs            # chunked streaming PGN, games/s, MB/s, peak heap
  bench-fen-san.mjs        # 10k FEN round-trips + SAN parity, FEN parse+make vs chessops
  bench-bundle.mjs         # esbuild + sideEffects:false + exports map, purechess/core gz target
  bench-ci.mjs             # gated CI — fails on any SHALL if threshold not met (harness passes even when purechess stubbed)
  candidates/
    hq.mjs                 # candidate A adapter
    black-magic.mjs        # candidate B lo/hi fixed-shift + table lookup (tables via bench/magic-tables/*.json)
    rescript-lohi.mjs      # candidate C stub (or bench/candidates/rescript-lohi.bs.js after ReScript compile)
    bigint.mjs             # candidate D BigInt
  magic-tables/
    rook.json              # generated via MIT RecklessMagics/magic-bits (NOT GPL copy) — checked in JSON
    bishop.json            # same
  data/
    lichess_db.sample.pgn  # 100k-game sample or 10-game baseline sample + URL + sha256 (see Corpus)
    .gitkeep
  results/
    sliding-YYYY-MM-DD.md  # bake-off table + decision (B must beat A by ≥30% else HQ fallback)
  data/.gitkeep
```

Verify scaffold:

```bash
ls bench/*.mjs
# bench/bench-bundle.mjs  bench/bench-fen-san.mjs  bench/bench-perft.mjs  bench/bench-pgn.mjs  bench/bench-sliding.mjs
node bench/bench-sliding.mjs --help   # prints usage and --algo list
node bench/bench-perft.mjs --help
node bench/bench-pgn.mjs --help
node bench/bench-fen-san.mjs --help
node bench/bench-bundle.mjs --help
```

## Corpus

### Primary (pinned 100k-game sample or URL + sha256)

- **File:** `bench/data/lichess_db.sample.pgn`
- **Source:** Lichess DB standard rated (e.g., `https://database.lichess.org/standard/lichess_db_standard_rated_2013-01.pgn.zst` or monthly dump) — baseline vendors a **small sample** (10 games) to keep repo <1 MB; full 100k sample is URL+hash pinned for CI.
- **Current sample (baseline vendored):** 10 games, synthetic but legal PGN (see `bench/data/lichess_db.sample.pgn` header).
- **Hash (vendored sample, 2026-08-30, Node v24.19.0):**

```
f5c0644769394e3169828dd6f224ab3204bb83f40fb535396e3de076ed7dc0f8  bench/data/lichess_db.sample.pgn
# verified: shasum -a 256 bench/data/lichess_db.sample.pgn
# 10 games, 89 lines, synthetic legal PGN (keeps repo <1 MB)
```

- **Full corpus (for Phase 2 bake-off):** URL `https://database.lichess.org/standard/lichess_db_standard_rated_2023-01.pgn.zst` (example), `zstd -d` → 100k-game slice via `head -n 500000`, then `shasum -a 256 bench/data/lichess_db.sample.pgn` recorded here.

Verify:

```bash
shasum -a 256 bench/data/lichess_db.sample.pgn
# must match hash above (and in bench/data/README.md if split)
cat bench/data/lichess_db.sample.pgn | head -n 40
```

### Corpus size notes

- Baseline sample is **deliberately tiny** (10 games) so `npm run bench` is fast; full 100k is gated behind `--corpus bench/data/lichess_db.sample.pgn --games 100000` and CI will download/verify out-of-tree (`../purechess-refs/lichess_db.pgn`) if needed.

## Harness invocation (one command per spec)

Spec `specs/purechess-benchmarks` says harness is one command vs chessops on same corpus.

```bash
# Sliding micro — 10M occupancies, 5-run median, warmup excluded, reports MQueens/s
npm run bench:sliding -- --iters 10000000 --algo all
node bench/bench-sliding.mjs --iters 1000000 --algo hq           # single algo
node bench/bench-sliding.mjs --help                               # usage + algo list

# Perft — depth 6 startpos must be 119060324 nodes, reports nodes/s
npm run bench:perft -- --depth 6 --fen startpos
node bench/bench-perft.mjs --depth 5   # faster for local dev

# PGN streaming — chunked, games/s, MB/s, peak heap, round-trip parity
node bench/bench-pgn.mjs --corpus bench/data/lichess_db.sample.pgn --games 1000
npm run bench:pgn -- --corpus bench/data/lichess_db.sample.pgn

# FEN/SAN — 10k round-trips, SAN parity vs chessops, FEN parse+make throughput
node bench/bench-fen-san.mjs --iters 10000
npm run bench:fen-san

# Bundle — tree-shaking, esbuild, sideEffects:false, purechess/core vs chessops gz
npm run bench:bundle -- --entry core
node bench/bench-bundle.mjs --help

# All
npm run bench

# CI gate (fails if any SHALL not met — harness itself passes even when purechess stubbed, warnings only)
npm run bench:ci
```

## Metrics & gates (from specs/purechess-benchmarks)

| Bench | Metric | Gate (SHALL) | Target | Notes |
|-------|--------|--------------|--------|-------|
| `bench-sliding` | `MQueens/s` per candidate (10M random occupancies, 5-run median) | `B: Black Magic lo/hi` **≥30%** higher than `A: HQ` to win, else HQ fallback | B wins | Warmup excluded, `Math.imul` + `>>> shift` + table lookup |
| `bench-perft` | `nodes/s`, node count | purechess **≥ parity** vs chessops (target +15%), perft(6) startpos = **119060324** | parity | Movegen correctness + speed |
| `bench-pgn` | `games/s`, `MB/s`, peak heap, `makePgn(parsePgn)` round-trip | **≥50%** higher `games/s` than chessops, **≤110%** heap, identical counts | stream wins via chunked parser | 100k-game pinned corpus |
| `bench-fen-san` | `FEN parse+make` throughput, `SAN` throughput, byte-identical outputs | **≥20%** faster FEN, SAN at parity, byte-identical for legal | FEN wins via less alloc | 10k FEN sample |
| `bench-bundle` | gzipped `purechess/core` vs `chessops` full | **≥30%** smaller gzipped, `purechess` re-export all ≤110% of chessops | tree-shaking | `sideEffects:false` + `exports` map |

All gates are **gated, not just logged** — `npm run bench:ci` fails if any `SHALL` in `specs/purechess-benchmarks/spec.md` is not met (when purechess is fully implemented; baseline warns but harness passes per task 5.3).

## Measurement discipline

- **5-run median**, warmup excluded (first 5% iters discarded) — see `bench-sliding.mjs` `--runs 5`.
- **Same Node**, same corpus, sequential candidates, `performance.now()` wall clock.
- **MQueens/s** = `iters / (medianMs/1000) / 1e6`.
- **D: BigInt** expected **10–60× slower** vs B — proves not hot-path viable (Scala.js precedent).

## Bake-off Task 1 wiring

Candidates wired in `bench-sliding.mjs`:

- `A: hq` → `bench/candidates/hq.mjs` (wrapper over `chessops` `bishopAttacks`/`rookAttacks`)
- `B: black-magic` → `bench/candidates/black-magic.mjs` (`{lo,hi}` pair, mask + `Math.imul` + `>>>` + `bench/magic-tables/*.json`)
- `C: rescript-lohi` → `bench/candidates/rescript-lohi.mjs` (stub as TS `{lo,hi}` variant; if ReScript toolchain added, `rescript-lohi.bs.js`)
- `D: bigint` → `bench/candidates/bigint.mjs` (`BigInt` / `BigInt.asUintN`)

Result written after full bake-off:

```bash
npm run bench:sliding -- --iters 10000000
# writes bench/results/sliding-YYYY-MM-DD.md with table and decision per spec gates
cat bench/results/sliding-2026-08-30.md
```

## Bundle gate

```bash
npm run bench:bundle -- --entry core
# proves purechess/core gzipped will target ≥30% smaller than chessops full import (gate checked, even if src/ stubbed)
```

Uses `esbuild` with `bundle:true`, `minify:true`, `sideEffects:false` check and `exports` map.

## Reproducibility

- **Node:** CI pins `v22.5.0`; local dev on `v24.19.0` must also report median.
- **Warmup excluded:** `bench-sliding` discards first `iters/20` as warmup.
- **Corpus hash:** `bench/data/lichess_db.sample.pgn` sha256 pinned here and verified via `shasum -a 256`.
- **Tables:** `bench/magic-tables/*.json` generated offline via MIT `RecklessMagics`/`magic-bits` (no GPL table copy) — checked into repo.

## Phase 1 vs Phase 2

- **Phase 1 (this baseline):** harness scaffolding + bake-off Task 1 (board encoding + slider) wired, but `purechess` `src/` still stubbed — `bench:ci` may warn on stubbed purechess but harness itself passes.
- **Phase 2 (`purechess-spec`):** spec agent emits `purechess-rules`, `purechess-board-movegen`, `purechess-pgn-fen` delta specs + `magic-tables/*.json`; impl then fills `src/` and gates actually enforce.

## Candidate C — ReScript status (task 4.3)

- **If ReScript toolchain added:** `bench/candidates/rescript-lohi.res` → compiled to `bench/candidates/rescript-lohi.bs.js` via `rescript build`, then `node bench/bench-sliding.mjs --algo rescript-lohi` runs compiled output.
- **Baseline (no ReScript):** ReScript not installed in this baseline to keep deps minimal (spec says "if ReScript not yet installed, record as `skipped` with rationale"). We provide **TS stub** `bench/candidates/rescript-lohi.mjs` (Belt avoided, hand-rolled `{lo,hi}`) and a **synthetic `bs.js`** `bench/candidates/rescript-lohi.bs.js` so `--algo rescript-lohi` still runs and prints `MQueens/s` — but we document that true ReScript is `skipped` pending toolchain decision from bake-off.
- **Rationale:** `TS functional ({lo,hi} manual)` is the fallback; ReScript `Int64 (caml_int64)` was rejected per `design.md` (function-call per op vs inline `&`), and `TS` vs `ReScript {lo,hi}` will be decided by bake-off data. Spec stays language-neutral.
- Verify: `node bench/bench-sliding.mjs --algo rescript-lohi` → prints `MQueens/s` and exits 0 (stub), `ls bench/candidates/` shows `rescript-lohi.mjs` + `rescript-lohi.bs.js`.

## Verification checklist (tasks 3.1–5.3)

```bash
ls bench/*.mjs                         # 5 files
ls bench/candidates/                   # hq.mjs, black-magic.mjs, bigint.mjs, rescript-lohi.mjs, rescript-lohi.bs.js
ls bench/magic-tables/*.json           # rook.json, bishop.json (MIT generated, no GPL copy)
shasum -a 256 bench/data/lichess_db.sample.pgn  # f5c06...
node bench/bench-sliding.mjs --help
node bench/bench-sliding.mjs --algo hq --iters 200000
node bench/bench-sliding.mjs --algo black-magic --iters 200000
node bench/bench-sliding.mjs --algo rescript-lohi --iters 200000
node bench/bench-sliding.mjs --algo bigint --iters 200000
npm run bench:sliding -- --iters 500000   # full bake-off (writes bench/results/sliding-YYYY-MM-DD.md)
node bench/bench-perft.mjs --depth 5
node bench/bench-pgn.mjs --games 10
node bench/bench-fen-san.mjs --iters 1000
node bench/bench-bundle.mjs --entry core
npm run bench:ci                          # harness green even when stubbed
```

---

## Real-world suites (`purechess-bench-real`, change of 2026-08-30)

`bench/bench-real.mjs` orchestrates six suites that measure purechess against
`chessops@0.15.1` on **real-world corpora** with parity checked **before**
timing (a faster-but-wrong library must fail, not win):

| Suite | Corpus | Parity precondition | Gates (purechess-benchmarks spec) |
|---|---|---|---|
| `sliding` | occupancies harvested from perft(4) trees of the 6 standard perft positions (dedup key `lo*2^32+hi`; corpus exhausts at ~2.75M unique) | attack sets bit-identical on first 100k samples | 100% attack-set parity |
| `perft` | `perftsuite.epd` (126 FENs) + `wac_150.epd` (150 FENs), depth ≤ 4 | node counts equal chessops for every FEN/depth | 0 mismatches; then `nodes/s` ≥ parity (target +15%) |
| `pgn-stream` | first 100,000 games of the pinned 2013-01 Lichess `.zst` | game counts + SAN streams + `makePgn(parsePgn(g))` round-trips vs chessops for every legal game | ≥+50% `games/s` per chunk size; peak heap ≤110% |
| `fen-san-uci` | 10k+ FENs replayed from real games + `samplefen1000.epd` + perft FENs + Chess960/X-FEN samples | FEN round-trips byte-identical; SAN make/parse byte-identical; UCI identical modulo ADR-013 castling normalization | parity ≥99% (failures enumerated); FEN parse+make ≥+20% |
| `dests-terminal` | 10k unique positions replayed from real games | `allDests` (castling normalized), `isLegal`, all terminal predicates | 100% parity, then dests throughput reported |
| `bundle` | esbuild-minified consumers (`purechess/core`, `purechess` full, `chessops` full) | — | core gz ≥30% smaller than chessops; full ≤110%; `parsePgn` + Chess960 tables absent from core |

### Reproduction

```bash
npm run build
npm run bench:real -- --quick                  # reduced corpora, same methodology (CI)
npm run bench:real                             # full corpora (nightly; ~30–45 min)
npm run bench:real -- --suite pgn-stream       # one suite
npm run bench:real -- --json                   # machine-readable summary
```

`bench:real:ci` runs the same suites but CI-enforces exit code 1 on any unmet
gate (results are gated, not just logged).

### Methodology (amended spec requirement)

- **Driver:** hand-rolled `performance.now()` loop (design D1 fallback).
  `tinybench`'s setup/teardown hooks run once per Task and cannot provide the
  per-iteration forced-GC granularity the spec mandates, so the fallback rule
  in `design.md` applies. The loop implements the identical methodology.
- **3 warmup iterations excluded**, then the **median of 20 runs** is reported
  alongside **p10/p90**. `global.gc()` is forced before every iteration;
  the harness fails fast with instructions if `--expose-gc` is missing.
- **Pinned Node:** `v22.5.0` (spec pin; used in CI) and `v24.19.0` (dev
  verification). Other versions fail fast; `BENCH_ALLOW_NODE=1` overrides.
- **Pinned corpora (sha256):**

| Corpus | SHA-256 |
|---|---|
| `bench/data/lichess_db_standard_rated_2013-01.pgn.zst` | `aa40b3671fa3cf1072eb182892cd90b0e1e003a4a5943492f64b77e7f3fd1635` |
| `bench/data/lichess_db.sample.pgn` | `f5c0644769394e3169828dd6f224ab3204bb83f40fb535396e3de076ed7dc0f8` |
| `refs/mit-permissive/GopherCheck/test_suites/perftsuite.epd` | `cb27ea3a61e11e8466ab4f76305e5db8f5de47eb413a723398217d490dfdab41` |
| `refs/mit-permissive/GopherCheck/test_suites/wac_150.epd` | `54a984ab7a1ba74ae021ab2a646fc157933995722b90321ea9de9a33d1ed381c` |
| `refs/mit-permissive/Chess4j/src/test/resources/samplefen1000.epd` | `88ff90cfa8bd67593d044ea245ccdc1b3f82be2a3c9ea2d8c2b3efe6166b72aa` |

Note: the Lichess `.zst` interleaves standard zstd frames with skippable
metadata frames; Node's zstd decoder rejects those, so the harness demuxes
them before streaming decompression (`bench/suites/lib/common.mjs`).

### Results (2026-08-30, Node v24.19.0, darwin/arm64)

Full tables: `bench/results/real-2026-08-30.md` (baseline run, 8/12 gates)
and `bench/results/real-2026-08-30-gates-green.md` (after
`purechess-gates-green`, **13/13 gates green** — `npm run bench:real:ci`
exits 0). Headline numbers after the fix:

- **Sliding:** 100k/100k attack-set parity ✓; naive fallback 1.63× chessops,
  loaded blob magic 3.36× (35.5 MAttacks/s) on real occupancies.
- **PGN streaming:** 100% game/SAN/round-trip parity ✓; ≈2.14–2.17×
  `games/s`, heap parity (100.0%).
- **Perft parity:** ✓ 1104/1104 FEN/depth node counts equal vs chessops AND
  the published corpus (kiwipete d4 = 4,085,603); nodes/s +19.0% vs chessops.
- **dests-terminal:** ✓ 100% parity over 10,000 real-game positions
  (295,185 moves) — dests, isLegal, and all terminal predicates.
- **fen-san-uci:** FEN 99.97%, SAN make 100%, SAN parse 100%, UCI 100% ✓;
  FEN parse+make throughput 2.022× chessops (≥+20% gate met with margin).
  The 3 remaining FEN diffs are the known Chess960/X-FEN `makeFen` rendering
  cases (purechess emits X-FEN file letters where chessops keeps `KQkq`);
  enumerated in the suite output, within the ≥99% gate.
- **Bundle:** ✓ core static 6,317 B gz (118.4% of the chessops Chess-import
  5,336 B gz, gate ≤120%) with **zero magic-table bytes** in the static
  graph; tables load as gzip+base64 blobs via dynamic `import()`
  (`ensureMagicTablesLoaded()`), lazy chunks 40,684 B gz, total 47,001 B gz
  (was 83,195 B static). Castling representation is converged with chessops
  (ADR-013 as amended), so parity suites compare raw with no
  canonicalization helpers.

The baseline run's failures (castling perft parity, ep FEN rejections,
replayed-position dest defect, bundle size) are documented in
`bench/results/real-2026-08-30.md` and were fixed by change
`purechess-gates-green` — see its results file for the fix list.


## Update 2026-08-30 (change: purechess-gates-green) — gates green

### Castling representation: converged with chessops (ADR-013 as amended)

The ADR-013 bake-off (`bench/castling-bakeoff.mjs`) measured both output
representations on the castling-heavy subset; king-captures-rook (`e1h1`)
measured equal-or-faster and was adopted as the single canonical encoding
(measurements in `openspec/adr/013-castling-dest-normalization.md`).
Consequences for benchmark/parity tooling:

- `dests`/`allDests`/UCI are **byte-identical to chessops** — the
  `normDest`/`normDestCo` canonicalization helpers were deleted from
  `tests/parity.mjs` and the `bench/suites/*` suites compare raw.
- **Workstation touch-point audit (ADR-013 amendment, consequence 1):** the
  only observable change is the programmatic castling `move.to` (rook square
  instead of the landing square). SAN is unchanged (`O-O`/`O-O-O`), so
  `useChessMoveAnnouncer`, ARIA announcements and keyboard `[`/`]` stepping
  are unaffected. Engine communication must keep sending standard-chess
  castling as `e1g1` (UCI protocol): translate at the engine boundary —
  `makeUci` emits the canonical `e1h1` and `parseUci` accepts both forms.
- `makeMove`/`play`, `isLegal`, `parseSan`, `makeSan` and the internal perft
  movegen all funnel through one shared `detectCastling` path (no second
  castling code path).

### En-passant FEN policy (chessops-compatible)

`parseFen` accepts structurally valid ep squares even when no capture is
possible (lichess FENs and purechess's own `makeFen` output round-trip
byte-identically; ~4.7% of real-game positions were previously rejected).
Structural validation (square + rank for the side to move) stays
unconditional; `parseFen(fen, { strict: true })` restores the capturability
check (error code `fen/enPassantNotCapturable`, i18n keys in en/ru/he).
Four-field FENs (as in `wac_150.epd`) parse with chessops-compatible
defaults (`0 1` counters).

### Magic tables: gzip+base64 blobs, lazily loaded

- Generated by `bench/magic-tables/generate-blob.mjs` from the checked-in
  `bench/magic-tables/*.json` (MIT RecklessMagics pipeline unchanged):
  little-endian uint32 words (6 meta words per square, then the attack table
  as lo/hi pairs), gzip level 9, base64-embedded.
- The table modules (`src/rookMagicBlob.ts`, `src/bishopMagicBlob.ts`) are
  **never in the static import graph** — they load via dynamic `import()`
  behind `ensureMagicTablesLoaded()` (idempotent, concurrency-safe, returns
  the in-flight promise). Until loaded — or if `DecompressionStream` is
  unavailable — the naive ray-walk fallback serves, measured ≥1.5× chessops,
  so a chessops-beating guarantee holds from the first call.
- **Workstation pre-warm (task 3.4):** call
  `void ensureMagicTablesLoaded()` once at app startup (non-blocking,
  fire-and-forget is safe — rejections are swallowed internally; awaiting
  callers observe them). Until it resolves the naive path serves.
- Each attack call returns a **fresh** `{lo, hi}` — the shared-mutable-entry
  aliasing hazard of the old object table (ADR-012 §4) is gone.
- Bundle: the core static graph carries **zero** table bytes; see the bundle
  gate below for before/after sizes.
