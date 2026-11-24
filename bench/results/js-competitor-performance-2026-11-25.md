# GigaChess JS/TS competitor performance — 2026-11-25

## No release / no universal fastest claim
The optimized candidate makes large verified gains but does **not**
surpass the pinned published drumevp npm package on perft. Do not publish
another npm version or retain a claim of globally fastest until demonstrated
on broad comparable workloads.

## Benchmark configuration
- Intel Xeon E5-1620 v2, Linux x86-64, Node v24.13.0.
- Nine alternating-round competitor runs, median throughput.
- Competitor @drumevp/chess-engine npm 1.3.2, git revision
  0bfd032c197dde4dddfcf0810f036cdf78bb8b45, published npm binary,
  chessops and chess.js; separate source/perft and validated state modes.
- Legal-positions parity: 2600 samples and 24 games / 2400 plies replay+undo.
- Perft parity: 20 reference counts plus 276 corpus positions, no mismatches
  or skips; all benchmark lanes execute only after these correctness gates.
- Both engines pure JS/TS for movegen. Giga perft can skip hash maintenance;
  drumevp offers no-hash and full-hash paths separately. The source no-hash
  and published npm modes have different internal performance characteristics.

## Direct competitor results
| Workload | GigaChess candidate | drumevp source | drumevp npm |
|---|---:|---:|---:|
| Legal move generation, positions/s | 258,489 | 218,384 | 74,133 |
| FEN parse+write, positions/s | 162,406 | 126,630 | 134,074 |
| Validated UCI replay, plies/s | 573,899 | 162,758 | 170,326 |
| Mixed perft, millions nodes/s | 20.644 | 22.444 | 24.056 |
| Start d5, millions nodes/s | 10.963 | 15.620 | 16.684 |
| Kiwipete d4, millions nodes/s | 12.443 | 18.267 | 19.463 |

Drumevp source full-hash mixed perft: 18.851 million nodes/s.
Chessops mixed perft: 6.266 million nodes/s.
Pure JS Giga wins FEN, validated replay and legal move generation in
this test; it still loses specialized published perft, especially deep
start/Kiwipete.

## A/B against previous correctness-hardened JS branch
Both builds loaded matching fancy magic and Polyglot tables; 11 alternating
runs with exact perft reference count assertions.

| Position | Prior Mnps | Candidate Mnps | Change |
|---|---:|---:|---:|
| start | 7.781 | 10.808 | +38.9% |
| kiwipete | 8.701 | 12.117 | +39.3% |
| endgame | 5.710 | 8.267 | +44.8% |
| promotion | 10.425 | 15.608 | +49.7% |

Both builds loaded matching magic; validated public game API tested over
30 games / 3000 plies, 1500 FENs. 11 alternating rounds:

| Zobrist | Workload | Prior units/s | Candidate units/s | Change |
|---|---|---:|---:|---:|
| Loaded | fully-validated-game-replay | 380,637 | 474,309 | +24.6% |
| Loaded | FEN-parse-and-write | 144,425 | 151,706 | +5.0% |
| Loaded | uncached-legal-move-list | 170,290 | 213,648 | +25.5% |
| Unloaded | fully-validated-game-replay | 431,375 | 541,413 | +25.5% |
| Unloaded | FEN-parse-and-write | 186,172 | 186,046 | -0.1% |
| Unloaded | uncached-legal-move-list | 163,871 | 212,886 | +29.9% |

## Incorporated
- High32-only 64-bit magic indexing using exact unsigned 16-bit multiply and
  Math.imul cross products; independently adapted from MIT drumevp technique.
- One-allocation SquareSet subtraction, avoiding a temporary complement.
- Context-local material-aware enemy attack union for mobile/sparse kings,
  direct king attack-target test for dense positions.
- Role-specialized nonpawn move masks, no-castling king fast path,
  non-popcount check/pin classification.
- Bulk direct pawn leaf counting only in no-check, no pinned pawn, no EP.
  All other positions use the original fully legal move filtering.
  Promotion contributions counted individually, not deduplicated by target.
- Direct pawn destination emission in standard non-exceptional
  move-list generation with unchanged 16-bit packed move sequence.
- Regression tests: 1000-game chess.js differential fuzz,
  independent attack map parity for kingless occupied variants across
  both colors and every square, 380 frozen exact-order packed move lists
  and a development-time 7868-position cross-build order check.

## Rejected
- Mutable scratch for slider attacks: V8 A/B -11 to -34% performance;
  do not merge.
- Per-ply reused Undo: 0 to -2% performance; do not merge.
- Fully eager enemy-attack map: regresses dense starting material.
- Skip no-slider attack generation: +7% endgame, -2.3% Kiwipete; defer.

## Licenses and limits
- @drumevp/chess-engine MIT declared by npm package metadata; this
  repository's algorithmic adaptation is attributed in THIRD_PARTY_NOTICES.md.
- chessops GPL-3.0-or-later: oracle/benchmark **only**, no GPL code copied.
- chess.js BSD-2-Clause: differential oracle.
- ultrachess Rust/WASM architecture: excluded from pure TS comparability.
- Further benchmark on Apple Silicon, AMD/modern Intel, Chrome and Firefox
  before broad speed claims. More work required on deep perft make/unmake.

## Raw inputs and outputs
- js-competitor-performance-2026-11-25.json
- js-optimized-perft-ab-2026-11-25.json
- js-optimized-gameplay-ab-2026-11-25.json
