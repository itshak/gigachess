# Competitive and correctness audit — 2026-11-23, Debian aiserver

Source branch: `itshak/gigachess` main `8ef3d5490c34347b873e8a8dc29f918730775595`.
Node 24.13.0. `npm test` baseline passed, including 1,000 differential games,
118,380 plies and 11,684 undo checks with zero mismatches. Nevertheless
independent targeted tests reproduced errors in Zobrist late-load, FIDE
repetition, shared mutable standard castling rights, square colors, and byte
alignment; tests originally asserted the incorrect square-color mapping.

## Actual competitor results (same Linux server)
| workload | GigaChess TS (Mnps) | drumevp TS (Mnps) | result |
|---|---:|---:|---|
| start position depth 5 | 8.03 | 16.92 | 4,865,609 nodes, equal |
| Kiwipete depth 4 | 9.04 | 18.83 | 4,085,603 nodes, equal |

An experiment reusing per-depth move buffers showed no consistent speedup.
The source V8 CPU profile showed high self-samples in `destsFast`,
`analyzeCheckContext`, `genPseudoDests`, `countLegalMoves`, pawn generation and
sliding attacks; GC was nontrivial. Note optimization depends on the workload.
The repo's existing broad perft bench compared favorably against chessops
(about 5.88 vs 4.25 Mnps over 276 positions, depth capped at 4); this is a
DIFFERENT benchmark and not directly interchangeable.

## Research targets, licensing and scope
- drumevp/chess-engine (MIT): real pure TypeScript 2x perft opponent. Evaluate
  reusable check contexts, branch shapes, no per-node arrays, compact undo.
  https://github.com/drumevp/chess-engine
- chess.js (BSD-2-Clause): independent public compatibility oracle.
  https://github.com/jhlywa/chess.js
- chessops (GPL-3.0): differential oracle only; do not copy GPL source.
  https://github.com/lichess-org/chessops
- kokopu (license must be verified before any reuse): PGN variation parsing,
  annotation correctness and SAN fixtures. https://github.com/yo35/kokopu
- chess-movegen-js: JS/worker/WASM multi-backend benchmark reference, not
  integration target. https://github.com/mcarbonell/chess-movegen-js
- Ultrachess Rust/WASM: useful external upper-bound baseline; loading and
  initialization make it inappropriate for default UI-facing synchronous TS.
  https://github.com/yahorbarkouski/ultrachess

## Known caveats
- Baseline README figures are historical Apple Silicon numbers and should be
  treated as hardware/workload-specific, not as a universal fastest proof.
- `PgnParser.feed()` buffers until `finish()`, not constant-memory incremental
  parsing. The benchmark splits a corpus into games before parsing.
- Rust currently has separate rust-side perft-only and cache-skipping makes;
  JS MUST not imitate their stale-cache behavior without an explicit API.
- Scope is library maintenance, not teaching chess-engine search algorithms.
