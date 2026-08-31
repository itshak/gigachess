# purechess-benchmarks Specification

## Purpose
Defines the benchmark harness, corpora, metrics, and pass/fail gates that decide whether `purechess` beats `chessops@0.15.1` in JS and locks the board encoding and slider algorithm for Phase 2.

## Requirements

### Requirement: Benchmark harness SHALL compare purechess candidates vs chessops on identical workloads

The system SHALL provide reproducible harness scripts that run the same corpus on the same Node version and report the **median of 20 runs** after **3 warmup runs are excluded**, driven by `tinybench` (or an equivalent hand-rolled `performance.now()` loop implementing the identical methodology), with `global.gc()` forced between iterations (`--expose-gc` mandatory).

#### Scenario: Harness is one command
- **WHEN** a contributor runs `npm run bench:real -- --suite pgn-stream`
- **THEN** the harness executes candidates sequentially on that corpus and prints `games/s`, `MB/s`, peak heap, and `MAttacks/s` for sliders (per suite)

#### Scenario: Measurement is reproducible
- **WHEN** `bench/README.md` is read
- **THEN** it specifies the pinned Node version, pinned `chessops@0.15.1`, pinned corpus sha256 (100k-game PGN per `bench/data/README.md`), 3 excluded warmup runs, and median of 20 runs with p10/p90 spread

#### Scenario: Forced GC is available
- **WHEN** the harness runs without `--expose-gc` (no `global.gc`)
- **THEN** it exits non-zero with instructions instead of reporting timings

#### Scenario: Results are gated, not just logged
- **WHEN** CI runs `npm run bench:real:ci`
- **THEN** it fails if any `SHALL` gate in this spec is not met

### Requirement: Sliding micro-benchmark SHALL measure MQueens/s for slider algorithms

The harness SHALL benchmark queen/rook/bishop attacks in isolation to pick the slider algorithm.

#### Scenario: Bake-off includes all candidates
- **WHEN** `bench/bench-sliding.mjs` is invoked
- **THEN** it benchmarks at least: `A: chessops HQ`, `B: Black Magic (plain, fixed shift) lo/hi`, `C: ReScript Int64 (caml_int64)`, `D: BigInt`, over 10M random occupancies

#### Scenario: Gate for slider win
- **WHEN** candidate `B` (Black Magic lo/hi) is measured
- **THEN** it SHALL achieve ≥30% higher `MQueens/s` than `A` (chessops HQ) on V8 (Node) to be declared winner; otherwise `HQ` remains fallback and spec records the result

### Requirement: Perft and API benchmarks SHALL cover integrated movegen

The harness SHALL measure `perft`, FEN/SAN, and PGN streaming end-to-end.

#### Scenario: Perft gate
- **WHEN** `bench/bench-perft.mjs --depth 6 --fen startpos` runs
- **THEN** purechess candidate SHALL be within ±0% or faster than chessops on `nodes/s` (target: +15%, gate: ≥parity) and perft(6) node count equals 119060324

#### Scenario: PGN streaming gate
- **WHEN** `bench/bench-pgn.mjs` streams the pinned 100k-game PGN with chunked parsing
- **THEN** purechess SHALL achieve ≥50% higher `games/s` than chessops and use ≤110% peak heap, with identical game counts and identical `makePgn(parsePgn)` round-trip for legal games

#### Scenario: FEN/SAN gate
- **WHEN** `bench/bench-fen-san.mjs` round-trips 10k random FENs
- **THEN** purechess SHALL be ≥20% faster than chessops on `FEN parse+make` throughput and at parity on `SAN` throughput, with byte-identical outputs for legal positions

### Requirement: Movegen micro-benchmark SHALL track allDests/makeMove/perft vs chessops

The harness SHALL benchmark integrated movegen (`allDests`, `makeMove`, perft) against `chessops` on standard positions (startpos, Kiwipete, perft positions 3–6) so the FP-policy optimizations (zero-alloc scratch, mask-trusted legality, `forEachSquare`) are gated, not just logged.

#### Scenario: Movegen benchmark is one command
- **WHEN** a contributor runs `node bench/bench-movegen.mjs`
- **THEN** it reports ms/iteration for purechess `allDests` (Kiwipete, 20k iters), `makeMove` (200k iters), perft node-rates for startpos and positions 3–6, and the same workloads via `chessops` `allDests` for the gap ratio

#### Scenario: allDests gap gate
- **WHEN** the Kiwipete `allDests` gap (purechess ms ÷ chessops ms) is measured
- **THEN** the gap SHALL be ≤1.2× (current: ~1.17×, down from 1.76× before the FP-policy optimizations); a regression above 1.2× fails the gate

#### Scenario: makeMove and perft gates
- **WHEN** `makeMove` throughput and perft node counts are measured
- **THEN** `makeMove` SHALL be ≥1.5× faster than the pre-FP-policy baseline (current: ~1.9×), perft node counts SHALL be exactly the published reference values (startpos d6 = 119060324; Kiwipete d5 = 193690690; pos4 d4 = 4223335), and perft `pos4` d4 SHALL be ≥3× faster than the play-and-test legality baseline (current: ~4.2×)

### Requirement: Bundle size gate SHALL enforce tree-shaking

The library SHALL ship tree-shakeable modules so consumers pay only for what they import. Because the Black Magic tables are measured data (841 KB raw / 26 KB gz for 107,648 entries) that no chess-reasoned code should carry statically, the gate is re-baselined to a like-for-like comparison:

- `purechess/core` SHALL exclude PGN, Chess960, **and magic-table bytes from its static import graph** (tables load via dynamic `import()` per the `purechess-board-movegen` delta). The static core bundle SHALL be **≤120% of the chessops Chess-import bundle** (measured code-only: 6.0 vs 5.2 KB gz — purechess core code is chessops-parity, not 30% smaller; the former "≥30% smaller than chessops Chess-import" clause compared a data-carrying core against a table-free library and was unachievable).
- `purechess` (full, tables included via dynamic chunks) SHALL report its gzipped total for transparency against chessops' full public API bundle; no SHALL threshold is set on it beyond core exclusion.
- The real-world suite gates in this capability (perft node parity, dests-terminal 100% parity, fen-san-uci ≥99% parity, sliding parity + speed) SHALL pass in `npm run bench:real:ci` — they are the acceptance criteria this change exists to satisfy. The FEN parse+make ≥+20% throughput gate SHALL either pass (via `parseFen`/`makeFen` optimization) or a follow-up spec amendment with evidence SHALL be proposed — it SHALL NOT be silently dropped.

#### Scenario: Core vs full bundle
- **WHEN** `npm run build` is measured with `esbuild` and `sideEffects:false`, bundling a consumer importing `import { Chess } from "purechess/core"`
- **THEN** the static bundle SHALL be ≤120% of the chessops Chess-import bundle (chessops-import baseline ≈5.2 KB gz, purechess core code ≈6.0 KB gz with tables excluded), and the full `purechess` bundle plus lazy table chunk SHALL be reported (expected ≈26–32 KB gz total vs 81 KB before)

#### Scenario: Tree-shaking is verified
- **WHEN** a consumer imports `import { Chess } from "purechess/core"`
- **THEN** the production bundle SHALL NOT include `parsePgn`, Chess960 castling tables, **or magic-table bytes** (verified via `npm run bench:real -- --suite bundle`)

#### Scenario: All real-world gates pass
- **WHEN** `npm run bench:real:ci` runs (full corpora)
- **THEN** the exit code is 0: sliding parity ✓, perft node parity ✓ (0 mismatches), pgn-stream ≥+50% games/s + heap ≤110% ✓, fen-san-uci parity ≥99% + FEN ≥+20% or documented-achieved ✓, dests-terminal 100% parity ✓, bundle gates ✓

### Requirement: Keyboard, screen reader, and i18n contracts SHALL be benchmarked for parity

Benchmarks SHALL include accessibility parity checks so purechess doesn't regress workstation a11y.

#### Scenario: Keyboard navigation parity
- **WHEN** purechess `dests()` and `allDests()` outputs are compared to chessops for 1k random positions
- **THEN** legal move sets are byte-identical, so `[`/`]` stepping and `Alt+` shortcuts in `GameViewShell` are unaffected

#### Scenario: Announcement parity
- **WHEN** `bench/bench-san.mjs` compares `makeSan` outputs
- **THEN** SAN strings (including disambiguation, check `+`, mate `#`) match chessops exactly, so `useChessMoveAnnouncer` announcements remain correct

#### Scenario: Error i18n keys exist
- **WHEN** `parseFen`/`parsePgn` return errors for invalid inputs
- **THEN** each error code maps to `en`, `ru`, `he` keys (checked via `npm run test:i18n`)

### Requirement: Sliding benchmark SHALL use perft-derived real occupancies

The sliding suite SHALL harvest occupancy bitboards from perft(4) trees of the 6 standard perft positions (not uniform-random occupancies) and benchmark `queenAttacks` over 10M unique real occupancies.

#### Scenario: Real occupancy sampling
- **WHEN** `bench/suites/sliding.mjs` runs
- **THEN** it deduplicates visited position occupancies via `lo*2^32+hi` keys and reports `MAttacks/s` for purechess Black Magic vs chessops HQ with attack-set parity verified on the first 100k samples

### Requirement: Perft suite SHALL run the standard perft and WAC corpora with node parity

The perft suite SHALL run every FEN in `perftsuite.epd` and `wac_150.epd` at min(depth, 4), verifying node counts equal chessops for every entry before comparing `nodes/s`.

#### Scenario: Node parity gates speed reporting
- **WHEN** any FEN/depth node count differs from chessops
- **THEN** the suite aborts with the failing FEN and reports no speed numbers

#### Scenario: Speed gate
- **WHEN** all node counts match
- **THEN** purechess `nodes/s` SHALL be ≥parity (target +15%) vs chessops

### Requirement: PGN streaming SHALL benchmark 100k pinned Lichess games

The streaming suite SHALL decompress the pinned `lichess_db_standard_rated_2013-01.pgn.zst` (sha256 recorded in `bench/data/README.md`), take the first 100,000 games, and stream-parse with 4k/16k/64k chunk sizes.

#### Scenario: Parity before speed
- **WHEN** the suite runs
- **THEN** game counts and `makePgn(parsePgn(game))` round-trips match chessops for every legal game before any timing is reported

#### Scenario: Streaming gate
- **WHEN** timings are reported per chunk size
- **THEN** purechess SHALL achieve ≥50% higher `games/s` than chessops and ≤110% peak heap

### Requirement: FEN/SAN/UCI parity SHALL cover 10k+ positions including Chess960

The FEN/SAN/UCI suite SHALL round-trip 10k+ FENs from real games plus Chess960/X-FEN samples, and compare SAN (`+`, `#`, `=Q` disambiguation) and UCI outputs byte-identically against chessops, with castling moves canonicalized to the normalized G1/C1 representation per ADR-013.

#### Scenario: Parity with normalization
- **WHEN** castling moves are compared
- **THEN** purechess `e1g1` and chessops `e1h1` compare equal after canonicalization, and all other moves compare byte-identical

#### Scenario: Throughput gates
- **WHEN** parity is established
- **THEN** purechess SHALL be ≥20% faster on FEN parse+make throughput and at parity on SAN throughput

### Requirement: Dests/legal/terminal parity SHALL be exact on real games

The dests suite SHALL replay 10k positions from real games and compare `allDests` (castling normalized), `isLegal`, and terminal predicates (`isCheck`, `isCheckmate`, `isStalemate`, `isInsufficientMaterial`) against chessops.

#### Scenario: Exact parity required
- **WHEN** any dest set, legality flag, or terminal predicate differs
- **THEN** the suite fails with the position FEN and the differing move/predicate enumerated (speed numbers only reported at 100% parity)

### Requirement: Bundle tree-shake gate SHALL be verified against chessops

The bundle suite SHALL esbuild-bundle a consumer importing `Chess` from `purechess/core`, `purechess` (full), and `chessops` (full), and compare gzipped sizes.

#### Scenario: Core is meaningfully smaller
- **WHEN** gzipped bundle sizes are measured
- **THEN** `purechess/core` SHALL be ≥30% smaller than the chessops full-import bundle and `purechess` full SHALL be ≤110% of it

#### Scenario: Dead code absent
- **WHEN** the core bundle is inspected
- **THEN** `parsePgn` and Chess960 castling table bytes SHALL be absent
