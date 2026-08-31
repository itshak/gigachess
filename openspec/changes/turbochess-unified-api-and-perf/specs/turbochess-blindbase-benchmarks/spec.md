## Purpose

Defines the specialized benchmark suite `bench/suites/blindbase-real.mjs` measuring real-world workstation workloads derived from `blind-base` (repertoire tree building, master reference streaming, Chessground dest formatting, UCI stream to SAN) with responsive progress reporting.

## ADDED Requirements

### Requirement: Benchmark Suite SHALL Profile the Four Core Workstation Workloads

The system SHALL provide `bench/suites/blindbase-real.mjs` executed via `npm run bench:real -- --suite blindbase-real` that benchmarks the following 4 workloads:
1. **Repertoire Tree Construction**: Ingests 5,000 repertoire lines, normalizes FEN keys, and merges variation branches.
2. **Master Reference Game Indexing**: Streams and parses 10,000 master games with `pgnImport`, building prefix tree aggregates.
3. **Chessground Legal Dests**: Formats `pos.allDests()` into `Map<Key, Key[]>` structures across 10,000 real-game positions.
4. **Live Engine UCI Stream**: Translates 100,000 UCI move plies to legal SAN strings with check/mate disambiguation.

#### Scenario: Real-world workstation benchmark runs in single command
- **WHEN** `node --expose-gc bench/bench-real.mjs --suite blindbase-real` is executed
- **THEN** it reports throughput (ops/sec and games/sec) and peak heap for all 4 workloads, comparing TurboChess against `chessops` and `chess.js` baselines

### Requirement: Benchmark Harness SHALL Provide Real-Time Progress Reporting

The benchmark harness SHALL emit live progress indicators during intensive iterations to prevent perceived harness hangs during long measurement cycles.

#### Scenario: Progress reported during long runs
- **WHEN** running full statistical benchmarking loops with 20 runs
- **THEN** the harness logs progress after each iteration or every 2 seconds so contributors and CI see active execution
