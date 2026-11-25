# Tasks
- [x] Audit licenses and competitor algorithms
- [x] Implement high-half magic multiply and simpler SquareSet subtraction
- [x] Implement material-aware king safety and specialized destinations
- [x] Implement leaf bulk pawn counting with check/EP/pin fallback
- [x] Add frozen ordered moves and independent attack-union tests
- [x] Reject slower mutable slider-attack and Undo-reuse experiments
- [x] Finish unbiased full competitor rerun and save exact raw metrics
- [ ] Push verified changes to draft PR without npm tag
- [ ] Beat published drumevp perft in all relevant benchmarks

## Additional 2026-11-25 performance round
- [x] Implement perft-private reversible transitions and temporary perft piece codes
- [x] Screen impossible slider pins with precomputed empty-board king rays
- [x] Build optional minified ESM fast entry with lazy table chunks
- [x] Pin published drumevp source+package and compare with nine alternating rounds
- [x] Test Chess960/EP/perft state invariants against 57 frozen reference vectors
- [x] Reject known-role direct clear, exact transposition cache, rook rank/file,
      king attack early-exit, unsafe shortcuts and V8-deoptimized keep-names builds
- [ ] Demonstrate consistent published-drumevp perft wins on mixed, start d5 and Kiwipete d4
- [ ] Demonstrate benefits on Apple Silicon and browser JS engines before any fastest claim
- [ ] Only then decide whether a new package version is justified

## Phase 3 additional testing (2026-11-25)
- [x] Profile and hoist leaf-count helper; preserve isolated raw metrics
- [x] Test bundled vs bundled, not only source against source
- [x] Run repeated published-competitor comparison, same FEN corpus
- [x] Reject non-reproducible hoisting gain and revert source changes
- [x] Keep draft-only release gate and document remaining source/published gaps
- [ ] Implement and validate a more radical deep-perft legal movegen design
- [ ] Beat source and published competitor on ALL comparable workloads on multiple hosts

- [x] Separately test perft-only reusable small Undo and reject uneven
      +5% Kiwipete, -2.4% start and -2.8% promotion results

## Phase 4: MIT-competitor-informed investigations (2026-11-25)
- [x] Inspect MIT drumevp source attack lookup, checker/pin, perft and make/undo algorithms
- [x] Adapt and correctness-test MIT-inspired king-ray pins, fused checker/pin
      analysis, direct king checker lookup and split magic arrays, reject regressions
- [x] Replace four per-role leaf count passes with one unified legal
      non-pawn-role bitboard traversal and retain exact pin/check filters
- [x] Complete 1,000-game chess.js fuzz, 380 frozen move-order fixtures and
      114 standard/Chess960 perft-state fixtures with zero mismatches
- [x] Measure 11-round source and independent bundled A/B, four perft positions
- [x] Run 9-round direct source/published drumevp correctness-gated comparison
- [x] Document all findings and immutable raw timings, no npm release
- [ ] Consistently beat current published drumevp on deep start and Kiwipete perft
- [ ] Validate performance on newer CPUs and browser engines
