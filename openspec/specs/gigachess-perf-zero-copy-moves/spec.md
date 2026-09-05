# gigachess-perf-zero-copy-moves Specification

## Purpose
Zero-copy move share via caller-owned `Uint32Array` to cut GC on batch replay.

## Requirements

### Requirement: legalMovesInto SHALL Fill Caller Buffer

The system SHALL expose `legalMovesInto(pos, out:Uint32Array):number` writing packed `from|to<<6|promo<<12` per move and returning count, without allocating.

#### Scenario: Batch replay without per-call alloc
- **WHEN** `replay_moves2_batch` style loop calls `legalMovesInto` with a shared `Uint32Array(256)` sliced per game
- **THEN** `bench-micro` `movegen one-shot` `nsPerOp` does not regress and heap `MB` per `replay` batch drops `>10%` vs baseline or patch reverted

### Requirement: Packed Word SHALL Match moves2 Wire Format

The system SHALL pack `promo` as `0=none,1=N,2=B,3=R,4=Q` matching `src/packedMove.ts: word = from|(to<<6)|(promo<<12)` and `word & 0x3f == from`.

#### Scenario: Pack round-trip
- **WHEN** `legalMovesInto` then `unpack` is run for all 218 legal max positions
- **THEN** `from/to/promo` round-trip equals `legalMoves()` `UCI` verbose for that position
