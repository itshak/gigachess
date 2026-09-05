# gigachess-perf-cached-checkers Specification

## Purpose
Branch-free `inCheck()` via cached `checkers` in `Undo`, like `ultrachess` `0.32ns`.

## Requirements

### Requirement: Undo SHALL Cache prev_checkers

The system SHALL extend `Undo` (`src/chess.ts`) with `prev_checkers:SquareSet` + `prev_zobrist:{lo,hi}` and maintain `Position.checkers:SquareSet` incrementally in `make`/`unmake`.

#### Scenario: inCheck is O(1) without recompute
- **WHEN** `isCheck(pos)` is called after `makeMove`
- **THEN** it returns `checkers.lo|checkers.hi !== 0` without `attackersTo` scan, and `bench-micro` `isCheck` `ns/op` drops `>10%` vs baseline

### Requirement: Unmake SHALL Restore Checkers Without Recompute

The system SHALL restore `checkers` from `Undo.prev_checkers` on `unmake` without `kingAttackers` recompute.

#### Scenario: Make+unmake cycle
- **WHEN** `make` then `unmake` `48-ply` cycle is run
- **THEN** `make+unmake ns/op` does not regress vs baseline and `perft` parity holds for `position 3` `en-passant discovered-check` depth `7`
