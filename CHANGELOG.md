# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.1] - 2026-09-05

### Fixed
- **True Zero Dependencies:** Inlined lightweight `Result` type matching `@badrap/result` contract in `gigachess/chessops`, removing `@badrap/result` from production dependencies (`dependencies: {}`).

## [0.4.0] - 2026-09-05

### Added
- **Native Stateful `Board` Root API:** Promoted the high-performance in-place stateful `Board` engine to root default (`import { Board } from 'gigachess'`), delivering **44.5x faster move execution** (5.98M ops/s) and **11x faster legal movegen** (541k pos/s).
- **Decoupled `chess.js` Wrapper:** `Chess` is now available as a dedicated drop-in wrapper via `import { Chess } from 'gigachess/chessjs'` with full method parity.
- **Chess960 Polyglot Zobrist Scheme:** Full 16-key castling Zobrist derivation matching canonical Polyglot keys and deterministic splitmix64 PRNG constants.
- **Zero-Allocation Legal Move Buffers:** Direct writing into `Uint16Array(256)` via `board.legalMoves(buffer)`.
- **Streamlined TypeScript Marketing Documentation:** Minimalist marketing README and updated branding focused on pure TypeScript performance.

## [0.3.0] - 2026-09-04

### Added
- **Standard Chess Fast-Path Separation:** 4-bit integer castling mask (`WK=1, WQ=2, BK=4, BQ=8`) and instant `CASTLE_CLEAR_STD` table lookups eliminating `Set<number>` allocations.
- **Zero-Allocation Targeted SAN Parser:** Reverse-attacker queries (`attacks.attackersTo & pieceRoleBB`) reducing SAN parse latency from ~6.5 µs to **~493 ns/op** (>8x speedup).
- **Branchless `isCheck` Detection:** Cached `checkers: SquareSet` on `Position` enabling 2-op bitwise check detection (`(lo | hi) !== 0`) at **0.5 ns/op** (>2 Billion ops/sec).
- **Piece-Centric Move Generation:** Direct iteration over piece bitboards with parallel 32-bit pawn push and capture shifts, monomorphized for White and Black.
- **`MoveSink` Bulk Popcount & Zero-Allocation Patterns:** `countLegalMoves(pos)` bulk popcounter at perft leaves, `legalMovesInto(pos, buffer)` packed move writing, and `forEachLegalMove` visitor pattern.
- **Static Castling Path & Flat Line Ray Tables:** 128-entry `CASTLE_PATH_LO`/`HI` and 4,096-entry `LINE_RAY_LO`/`HI` flat typed arrays replacing dynamic loops and pin-ray maps.
- **Lockstep Differential Fuzz Testing:** 1,000-game differential fuzz suite (`tests/fuzz-differential.mjs`) verifying 118,380 plies and 11,684 undos with 0 mismatches.
- **Benchmark Breakthroughs:** Startpos perft throughput increased to **18.50 Mnps** (+117.4% faster than `chessops`), movegen **3.8x–5.3x faster than Rust WASM** (`ultrachess`), and SAN movegen up to **7.4x faster than `chess.js`**.

## [0.2.1] - 2026-09-02

### Changed
- **Rebranding to GigaChess:** Renamed library and npm package identifier to `gigachess`.
- **Ecosystem Alignment:** Unified TypeScript and Rust chess engines under the shared `gigachess` namespace and aligned with GigaBase.
- **Backward Compatibility:** Published `turbochess@0.2.1` forwarding shim package with deprecation notice advising migration to `gigachess`.
- **Brand Assets:** Deployed new cybernetic mechanical knight visual assets (`assets/logo.png`, `assets/social-preview.png`).

## [0.2.0] - 2026-09-01

### Added
- **Unified Super `Chess` Class:** 100% `chess.js`-compatible API with full bitboard backing, 3.5x faster operations, and drop-in replacement ergonomics.
- **Built-in `chesstree` Variation Trees:** `game.toTree()` and `Chess.loadTree(pgn)` for interactive branching analysis and annotated PGN rendering.
- **Zero-BigInt Bitboards:** Split 32-bit `{ lo, hi }` layout executing directly in CPU registers with zero garbage collection overhead.
- **Stockfish `CheckContext`:** Single-pass pin and check analysis calculating king attackers, pins, and check-intercept rays once per position.
- **Black Magic Sliding Bitboards:** Hardware-grade Bishop, Rook, and Queen ray generation yielding over 35.5 Million attacks/second.
- **Precomputed $64 \times 64$ Flat Tables:** $O(1)$ ray and between-square lookup tables (`Uint32Array(4096)`) eliminating dynamic loops.
- **Incremental 64-bit Polyglot Zobrist Hashing:** $O(1)$ XOR updates in `makeMove` and instant repetition/transposition checking.
- **16-bit Packed Move Streams (`moves2`):** Binary move serialization (`Uint16Array`) providing a 25x reduction in game memory footprint (160 bytes for an 80-ply game).
- **Single-Pass FEN Scanner:** 285,000 FENs/sec zero-regex scanner with exact parsing parity.
- **Chessops Compatibility Module:** Deep imports at `gigachess/chessops/*` providing a 100% MIT-licensed drop-in for `chessops`.
- **Automated CI & Release Workflows:** GitHub Actions matrix testing and automated npm publishing on version tags.

### License
- Clean-room implementation under the permissive **MIT License**.
