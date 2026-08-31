# Design: purechess-bench-real

## Context

`src/` is implemented and validated (`tests/parity.mjs` 14/14 vs chessops,
`tests/perft.mjs` ALL PASS). The remaining risk is performance claims: the
existing harness is primitive and measures synthetic workloads. This change
builds the real-world measurement rig that the migration decision will trust.

## Goals / Non-Goals

- **Goals:** statistically robust (20-run median, warmup, forced GC), parity
  check before timing (a faster-but-wrong library must fail, not win),
  reproducible (pinned corpora by sha256, pinned Node, pinned chessops).
- **Non-Goals:** changing `src/`; browser benchmarking (Node/V8 only per
  ADR-012); CI running full 100k streaming per commit (CI runs a `--quick`
  mode with 1k games, full suite nightly).

## Decisions

### D1: Driver — tinybench over mitata
Both are MIT. `tinybench` gives explicit `setup/teardown` hooks (needed for
`global.gc()` between iterations) and Task API to interleave purechess and
chessops alternately, reducing thermal/allocator drift. mitata's pretty
output is nice but its batching is less controllable. Fallback: if tinybench's
GC hook granularity proves insufficient, drop to hand-rolled
`performance.now()` loops with identical statistics (the spec requires the
methodology, not the library).

### D2: 20-run median, 3 warmups
Spec amendment from 5-run median: 20 iterations after 3 warmups; median
(resistant to JIT recompilation cliffs) reported alongside p10/p90 for
transparency. `--expose-gc` mandatory; harness exits with instructions if
`global.gc` is undefined.

### D3: Sliding occupancies from perft trees
Uniform-random occupancies over-represent impossible piece densities. The
suite runs perft(4) on the 6 standard perft positions, sampling the occupancy
bitboards of every visited position (dedup via `lo*2^32+hi` key), until 10M
unique samples or corpus exhaustion (replaying with varied move orders to
reach 10M). `MAttacks/s` = queen attacks over these real occupancies.

### D4: Castling normalization in parity comparisons
Per ADR-013, purechess emits `e1g1` while chessops emits `e1h1`. All dests/
UCI parity helpers canonicalize king→rook destinations to the landing square
before comparing (same helpers as `tests/parity.mjs`).

### D5: Streaming corpus pinning
`bench/data/README.md` records the `.zst` sha256; the harness decompresses to
a temp dir, takes the first 100,000 games (deterministic), and refuses to run
if the hash mismatches. Peak heap via `process.memoryUsage().heapUsed`
sampled post-GC at game-count checkpoints.

## Risks / Trade-offs

- Full suite runtime ~10–15 min (100k games × 20 runs × 2 libs) → mitigated
  by `--quick` mode for CI and `--suite <name>` selection.
- Node version drift → `bench/README.md` pins the version; harness prints
  `process.version` with results and fails if it differs from the pinned one.

## Migration Plan

Additive: new `bench/suites/*`, new npm scripts, README updates. No removal
of existing primitive harness until suites supersede it.

## Open Questions

- None blocking. `tinybench` vs hand-rolled resolved at implementation time
  per D1 fallback rule.
