# ADR-010: Frontend Chess Logic Migration to Chessops and @itshak/chesstree

**Status:** Accepted (August 2026)

## Context

BlindBase originally used `chess.js` (0.13 / 1.0.0-beta) for frontend move validation, FEN parsing, SAN formatting, and board state management.

While `chess.js` served well in early prototyping, several limitations emerged as the desktop workstation evolved:
1. **Performance and Move Generation**: `chessops` uses high-performance bitboard operations (`SquareSet`), matching the standards of Lichess and scalachess.
2. **Ecosystem Compatibility**: `chessops` and `@lichess-org/chessground` share the same types, coordinate conventions, and ecosystem design.
3. **Advanced PGN Tree Support**: `@itshak/chesstree` builds directly on `chessops` data structures to provide fast, robust multi-branch repertoire and game trees with recursive variations, comments, and NAGs without tree-flattening or state mutation issues.
4. **Consistency with Backend**: `chessops` rules and validation semantics align closely with `shakmaty` in the Rust backend.

## Decision

Migrate frontend chess logic from `chess.js` to **`chessops` (GPL-3.0)** and **`@itshak/chesstree` (GPL-3.0)**. Consolidate common chess helpers in `@/lib/chess.ts`.

### Key Migration Architecture

1. **Centralized Chess Adapter (`src/lib/chess.ts`)**:
   - Encapsulates `chessops` modules (`chessops/chess`, `chessops/fen`, `chessops/san`, `chessops/util`, `chessops/types`).
   - Normalizes castling between chessops internal king-to-rook format and standard UCI/SAN destinations (`e1g1`, `e8g8`, etc.).
   - Provides safe helpers: `parseFenToPosition`, `createPosition`, `playMove`, `getLegalMoves`, `computeLegalDests`, `validateFen`, and `turn`.

2. **Castling Disambiguation**:
   - `normalizeMove` and `playMove` strictly verify moving piece role (`isKing`) before remapping castling squares, ensuring rook moves on `e1-h1` or `e8-h8` preserve their true destination.

3. **Error Handling Alignment**:
   - Correctly integrates with `@badrap/result` via boolean properties `parsed.isErr` and `parsed.error` rather than method calls.

## Consequences

### Positive
- Unified bitboard-based chess engine across the entire frontend.
- Rich variation support in PGN games and repertoire workstations via `@itshak/chesstree`.
- Strict type safety and zero reliance on deprecated `chess.js` APIs.
- Full test coverage (67 test files, 510 tests passing).

### Negative
- Chessops internal castling format (king-to-rook) requires explicit destination normalization for standard UCI consumers.
