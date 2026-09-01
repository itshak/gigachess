## Purpose

Real bench harness before any engine win, with frozen baseline and parity-gated publishing like `ultrachess/BENCH.md`.

## ADDED Requirements

### Requirement: Real Perft Harness SHALL Replace Stub

The system SHALL replace `bench/bench-perft.mjs` synth (`+45ms`) with real `perft(board,depth)` median-of-3 `Throughput::Elements` vs `119060324` `startpos d6`, and optional `chessops` compare when installed.

#### Scenario: Perft baseline is real and gated
- **WHEN** `node bench/bench-perft.mjs --depth 6` is run on a clean `master`
- **THEN** output shows real `nodes`, `ms`, `Mnps` (not synth), node count equals reference or exits non-zero, and `bench-results/turbochess-baseline.json` stores `perft.d6.Mnps` baseline

### Requirement: Micro Harness SHALL Match ultrachess Rows

The system SHALL provide `bench/bench-micro.mjs` (`BENCH_ITERS` env, default `200k`, 3 passes median) for `fenWrite`, `fenParse`, `movegen one-shot`, `make+unmake 48-ply`, `isCheck in/out`, `hash`, `SAN 48`, `clone` with `ns/op` and vs-reference where applicable.

#### Scenario: Micro numbers are comparable
- **WHEN** `BENCH_ITERS=200k node bench/bench-micro.mjs` is run
- **THEN** it emits `nsPerOp` per row matching `ultrachess/BENCH.md` table shape and writes `bench-results/micro-baseline.json`

### Requirement: Baseline SHALL Be Frozen Before Engine Patches

The system SHALL freeze `bench-results/turbochess-baseline.json` + `.md` after harness lands and before `bulk`/`zero-copy`/`cached` patches, and every later engine PR diffs median `>3%` vs baseline.

#### Scenario: One-patch-at-a-time gating
- **WHEN** a `bulk` patch PR runs `bench-micro` + `bench-perft`
- **THEN** CI reports `±%` vs frozen baseline median and requires `>3%` win and `tests/perft.mjs PASS` to merge, otherwise revert
