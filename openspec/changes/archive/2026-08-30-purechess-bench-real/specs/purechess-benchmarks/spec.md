# purechess-benchmarks Specification Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
