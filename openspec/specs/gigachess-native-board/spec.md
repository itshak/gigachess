# gigachess-native-board Specification

## Purpose
Defines the Rust-mirrored Board native engine API, providing stateful in-place move execution with Undo, 16-bit moves2 representation, zero-allocation legal move generation, and instant Zobrist and check status queries.

## Requirements

### Requirement: Stateful In-Place Move Execution with Undo
The system SHALL export a stateful `Board` class providing in-place move execution `board.makeMove(moveWord: number): Undo` and unmake `board.unmakeMove(undo: Undo)` operating directly on 16-bit `moves2` integers.

#### Scenario: Playing and undoing a 16-bit packed move
- **WHEN** a legal 16-bit `moves2` move is played on a `Board` instance via `board.makeMove(word)`
- **THEN** the internal bitboards, turn, castling rights, and Zobrist hash advance in-place without heap allocations, and calling `board.unmakeMove(undo)` restores the exact prior state

### Requirement: Zero-Allocation Legal Move Generation Buffer
The system SHALL provide `board.legalMoves(outBuffer?: Uint16Array): Uint16Array` and `board.forEachLegalMove(fn: (moveWord: number) => void): void`, writing packed 16-bit `moves2` integers into a caller-supplied buffer or visitor callback without allocating move objects.

#### Scenario: Writing legal moves into a reusable Uint16Array buffer
- **WHEN** `board.legalMoves(buffer)` is invoked with a 256-element `Uint16Array`
- **THEN** all legal `moves2` words for the current side to move are written directly into the buffer and the function returns the count of legal moves with zero heap allocations

#### Scenario: Visitor iteration via forEachLegalMove
- **WHEN** `board.forEachLegalMove(fn)` is called on a `Board` instance
- **THEN** `fn` is invoked for each legal move word as a primitive JavaScript number without intermediate array or object allocations

### Requirement: Direct Zobrist and Check Status Access
The system SHALL expose `board.zobristBigInt(): bigint`, `board.zobristLo: number`, `board.zobristHi: number`, `board.zobristHex(): string`, and `board.inCheck(): boolean` directly on `Board`.

#### Scenario: Instant O(1) query of checkers and incremental hash
- **WHEN** `board.inCheck()` is called
- **THEN** it returns true or false in $\approx 0.5\text{ ns}$ derived from the cached checkers bitboard without scanning the board
- **AND** `board.zobristBigInt()` or `board.zobristHex()` reflects the current position's 64-bit Polyglot Zobrist key

### Requirement: Lazy On-Demand String Projections
The system SHALL provide `board.toSan(moveWord: number): string`, `board.toUci(moveWord: number): string`, `board.toFen(): string`, `board.parseSan(san: string): number | null`, and `board.parseUci(uci: string): number | null` on `Board`.

#### Scenario: Generating SAN, UCI, and FEN strictly on-demand
- **WHEN** a UI component requests display strings via `board.toSan(moveWord)` or `board.toFen()`
- **THEN** the formatted string is computed directly from the current board bitboards and 16-bit move word without mutating board state
