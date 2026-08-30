# purechess-benchmarks Specification

## Purpose
Defines the benchmark harness, corpora, metrics, and pass/fail gates that decide whether `purechess` beats `chessops@0.15.1` in JS and locks the board encoding and slider algorithm for Phase 2.

## Requirements

### Requirement: Benchmark harness SHALL compare purechess candidates vs chessops on identical workloads

The system SHALL provide reproducible harness scripts that run the same corpus on the same Node version and report median of 5 runs.

#### Scenario: Harness is one command
- **WHEN** a contributor runs `npm run bench -- --corpus bench/data/lichess_db.pgn --compare chessops`
- **THEN** the harness executes candidates sequentially on that corpus and prints `games/s`, `MB/s`, peak heap, and `MQueens/s` for sliders

#### Scenario: Measurement is reproducible
- **WHEN** `bench/README.md` is read
- **THEN** it specifies pinned Node (e.g., `v22.5.0`), pinned `chessops@0.15.1`, pinned corpus hash (e.g., `sha256` of 100k-game PGN), warmup runs excluded, and 5-run median reported

#### Scenario: Results are gated, not just logged
- **WHEN** CI runs `npm run bench:ci`
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

The library SHALL ship tree-shakeable modules so consumers pay only for what they import.

#### Scenario: Core vs full bundle
- **WHEN** `npm run build && du -h dist/` is measured with `esbuild`/`vite` and `sideEffects:false`
- **THEN** `purechess/core` (rules + board, no PGN, no Chess960) gzipped SHALL be ≥30% smaller than `chessops` full import gzipped, and `purechess` (re-export all) SHALL be ≤110% of `chessops` gzipped

#### Scenario: Tree-shaking is verified
- **WHEN** a consumer imports `import { Chess } from "purechess/core"`
- **THEN** the production bundle SHALL NOT include `parsePgn` or Chess960 castling tables (verified via `npm run bench:bundle -- --entry core`)

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
