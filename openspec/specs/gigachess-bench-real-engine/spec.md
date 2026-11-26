# gigachess-bench-real-engine Specification

## Purpose
Real benchmark harness executed before any engine changes, frozen baseline recording, post-optimization re-benchmarking, and documentation updates across README and ADRs.

## Requirements

### Requirement: Real Perft Harness SHALL Replace Stub

The system SHALL provide `bench/bench-perft.mjs` running real `perft(board, depth)` median-of-3 wall-clock throughput vs reference node counts (e.g. `119,060,324` nodes for `startpos d6`), gating on exact count equality or exiting non-zero.

#### Scenario: Perft baseline is real and verified
- **WHEN** `node bench/bench-perft.mjs --depth 6` is run
- **THEN** output reports real `nodes`, `ms`, and `Mnps` (not synthesized), verifies exact reference counts, and exports `bench-results/gigachess-baseline.json`.

### Requirement: Micro Harness SHALL Measure All Core Operations

The system SHALL provide `bench/bench-micro.mjs` (`BENCH_ITERS` env, default `200k`, 3 passes median) reporting median `ns/op` for:
- `fenWrite` and `fenParse`
- `movegen one-shot` (startpos, Kiwipete, 960)
- `make+unmake` 48-ply
- `isCheck` in/out
- `zobrist hash` incremental and scratch
- `SAN parse` and `SAN render`
- `clone` / board copy

#### Scenario: Micro numbers are comparable
- **WHEN** `node bench/bench-micro.mjs` is run
- **THEN** it emits `ns/op` per axis and writes baseline metrics to `bench-results/gigachess-baseline.json`.

### Requirement: Baseline SHALL Be Frozen Before Any Engine Modifications

The system SHALL execute the complete benchmark harness and freeze `bench-results/gigachess-baseline.json` and `bench-results/gigachess-baseline.md` BEFORE modifying engine source code.

#### Scenario: Baseline freeze gate
- **WHEN** beginning engine optimizations
- **THEN** baseline results exist in git, and each optimization patch is verified to produce measurable speedup without regressions.

### Requirement: Post-Optimization Re-Benchmarking SHALL Record Deltas and Update Documentation

The system SHALL rerun the identical benchmark harness after all optimizations land, record `bench-results/gigachess-after.json`, update the benchmark and head-to-head comparison tables in `README.md`, codify an Architectural Decision Record (`ADR-014: Maximum Performance & Zero-Allocation Architecture`), and update main specifications.

#### Scenario: Full before/after audit and README sync
- **WHEN** all optimization phases are complete
- **THEN** `README.md` reflects updated speedups and comparison numbers against `chess.js`, `chessops`, and `ultrachess`, `ADR-014` is created in `openspec/adr/`, and delta specs are synced.

### Requirement: Release comparisons SHALL distinguish public API shapes and initialization

The release benchmark SHALL pin competitor versions and source commits,
use fresh boards and exact legal move-set and SAN parity before timing,
preserve raw per-platform samples, and distinguish native lists, normalized
UCI, SAN, FEN, validated replay and perft. Published competitor results and
source-only results SHALL remain distinct. A WASM engine's warm throughput
SHALL be reported separately from pure-JS results and from first-use latency.
Cold-start measurements SHALL use fresh processes, record the actual
initialization policy, and state whether process launch and table loading
are included. No global fastest claim is justified by a partial matrix.

#### Scenario: Reproduce 0.6.0 evidence
- **WHEN** reviewing release performance
- **THEN** use [the release report](../../../docs/BENCHMARKS.md), its pinned
  reproduction scripts and raw Phase22 data; report FEN/perft trade-offs,
  deferred Mac/browser validation and UltraChess warm/cold results separately.
