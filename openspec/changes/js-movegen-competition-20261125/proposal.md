# Proposal: close the pure TypeScript perft gap

## Motivation
Marketing must reflect measured, correctness-gated results.
drumevp's published npm package still leads on several perft workloads.

## Scope
- Preserve pure TypeScript runtime, public methods, Chess960,
  Polyglot/FIDE semantics, null moves and binary moves2 format.
- Adapt MIT high-half magic indexing, low-allocation SquareSet operations,
  material-aware king safety, specialized move generation,
  bulk pawn leaf counting, and direct ordinary pawn list emission.
- Keep independent attack-map, reference move-order and game-oracle tests.
- Compare pinned drumevp source, published npm, chessops and chess.js.
- Keep hash-loaded and hash-free benchmarks distinct.
- Do not publish a new version before benchmark requirements pass.

## Out of scope
- WASM, weakening chess correctness, global movegen scratch,
  GPL code adaptation, routine GitHub CI minute consumption.
