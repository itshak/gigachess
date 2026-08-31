## Purpose

Defines zero-allocation 64-bit Zobrist hashing via `{ lo: number, hi: number }` (matching Shakmaty / Polyglot constants) and 16-bit binary move packing (`moves2`) for high-speed game replay and compact in-memory database storage.

## ADDED Requirements

### Requirement: 64-bit Zobrist Hashing SHALL Use Zero-BigInt 32-bit Integer Pairs

The system SHALL provide `src/zobrist.ts` computing 64-bit Zobrist hashes represented as `{ lo: number, hi: number }` using standard Polyglot/Shakmaty random constants. The engine SHALL maintain the Zobrist key incrementally ($O(1)$) in `makeMove` across piece movements, captures, castling changes, and legal en-passant states without allocating `BigInt` objects.

#### Scenario: Incremental Zobrist matches scratch computation
- **WHEN** a game is played for 100 plies via `makeMove`
- **THEN** at every ply, `pos.zobrist` updated incrementally is bit-identical to `calculateZobrist(pos)` computed from scratch

#### Scenario: Transposition equivalence
- **WHEN** two different move sequences reach the identical chess position (e.g. `1. d4 Nf6 2. c4` vs `1. c4 Nf6 2. d4`)
- **THEN** both positions evaluate to the exact same `{ lo, hi }` Zobrist key

#### Scenario: En-passant square hashing respects capture legality
- **WHEN** a double pawn push occurs but no opponent pawn is situated on adjacent files to execute an en-passant capture
- **THEN** the en-passant file is omitted from the Zobrist hash (matching Polyglot and `shakmaty::zobrist::Zobrist64`)

### Requirement: 16-bit Packed Move Encoding SHALL Conform to the 2-Byte `moves2` Format

The system SHALL provide `src/packedMove.ts` implementing `packMove(from: number, to: number, promo: number = 0): number` and `unpackMove(word: number): { from: number, to: number, promo: number }` conforming to the 16-bit encoding:
- Bits 0..5 (6 bits): `from` square index (0..63)
- Bits 6..11 (6 bits): `to` square index (0..63)
- Bits 12..15 (4 bits): promotion role (0=none, 1=Knight, 2=Bishop, 3=Rook, 4=Queen)

#### Scenario: Lossless round-trip of move packing
- **WHEN** all legal moves including normal moves, castling, en-passant, and underpromotions are packed via `packMove` and decoded via `unpackMove`
- **THEN** every move decodes with identical `from`, `to`, and `promo` fields

#### Scenario: High-speed binary game replay from Uint16Array
- **WHEN** a game encoded as a `Uint16Array` (or `Uint8Array`) is replayed via `Chess.fromMoves2(buffer)`
- **THEN** the entire game is replayed with zero intermediate object allocations and the final position matches SAN text replay
