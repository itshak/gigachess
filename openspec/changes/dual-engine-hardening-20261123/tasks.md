# Implementation tasks — JS/TS

## Correctness (first slice)
- [x] Fix async Zobrist hydration before move mutation and undo; add regression
- [x] Correct legal-EP FIDE threefold/fivefold equality while preserving Polyglot
- [x] Expose mirrored `repetitionKey` in root and core APIs
- [x] Protect shared standard and Chess960 rights from external mutation
- [x] Correct all square colors and compare all 64 to chess.js
- [x] Provide checked moves2 replay and unaligned little-endian byte decoding
- [x] Support explicit `Board.fromFen(...,{chess960:true})` construction
- [x] Accept nonnegative safe FEN halfmove counters above automatic-draw limit
- [x] Run typecheck, full perft/compatibility suites and 1,000-game fuzz
- [x] Run same-host warm perft regression: patched 8.23 vs 8.32 Mnps startpos;
      9.12 vs 9.07 Mnps Kiwipete; no meaningful throughput regression
- [ ] Run broader cold/warm user-workload benchmarks before release

## Documentation and test hardening
- [x] Create linked JS/Rust OpenSpec proposals and identical common contract
- [x] Correct stale OpenSpec config (formerly PureChess/AGPL/UI) and AGENTS.md
- [x] Update README/examples on async hash, 960, checked replay and measured claims
- [x] Add shared golden FEN, packed moves, Polyglot/repetition key fixtures
- [ ] Test all 960 start positions and unusual swap/empty-path castling cases
- [ ] Add parser corruption/limit tests (PGN, moves2, FEN, long games)
- [ ] Browser (Chromium/Firefox/WebKit), Node22/24 and Bun/Deno smoke tests
- [ ] Confirm public API shape and `.d.ts` export stability versus v0.5.0

## Performance research and release
- [ ] Benchmark drumevp and emerging pure-TS libraries fairly, with warm/cold
      UI-latency, not only recursive perft; log versions and machines
- [ ] Profile and prototype leaf move counting and pin/EP fast paths; keep only
      individually measured, parity-tested improvements
- [ ] Separate real PGN incremental parsing from buffering-at-finish claims
- [ ] Clean up stale benchmark import in dev-only Ultrachess comparison harness
- [ ] Document perf results / update advertising only after substantiation
- [ ] Prepare patch release notes, links to Rust companion and adoption guidance
