# purechess-bench-real — Real-World Benchmark Suite

## Why

Phase 2 specs (`purechess-benchmarks`) locked pass/fail gates, and the
micro-benchmarks (`bench-sliding`, primitive harness) proved Black Magic
`{lo,hi}` wins. But the current bench harness is primitive (no suite imports
`src/`), and the gates that decide the chessops→purechess workstation
migration are measured on synthetic workloads. Before the migration merges,
purechess must be validated against chessops on **real-world corpora** —
Lichess game databases, perft suites, and tactical EPD sets — with a
statistically meaningful methodology, or the +50% `games/s` and parity claims
remain unproven.

## What Changes

- Adds `bench/bench-real.mjs` orchestrator + 6 real-world suites (all
  importing `src/` via `dist/`), each parity-checked against
  `chessops@0.15.1` on the same workload before timing:
  1. **Sliding occupancies** — 10M occupancies harvested from real perft
     trees (not uniform random), reporting `MAttacks/s`
  2. **Perft parity + speed** — `perftsuite.epd` (126 FENs) + `wac_150.epd`
     at depth 1–4, node counts byte-equal vs chessops, `nodes/s` compared
  3. **PGN streaming** — pinned first 100,000 games of
     `bench/data/lichess_db_standard_rated_2013-01.pgn.zst` (sha256
     `aa40b367…`), chunk sizes 4k/16k/64k, `games/s` + `MB/s` + peak heap
  4. **FEN/SAN/UCI parity** — 10k+ FEN round-trips incl. Chess960/X-FEN and
     SAN `+`/`#`/`=Q` disambiguation, byte-identical vs chessops, throughput
     compared
  5. **Dests/legal/terminal parity** — `allDests` (castling normalized per
     ADR-013), `isLegal`, check/mate/stalemate/insufficient-material on 10k
     positions from real games
  6. **Bundle tree-shake gate** — esbuild bundle of `purechess/core` vs
     `chessops` full, gzipped sizes, `parsePgn`/Chess960 bytes absent from
     core entry
- **Methodology (amends harness requirement):** tinybench or mitata driver,
  3 warmup iterations excluded, `global.gc()` via `--expose-gc` between
  iterations, **median of 20 runs**, `performance.now()` clock, pinned Node
  version + `chessops@0.15.1` + corpus sha256 recorded in `bench/README.md`.
- Updates `bench/README.md` with pinned corpus hashes and reproduction
  commands; `npm run bench:real` runs all suites, `bench:real:ci` fails on
  any unmet gate.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `purechess-benchmarks`: harness methodology requirement modified (5-run
  median → 20-run median with warmup + forced GC + tinybench/mitata), and
  new requirements added for the 6 real-world suites (sliding occupancies
  from perft trees, perft parity corpus, 100k-game streaming, FEN/SAN/UCI
  parity corpus, dests/legal/terminal parity, bundle gate verification).

## Impact

- **Code:** adds `bench/bench-real.mjs` + `bench/suites/*.mjs`; no `src/`
  change (purechess is already implemented and parity-validated by
  `tests/parity.mjs` + `tests/perft.mjs`).
- **Data:** `bench/data/lichess_db_standard_rated_2013-01.pgn.zst`
  (17.7 MB compressed, re-downloadable, sha256 pinned in
  `bench/data/README.md`); `perftsuite.epd`, `wac_150.epd` already present
  under `refs/mit-permissive/`. Decompressed PGN stays out of git.
- **Licensing:** corpora are Lichess DB (public domain dedication) and
  MIT-licensed perft suites; no GPL material touched.
- **Dependencies:** `tinybench` or `mitata` as devDependency (MIT);
  `esbuild` and `chessops@0.15.1` already present.
- **No workstation UI change** — this is a bench/validation change that
  unblocks the future `purechess-adopt` migration change.
