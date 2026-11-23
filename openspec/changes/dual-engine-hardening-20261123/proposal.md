# Proposal: Dual-engine correctness, compatibility and performance stewardship (JS)

## Why
GigaChess JS is an actively consumed high-performance chess library. Its broad
perft/random-game suite was green while independently reproducible bugs remained:
late-loaded Zobrist keys could be incremented from the wrong position; threefold
repetition compared raw EP targets; shared mutable standard-castling Sets could
corrupt other Board instances; `squareColor` was inverted and its test confirmed
the wrong result. Packed moves2 was unsafe on untrusted input and rejected odd
byte offsets. The Rust crate must remain the cross-language rules/format peer.

Additional real-server work found another pure-TS project,
`@drumevp/chess-engine`, ~2x faster on startpos d5 and Kiwipete d4 perft on the
same host. Existing benchmark superlatives require revalidation; UI latency
and lazy-load costs should be measured separately from bulk operations.

## What changes
- Fix and prevent regressions in all confirmed bugs (as first implementation
  slice): pre-move Zobrist hydration, legal EP repetition, immutable standard
  rights, 64-square color parity, optional checked replay, aligned/unaligned
  little-endian move transport, and Chess960 construction.
- Publish a `repetitionKey` that matches Rust `Board::repetition_key`, without
  modifying canonical Polyglot hash results.
- Preserve packed `moves2`, castling king-to-rook wire representation, null
  sentinel, hash vectors, package exports and existing public fast methods.
- Expand independent differential/property testing and benchmark competitors
  with actual user workloads and startup latency.
- Maintain true pure TS/JS operation: **NO WASM integration or runtime gate**.

## Non-goals
- A Rust/WASM backend for JavaScript, engine search/NNUE, variant expansion,
  a breaking chess.js adapter overhaul, or performance changes unvalidated by
  reproducible tests.

## Safety, licensing and consumers
- MIT-only implementation, respect licenses before copying any external code.
- Retain `Board.fromMoves2` as the legacy *trusted-input* fast path; opt into
  `Board.fromMoves2Checked` at untrusted ingress. No silent perf break.
- Interactive chessboard and screen-reader consumers need identical legal
  move, check and draw results; no visual accessibility widgets are introduced.
- Mirror and test all cross-language contract changes in the Rust proposal
  with the same change ID and identical normative contract spec.

## External research
See `research.md` and `design.md`. The release claim must define benchmark
workloads, machine/runtime, cold/warm state and exact competitor versions.
