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

