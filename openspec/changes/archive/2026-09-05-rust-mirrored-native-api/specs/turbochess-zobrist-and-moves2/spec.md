## MODIFIED Requirements

### Requirement: 64-bit Zobrist Hashing SHALL Use Zero-BigInt 32-bit Integer Pairs

The system SHALL provide `src/zobrist.ts` computing 64-bit Zobrist hashes represented as `{ lo: number, hi: number }` using standard Polyglot/Shakmaty random constants. The engine SHALL maintain the Zobrist key incrementally ($O(1)$) in `makeMove` across piece movements, captures, castling changes, and legal en-passant states without allocating `BigInt` objects. For Chess960, castling rights SHALL be hashed with 16 per-rook-file keys indexed by `color * 8 + file` matching `gigachess-rs` (ADR-003), where files a/h pin to Polyglot keys 768..771 and files b..g derive from deterministic `splitmix64` PRNG seeded with `0x00C0_FFEE_DABA_D00D`.

#### Scenario: Incremental Zobrist matches scratch computation
- **WHEN** a game is played for 100 plies via `makeMove`
- **THEN** at every ply, `pos.zobrist` updated incrementally is bit-identical to `calculateZobrist(pos)` computed from scratch

#### Scenario: Transposition equivalence
- **WHEN** two different move sequences reach the identical chess position (e.g. `1. d4 Nf6 2. c4` vs `1. c4 Nf6 2. d4`)
- **THEN** both positions evaluate to the exact same `{ lo, hi }` Zobrist key

#### Scenario: En-passant square hashing respects capture legality
- **WHEN** a double pawn push occurs but no opponent pawn is situated on adjacent files to execute an en-passant capture
- **THEN** the en-passant file is omitted from the Zobrist hash (matching Polyglot and `shakmaty::zobrist::Zobrist64`)

#### Scenario: Chess960 castling rights hash with 16 per-rook-file keys
- **WHEN** a Chess960 position has castling rights associated with rooks on inner files (b..g)
- **THEN** the castling keys XORed into the Zobrist hash correspond to `color * 8 + file` using the `splitmix64` seeded constants, producing bit-identical hashes to `gigachess-rs`
