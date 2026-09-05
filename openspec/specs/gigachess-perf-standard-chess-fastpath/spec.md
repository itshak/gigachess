# gigachess-perf-standard-chess-fastpath Specification

## Purpose
Fast-path separation between Standard Chess and Chess960, replacing Set<number> castling with a 4-bit integer mask and O(1) table clearing.

## Requirements

### Requirement: Standard Chess SHALL Use 4-Bit Integer Castling Rights

The system SHALL represent Standard Chess castling rights using a 4-bit integer mask (`WK = 1, WQ = 2, BK = 4, BQ = 8`), bypassing JavaScript `Set<number>` instantiation.

#### Scenario: Castling rights clearing on move
- **WHEN** a move is made from `from` to `to` in Standard Chess
- **THEN** castling rights are updated via `pos.castlingMask &= (CASTLE_CLEAR_STD[from] & CASTLE_CLEAR_STD[to])` with zero heap allocations.

### Requirement: Standard Chess Castling Clearance SHALL Use Constant Bitmasks

The system SHALL verify Standard Chess castling clearance using constant bitwise checks:
- White Kingside (O-O): `(pos.board.occupied.lo & 0x00000060) === 0`
- White Queenside (O-O-O): `(pos.board.occupied.lo & 0x0000000E) === 0`
- Black Kingside (O-O): `(pos.board.occupied.hi & 0x60000000) === 0`
- Black Queenside (O-O-O): `(pos.board.occupied.hi & 0x0E000000) === 0`

#### Scenario: Standard castling clearance check
- **WHEN** evaluating legal castling moves in Standard Chess
- **THEN** clearance is evaluated in a single bitwise AND without iterating squares or calling `attacks.between()`.
