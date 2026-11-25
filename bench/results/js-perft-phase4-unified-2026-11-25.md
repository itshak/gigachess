# JS/TS perft performance phase 4 — 2026-11-25

## Conclusion (draft-only: no npm release)

The current change **improves all four primary perft fixtures** on an
apples-to-apples bundled 11-round A/B run without changing any public move
method, packed move encoding, Chess960 behavior or the existing move-list order.

A nine-round same-server direct competitor run found that GigaChess's fast
bundle narrowly beat the published MIT drumevp package on the *mixed perft*
corpus, but it remains slower on deep starting-position and Kiwipete perft.
This is not universal fastest-in-JS evidence, and the published competitor
can change in the future. Do not tag/publish/merge for that marketing claim.

## Implementation

The leaf counter previously scanned all knights, then bishops, rooks and
queens separately, entering a role-specific closure each time. This change
traverses the combined set of own non-pawn/non-king pieces **once** and
classifies each square by the disjoint role bitboard before fetching its
attack mask. Exactly the same occupancy, single-check and pin-ray legality
filters and exact promotion accounting remain. Only countLegalMoves changed;
legalMovesInto, public Board.makeMove and unmakeMove are unchanged.

MIT-licensed drumevp source was inspected and MIT getPins/getCheckers-style
paths were experimentally adapted with attribution. They did **not** beat
the retained implementation consistently and are not shipped; third-party
copyrighted implementation was not blindly incorporated.

## Bundled A/B against previous draft, 11 alternating runs

Both builds are separate independent ESM bundles with loaded magic and
Zobrist tables, identical CPU and FEN counts, medians of timed executions.

| Perft position | Previous bundle Mnps | Unified leaf bundle Mnps | Improvement |
|---|---:|---:|---:|
| start | 11.306 | 11.740 | +3.8% |
| kiwipete | 11.790 | 12.992 | +10.2% |
| endgame | 8.036 | 9.312 | +15.9% |
| promotion | 15.551 | 18.004 | +15.8% |

Source-only A/B results were also positive across all four positions; see
the attached JSON for all raw sample timings, which vary with server load.

## Published competitor comparison (same run)

Intel Xeon E5-1620 v2, Node v24.13.0, Linux. Nine
alternating rounds, medians. Drumevp npm version 1.3.2,
source commit 0bfd032c197dde4dddfcf0810f036cdf78bb8b45.
No WASM or Rust is used for the measured JS chess movegen/perft.
The third column's perft path is drumevp's **source no-hash** path;
the fourth is the actual **published npm** implementation.

| Workload | GigaChess /fast | drumevp source | drumevp published |
|---|---:|---:|---:|
| Legal move generation (positions/s) | 250,929 | 209,811 | 72,204 |
| FEN parse+write (positions/s) | 95,057 | 72,356 | 74,515 |
| Fully validated UCI replay (plies/s) | 545,664 | 162,259 | 139,533 |
| Mixed perft (million nodes/s) | 20.520 | 20.528 | 19.790 |
| Starting-position depth 5 (million nodes/s) | 9.151 | 9.494 | 10.352 |
| Kiwipete depth 4 (million nodes/s) | 9.236 | 13.155 | 12.923 |

**Important:** cached move-list lane is not directly comparable:
drumevp returns an existing cache and GigaChess regenerates the list.
It should not be called a valid speed contest. The published package
continues to lead deep perft, despite this run's narrow mixed-perft win.

## Correctness gates

- npm test passed completely, including 1,000 seeded random chess.js
  differential games, 118,380 plies, 11,684 undo checks, and 380
  frozen exact-order packed move-list fixtures.
- 114 ordinary and bundled Board perft fixtures across standard FEN,
  Chess960 castling overlap positions, en-passant, Polyglot/hash
  and full board-state restoration passed.
- Independent attacked-square parity passed across all 64 squares,
  both colors and kingless occupancy.
- Direct competitor suite 20
  published perft checks and 276
  corpus FENs passed, with no skipped cases and zero mismatch.
- All tests were on aiserver, **no GitHub CI**.
- npm version stays 0.5.0, PR draft, no published package.

## Rejected experiments this turn

1. MIT drumevp-style empty-board candidate sliders in pin analysis:
   small Kiwipete gain but promotion regression.
2. Fused drumevp-style non-slider checkers + BETWEEN pin analysis:
   correctness required synchronizing cached checkers for castling
   legality; after passing, Kiwipete and promotion speed regressed.
3. Perft-only direct checker attack classification:
   good sparse endgame, worse starting position, Kiwipete, promotions.
4. Early depth-two perft unroll:
   small start gain, promotion regression.
5. Direct count of already-validated king-safe targets:
   small Kiwipete/promotion gains, start/endgame regressions.
6. Skip castling detection for moves with no rights:
   bundled A/B slower on all four test positions.
7. MIT drumevp-inspired low/high split of magic attack arrays:
   no measured improvement; index layout remains unchanged.

## Remaining goal

To establish a fastest pure-JS/TS claim, independently verify gains
against both drumevp source and its published npm build on start d5,
Kiwipete d4 and the mixed corpus, without sacrificing validated
replay/FEN/movegen speed, then repeat on modern CPUs and browsers.
Focus next on the deep-perft generation path and attack/check context
cost, not just shallow leaf counting. The comparison must be
correctness-gated and avoid cherry-picking FENs or run order.

Raw evidence: js-perft-phase4-unified-2026-11-25.json.
