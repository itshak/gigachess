# GigaChess JS/TS performance experiments — phase 5, 2026-11-25

## Findings and release status

A fully correct 100% JS/TS micro-optimization of the unified perft leaf
counter avoids counting hypothetical promotion variants when no pawn stands
on its penultimate rank. This preserves all valid promotions, including
captures and underpromotions, and leaves the Board public move API untouched.

**The GigaChess fast bundle wins the mixed perft corpus against drumevp's
published package in this nine-round same-machine run. It still loses
both major deep-perft benchmarks.** We cannot claim overall speed
leadership or publish a new npm version yet. The draft PR stays open.

## Implementation and correctness

- White pawn promotions are possible only when a pawn occupies rank 7;
  black only on rank 2. In the bulk unpinned/no-check/no-EP fast path,
  skip three SWAR promotion-popcount calls when no such pawn exists.
- In pinned/check/EP fallback, only compute promotion multiplicity for
  a pawn actually on the rank immediately before promotion.
- The normal legal-move list, Chess960 castling, Zobrist hashing,
  en-passant handling, SAN/PGN and all normal move/undo operations
  are unaffected. This is a leaf-node count-only change.
- Complete npm test suite passed, including 1,000 deterministic random
  games validated against chess.js, 118,380 plies, 11,684 undos, 380 frozen
  exact-order packed move fixtures, 114 bundled/ordinary standard/Chess960
  perft and full-state restoration checks and independently verified
  attack maps. No correctness regressions.
- The competing MIT drumevp package and git revision were pinned. The
  separate competitors remain comparison oracles, not runtime dependencies.
  No GPL chessops source was copied into this package.
- All tests executed on aiserver, no GitHub CI, npm version still 0.5.0.

## Paired fast-bundle A/B (11 alternating runs)

Compared against the *previous* published-to-draft unified leaf counter
with identical lazy magic/hash initialization and position semantics.

| Perft workload | Previous bundle Mnps | Promotion-guard bundle Mnps | Change |
|---|---:|---:|---:|
| start | 12.272 | 13.355 | +8.8% |
| kiwipete | 13.604 | 13.778 | +1.3% |
| endgame | 9.361 | 9.564 | +2.2% |
| promotion | 18.014 | 18.328 | +1.7% |

The source-only A/B had smaller and mixed gains, demonstrating why
the *actual bundled output* is the release comparison. Timing medians
and all raw per-run samples are included in the JSON.

## Direct competitor comparison (9 alternating rounds)

AI server Xeon E5-1620 v2, Node v24.13.0, GitHub
drumevp commit 0bfd032c197dde4dddfcf0810f036cdf78bb8b45, npm
@drumevp/chess-engine 1.3.2.
For perft, source lane does NOT maintain Zobrist; published package
is separately measured. GigaChess perft maintains board rule state
without updating clocks/hashes in its isolated reversible hot loop.

| Operation | GigaChess /fast | drumevp source | drumevp published |
|---|---:|---:|---:|
| Legal move generation, positions/s | 267,209 | 222,938 | 73,488 |
| FEN parse+write, positions/s | 162,874 | 125,442 | 133,150 |
| Validated UCI replay, plies/s | 599,650 | 157,589 | 129,028 |
| Mixed perft, million nodes/s | 24.630 | 22.386 | 23.987 |
| Start depth 5, million nodes/s | 12.610 | 15.272 | 16.669 |
| Kiwipete depth 4, million nodes/s | 13.133 | 18.099 | 19.144 |

Although this run's mixed perft advantage is encouraging, **the
published package wins both deep perft positions by a substantial
margin**. The mixed-corpus advantage should be repeated on other
modern CPUs/JS engines before an absolute-speed claim. Also, the
competitor's cached move-list lane is *not* comparable to regenerated
GigaChess lists; do not use it as a general ranking.

Correctness of this direct comparison: 20
known reference perft counts and 276
corpus FEN depth checks; zero mismatches or skipped FENs.
The legal-move and validated replay correctness gates also passed.

## Rejected follow-on experiments

- Replaced general destination calculation in the non-pawn
  move-list generator with an inline legality mask, maintaining
  exact move-list order and legal perft counts. Bundled A/B showed
  about 10% slower Kiwipete, so not merged.
- Single-half SWAR popcount short-circuit at the shared SquareSet
  helper, source and bundle A/B regressed all four positions.
- Perft leaf reuse of existing piece-code array for role selection:
  Kiwipete and promotion slowed in the bundled A/B and no broad
  improvement, so not merged.

## Next algorithmic bottleneck

The deeper perft deficit is structural and not explained by promotion
accounting. Further work should benchmark a separate packed piece-state
representation and direct legal-move generation, including the
MIT-licensed drumevp design with appropriate copyright/license notices
for any substantive borrowed code. Maintain the same correctness
gates and *compare actual published bundles*, not just source code.
Raw evidence: js-perft-phase5-promotion-2026-11-25.json.
