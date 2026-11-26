# Phase 3: more pure-TypeScript experiments — 2026-11-25

## Result: No demonstrated all-bench victory

No new public package version. Do not claim fastest JS/TS or merge
the draft performance PR yet: the published MIT drumevp package remains
faster in repeated deep perft tests. The prior phase-2 code is retained.
This phase tested additional optimizations in isolated source builds
and in the actual gigachess/fast package build. The apparently favorable
single mixed-perft competition cannot establish superiority because the
larger deep-perft gap remains and repeat-to-repeat throughput changes.

## Hoisted module-level countPiecesForLeaf helper

Refactored the per-call lexical helper in countLegalMoves into a
module-level function to avoid allocating a closure. The complete
1,000-game differential test, Chess960, frozen move-order and attack-map
tests passed.

Source A/B, 11 alternating rounds:
| Position | Original Mnps | Hoisted Mnps | Throughput change |
|---|---:|---:|---:|
| start | 11.692 | 11.916 | +1.9% |
| kiwipete | 12.008 | 12.673 | +5.5% |
| endgame | 7.666 | 9.056 | +18.1% |
| promotion | 15.112 | 15.465 | +2.3% |

Crucially, an independent paired **bundled entry point A/B** on the
same server with equal lazy magic and hash setup showed:
| Position | Previous bundled Mnps | Hoisted bundled Mnps | Change |
|---|---:|---:|---:|
| start | 10.859 | 11.049 | +1.7% |
| kiwipete | 11.622 | 11.345 | -2.4% |
| endgame | 8.197 | 7.135 | -13.0% |
| promotion | 13.722 | 14.600 | +6.4% |

**Rejected**: the prior bundle is faster on Kiwipete and endgame,
so the source-level gain is not robust across compilation boundaries.
The code was reverted; only the reproducible A/B benchmark and this
documentation have been staged.

## Direct nine-round correctness-gated published competitor benchmarks

Two additional runs during this phase, each used 2,600 compared legal
positions, 20 published reference checks, 276 FEN corpus cases,
24 complete replay/undo games and zero mismatches or skips.

Experimental hoisted standalone bundle: mixed-perft-nodes Giga 20.773, published 20.473 Mnps, deep-perft-start-d5-nodes Giga 6.903, published 9.540 Mnps, deep-perft-kiwipete-d4-nodes Giga 9.288, published 13.391 Mnps

Hoisted exact package build: mixed-perft-nodes Giga 20.322, published 21.709 Mnps, deep-perft-start-d5-nodes Giga 8.749, published 15.815 Mnps, deep-perft-kiwipete-d4-nodes Giga 12.106, published 17.107 Mnps

In the standalone run, mixed perft narrowly beat published
drumevp, but deep perft remained far slower. The packaged run
lost even on mixed perft. These changes did not reproduce a reliable
all-suite speed claim, and differences are influenced by CPU/JIT load.
Do not infer bundled improvement from different absolute throughput
numbers across separate runs.

## Additional perft-only small Undo reuse experiment

Reused a ten-field PerftUndo object per recursion depth, avoiding
per-move allocations while keeping the public Board untouched.
Standard perft and 57 more standard/Chess960/EP golden depth checks
all passed. In a separate 11-round source A/B:

| Position | Previous Mnps | Reused Undo Mnps | Change |
|---|---:|---:|---:|
| start | 11.856 | 11.574 | -2.4% |
| kiwipete | 11.906 | 12.500 | +5.0% |
| endgame | 8.966 | 8.895 | -0.8% |
| promotion | 16.167 | 15.721 | -2.8% |

**Rejected**: the already-small perft Undo is V8-friendly, and
writing into a shared mutable object cost more than allocations saved
in three out of four positions.

## Other rejected experiments

- Separate perft-only known-role clears: starting position slightly up,
  Kiwipete down; no broad speed gain.
- Exact position transposition memoization: substantial overhead and
  regression in promotion/depth-1 cases.
- Leaf memoization even slower than direct counting.
- Perfect rank/file rook lookup improved some positions but regressed
  start and uncached movegen.
- Material and mobility threshold sweep: mixed, no universal winner.
- Safe chess-check shortcut: start improved slightly but others regressed.
- Perft-only quiet bitboard move: not consistently faster.
- Precomputed pin screen and role-code perft cache (phase 2) retained.
- Various esbuild minification modes; keep-names harmed V8; ordinary
  minified splitting retained.

## Reproduce / next iteration

The full raw observations are in js-phase3-experiments-2026-11-25.json.
The paired bundle A/B runner is bench/bench-package-fast-ab.mjs, taking
an explicitly separate baseline ESM bundle with --baseline PATH and
--runs 11. For future studies use independent hosts, fresh Node
processes, both source/published competitors and three perft suites
plus real-game workloads. The remaining performance gap is structural:
perft move generation, legality/checker analysis and make/undo need a
larger data-oriented refactor. Do not fork/integrate GPL chessops.
