# turbochess-perf-targeted-san Specification

## Purpose
Zero-allocation targeted SAN parsing via reverse attacker queries and fast checkmate suffix detection.

## Requirements

### Requirement: parseSan SHALL Use Reverse Attacker Queries

The system SHALL parse SAN tokens by querying `attacks.attackersTo` for the destination square intersected with the moving role bitboard, disambiguating by file/rank masks, and verifying candidate legality via `isLegal()`, without generating all legal moves for the whole board.

#### Scenario: Single knight move parsed
- **WHEN** `parseSan("Nf3", pos)` is called
- **THEN** it identifies candidate knights attacking `f3` directly, validates the move, and produces the identical `Move` object without calling `genLegalMovesForSan` or `allDests`.

#### Scenario: Ambiguous move disambiguation
- **WHEN** `parseSan("Nbd7", pos)` is called
- **THEN** it filters candidates using the file mask for 'b' and resolves the unique legal move.

### Requirement: makeSan SHALL Optimize Checkmate Suffix Detection

The system SHALL only evaluate `isCheckmate` if the move delivers check (`isCheck(next)` is true). When evaluating mate, the check SHALL early-exit upon finding the first legal king evasion or attacker resolution.

#### Scenario: Quiet non-checking move
- **WHEN** `makeSan(move, pos)` is called for a move that does not deliver check
- **THEN** `isCheckmate` is never evaluated, saving all evasion scan overhead.
