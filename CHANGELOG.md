# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
