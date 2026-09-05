# gigachess-perf-bulk-count Specification

## Purpose
Bulk counting at perft leaves via `MoveSink` generic, avoiding `Move` materialisation.

## Requirements

### Requirement: Move Generation SHALL Support Bulk Sink

The system SHALL expose `generateLegalMoves(pos, ctx, sink: MoveSink)` where `sink.push_targets(from, mask)` receives whole target bitboards and `MoveCounter` sink sums `popcnt32` without `pop_lsb`.

#### Scenario: Bulk perft leaf
- **WHEN** `perft(pos,1)` is called
- **THEN** it uses `MoveCounter` sink, never allocates `Move[]`, and node count equals `perft(pos,1)` via materialising path

### Requirement: countLegalMoves SHALL Be O(1) Alloc-Free

The system SHALL expose `countLegalMoves(pos):number` using bulk sink, `0` heap allocs.

#### Scenario: Perft d6 uses bulk at leaves
- **WHEN** `perft(pos,6)` is run
- **THEN** its leaf `depth==1` calls use `countLegalMoves` path and `tests/perft.mjs` still `ALL PASS` with `>3%` `Mnps` win vs baseline or patch is reverted
