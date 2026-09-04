# turbochess-perf-static-path-lookups Specification

## Purpose
Static castling path clearance tables and piece-centric move generation.

## Requirements

### Requirement: Castling Path Clearance SHALL Use Precomputed Bitmasks

The system SHALL precompute rank-0 castling clearance bitmasks `CASTLE_PATH_LO` and `CASTLE_PATH_HI` indexed by `(kFile << 3) | rFile` and evaluate path clearance using bitwise intersection with `pos.board.occupied` in $O(1)$ without runtime square loops.

#### Scenario: Castling clearance evaluation
- **WHEN** castling clearance is evaluated in Standard Chess or Chess960
- **THEN** it checks `((CASTLE_PATH_LO[idx] & occ.lo) | (CASTLE_PATH_HI[idx] & occ.hi)) === 0`.

### Requirement: Move Generation SHALL Iterate Piece Bitboards Directly

The system SHALL generate moves by iterating piece bitboards (`pos.board.pawn`, `pos.board.knight`, etc.) directly with bitwise shifts and `Math.clz32`, without calling `pieceAt` on all 16 squares of the player to move.

#### Scenario: Knight move generation
- **WHEN** knight moves are generated
- **THEN** it iterates `pos.board.knight & own` directly, eliminating square-by-square piece role classification.
