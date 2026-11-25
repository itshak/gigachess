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
- [x] Consistently beat current published drumevp on deep start and Kiwipete perft
- [ ] Validate performance on newer CPUs and browser engines

## Phase 5: promotion-rank guards and competitive benchmarking (2026-11-25)
- [x] Optimize leaf promotion counts only when a pawn is on the
      penultimate rank; preserve exact captures and underpromotions
- [x] Verify ordinary and fast-board standard/Chess960 correctness,
      full chess.js 1,000-game differential test and 380 move-order fixtures
- [x] Compare actual minified fast bundles over 11 alternating A/B rounds
- [x] Run nine-round source/no-hash versus published-drumevp comparisons;
      demonstrate narrow mixed-corpus but not deep-perft superiority
- [x] Reject inlining non-pawn legalMovesInto, conditional halfboard
      popcounts and perft piece-code leaf reuse because of regressions
- [x] Document raw samples and preserve draft/npm release gate
- [x] Consistently outperform MIT drumevp's published build on
      start d5 and Kiwipete d4 without gameplay/correctness regression

## Phase 6: structural context and irrelevant EP processing
- [x] Profile start d5 and inspect competing color-separated representation
- [x] Isolate EP normalization, blocked castling plans, masked bulk pawns, singleton pin masks
- [x] Validate combined candidate with complete npm test and 9,933-position independent leaf/perft2 oracle
- [x] Repeat paired fast-bundle comparisons and use fixed-CPU wall/process-time measurements
- [x] Retain combined draft with repeatable start gain and document small gameplay/Kiwipete regressions and shared-host noise
- [x] Nine-round competitor run: first start d5 win over published drumevp; mixed effectively tied; Kiwipete and raw movegen still behind
- [x] Preserve king-target role-mask reuse prototype and initial 11-round A/B evidence
- [x] Repeat king-role mask prototype on fixed CPU, full npm test, real workload A/B and competitor
- [x] Achieve repeatable Kiwipete superiority; test packed color-separated perft state if necessary
- [ ] Verify official pinned-runtime real-workstation gates and independent CPU/browser performance before release

## Phase 7: independent compact standard perft
- [x] Repeat Phase 6 king-safety prototype, full test and gameplay A/B
- [x] Implement color/role-separated per-ply compact standard perft state
- [x] Independent depth-three differential test, 571 positions, two entries
- [x] Full npm test, independent leaf test, package dry run
- [x] Same-run nine-round source/npm perft victory in all five measured lanes
- [x] Reproduce five perft wins on pinned Node 24 and Bun; record Node 22 raw data
- [x] Add uncached preconstructed equal-work movegen lane; identify remaining deficit
- [ ] Close uncached movegen deficit, pinned general-gate failures and repeat on another CPU/browser
- [ ] Release only after all gates and independent validation
- [x] Follow-up isolated direct list, smaller buffer, array emission, compact conversion and direct magic table experiments
- [x] Preserve raw data, exact patches, fresh-engine fair runner, and arithmetic oracle
- [ ] Fully validate and retain only broad winning direct movegen variants


## Phase 8: direct public movegen and split-half perfect hashes
- [x] Complete direct-generator differential verification and independent result ownership/reentrancy tests
- [x] Implement split 32-bit injective occupancy hashing, exactly 107,648 entries, reproducible blobs
- [x] Implement synchronous nearest-blocker ray fallback, exhaustive cold/loaded parity
- [x] Pass both unchanged official sliding throughput gates in isolated pinned-runtime run
- [x] Run full correctness suite, extended movegen/perft tests and package dry run
- [x] Win all comparable main competitive lanes in nine-round Node 24.19 run
- [ ] Reproduce fresh 4,000-position uncached movegen victory; report both workloads
- [ ] Complete broader release gates and independent CPU/browser verification
