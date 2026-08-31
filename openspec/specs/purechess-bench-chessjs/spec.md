# purechess-bench-chessjs Specification

## Purpose
Adds a benchmark lane vs chess.js@1.4.0 (same corpora and parity-first methodology as the existing bench/suites/*) to prove the purechess/chessjs drop-in is faster on the same FEN/SAN/PGN/perft workloads that gate the chessops lanes.

## Requirements

### Requirement: chess.js benchmark lane SHALL use same corpora and parity-first methodology as bench/suites/*

The system SHALL add `bench/suites/chessjs.mjs` that reuses `bench/suites/lib/common.mjs` (3 warmups excluded, median of 20 runs, `global.gc()` between iterations, `performance.now()`) and the same pinned corpora (`bench/data/lichess_db.sample.pgn` 10-game tiny + 100k full via `bench/data/README.md` sha256, `samplefen1000.epd`, `perftsuite.epd`, `wac_150.epd`). `chess.js@1.4.0` SHALL be the baseline **only for bench** (dev, never imported in `src/`). Gates are parity-first: any SAN/FEN/UCI mismatch aborts speed reporting.

#### Scenario: Same corpora pinning
- **WHEN** `bench/suites/chessjs.mjs` lists its corpora via `--help` or header
- **THEN** it cites the same `bench/data/lichess_db.sample.pgn` sha256 and `samplefen1000.epd` path as `bench/suites/fen-san-uci.mjs` and `bench/suites/pgn-stream.mjs`

#### Scenario: Parity gate before speed
- **WHEN** `bench/suites/chessjs.mjs` runs FEN/SAN parity vs `chess.js` before timing
- **THEN** it aborts with `PARITY FAIL` if any `makeFen`/`makeSan`/`parseSan` byte mismatch exists, so speed numbers are never reported on a divergent impl

#### Scenario: No GPL source in bench lane
- **WHEN** `rg -n "chessops" bench/suites/chessjs.mjs` is run
- **THEN** it is empty except for the *other* suite’s baseline reference — the lane itself only imports `chess.js` and `purechess/chessjs` for comparison

### Requirement: chess.js lane SHALL gate on ≥ parity and report speed vs chess.js where purechess wins

The system SHALL expose at least two gates in `bench/suites/chessjs.mjs`:
- **Correctness:** `FEN`/`SAN`/`UCI` round-trip parity `≥99.9%` vs `chess.js` on 10k FENs, `perft` node parity vs `chess.js` where `chess.js` supports it (or note N/A if `chess.js` lacks `perft`), `allDests` parity where comparable.
- **Speed:** `games/s` (PGN streaming), `FEN parse+make`, `SAN make`, `dests` throughput vs `chess.js` are measured and reported; the gate **reports** speed (purechess is expected to beat `chess.js` on PGN streaming and FEN due to chunked parser and `{lo,hi}` + Black Magic, but does not fail CI on a narrow miss — only parity fails CI). Results are written to `bench/results/chessjs-*.md` with 20-run median `M`/`p10`/`p90`.

#### Scenario: PGN streaming vs chess.js
- **WHEN** `bench/suites/chessjs.mjs` streams the 100k Lichess PGN in 4k/16k/64k chunks via `purechess/chessjs` `Chess.pgn()` vs `chess.js` `loadPgn`
- **THEN** it reports `games/s` and `MB/s` for both, and `purechess` is expected to be `≥1.5×` `chess.js` (chunked vs whole-file), with `peakHeap` reported

#### Scenario: FEN and SAN vs chess.js
- **WHEN** 10k `samplefen1000.epd` FENs are `parseFen`→`makeFen` and `allDests`→`makeSan` via `purechess/chessjs` vs `chess.js`
- **THEN** `makeFen` and `makeSan` are `≥99.9%` byte-identical and `FEN parse+make` is measured and reported (purechess expected ≥ parity)

#### Scenario: Results written
- **WHEN** `npm run bench:real -- --suite chessjs` or `bench/suites/chessjs.mjs --json` runs
- **THEN** it writes `bench/results/chessjs-YYYY-MM-DD.md` with gate table `✓/✗` and raw logs, and `bench/bench-real.mjs` gate summary includes `chessjs` lane

### Requirement: Keyboard and screen reader parity SHALL hold for chess.js lane

The benchmark lane SHALL also verify that `purechess/chessjs` `makeSan` parity preserves `AriaLiveAnnouncer` and `[`/`]`/`Alt+` keyboard contracts — same as `purechess-benchmarks` spec for the chessops lanes.

#### Scenario: Announcement parity via chessjs lane
- **WHEN** `bench/suites/chessjs.mjs` compares `makeSan` for 1k random positions via `purechess/chessjs` vs `chess.js`
- **THEN** `+`/`#`/`O-O`/`=Q` are byte-identical, so `useChessMoveAnnouncer` via either façade remains correct and `enableArrowMoveShortcuts` OFF by default is preserved
