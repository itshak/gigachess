# JS correction and perft optimization experiments — 2026-11-24

Server: aiserver Debian, Node.js 24.13.0, Xeon E5-1620 v2.
Reference: pristine gigachess main 8ef3d5490c34347b873e8a8dc29f918730775595;
candidate: correctness-fix branch plus experiments.
ALL node counts, FEN and Polyglot keys are required to match baseline.

## Correctness

Retired the global shared mutable castling-plan scratch; two simultaneously
live check/pin contexts retain their own rights and Chess960 rook origin.
The existing cross-language parity checks from the dual-engine-hardening
PR remain: 16-bit moves2, null, pinned EP repetition, correct Polyglot hash
and FEN counters. After perft, FEN, every legal move and Zobrist are unchanged,
including Chess960; normal public makeMove still computes correct full hash.
Full npm test passed 1000 differential games / 118380 plies / 11684 undos.

## Results

- Per-depth scratch move list + context versus original: start d5 **+1.8%**,
  Kiwipete d4 **-2.3%**, endgame d5 **+1.7%**, promotion d4 **-1.9%**;
  all are near noise and NOT an optimization win.
- Enemy-occupancy sniper pin filtering versus scratch-only: start d5
  **-1.6%**, Kiwipete d4 **+1.6%**, endgame d5 **+0.7%**,
  promotion d4 **-0.6%**: again largely neutral.
- Private hash-free perft versus the otherwise identical hash-maintaining
  source, when **both Zobrist tables were explicitly loaded**:
  start d5 **+4.2%**, Kiwipete d4 **+3.9%**, endgame d5 **+7.2%**,
  promotion d4 **+4.2%**. Without tables loaded, the historical perft
  already skips hash work, and gains vanish.
- Final COMBINED candidate versus pristine main, both hash-loaded, 7
  alternating runs: start **+1.3%**, Kiwipete **+0.8%**, endgame **+9.4%**,
  promotion **+1.8%**. Pin/very small tactical fixtures are dominated by
  timer noise and should not inform release claims.
- Final COMBINED candidate versus pristine main with hash tables NOT
  loaded: start **+0.3%**, Kiwipete **-0.4%**, endgame **+2.5%**,
  promotion **-5.2%**. A speed claim without specifying whether lazily
  loaded hash tables are present is misleading.

All raw 5/7/9-round timings and exact perft node counts are in
perft-experiment-2026-11-24.json. Only private perft ever skips hash
maintenance; all public game operations preserve their existing guarantees.

## Recommendation

Keep the **correctness fix** unequivocally. The no-hash perft path is a
limited, independently safety-tested optimization for workloads that load
Zobrist; other changes are small, not production-significant wins. Do NOT
make claims of a 2x speedup or combine perft-only results with real UI
replay. Rust already uses faster check/pin, move-count and hash-free perft
paths; avoid copying its architecture wholesale to JavaScript.


## Direct public API regression against pristine main

To avoid conflating different experiment runs on the shared server, a
separate 11-round alternating single-process benchmark compared the original
main Board and the full correctness/perft experiment candidate directly.
All 1,500 sampled FENs generated identical legal move sets, while 30 seeded
100-ply games (3,000 plies) were replayed using the fully validated public
Board.parseUci + Board.makeMove methods, eight repeats per timed sample.

| Workload | Original main, hashes off | Candidate, hashes off | Ratio |
|---|---:|---:|---:|
| Public validated replay (plies/s) | 354,520 | 353,835 | 0.998x |
| FEN parse+write (positions/s) | 181,895 | 178,702 | 0.982x |
| Uncached legal moves (positions/s) | 144,765 | 152,728 | 1.055x |

| Workload | Original main, hashes loaded | Candidate, hashes loaded | Ratio |
|---|---:|---:|---:|
| Public validated replay (plies/s) | 322,504 | 312,689 | 0.970x |
| FEN parse+write (positions/s) | 148,934 | 148,309 | 0.996x |
| Uncached legal moves (positions/s) | 164,109 | 165,454 | 1.008x |

These are small gains/losses; normal replay **may regress by about 3%**
with hashes loaded. Without more samples/independent hosts it is not certain
whether this is significant, but it is absolutely not evidence of a dramatic
performance improvement. There is no default UI-performance optimization
claim here; production users should continue prioritizing correctness and
maintainability. Exact samples are in adjacent gameplay-regression JSONs;
the new bench-gameplay-regressions.mjs script reproduces them using
the untouched main dist/board.js as --baseline.

## Post-fix external competitor benchmark

The separate existing fair benchmark was rerun, seven rounds, against
chessops, chess.js, drumevp pinned source and published npm 1.3.2.
All 2,600 legal-move positions, 2,400 stateful replay plies,
20 published perft reference counts and 276 corpus depths passed.

| Operation | Gigachess candidate | Published drumevp | Chessops |
|---|---:|---:|---:|
| 276 FEN mixed perft d3 (million nodes/s) | 13.50 | 24.94 | 6.31 |
| Start perft d5 (million nodes/s) | 7.84 | 17.28 | 3.68 |
| Kiwipete perft d4 (million nodes/s) | 8.81 | 19.35 | 4.97 |
| FEN parse/write (positions/s) | 170,238 | 103,450 | N/A |
| Validated UCI replay (plies/s) | 360,850 | 135,894 | N/A |

The JS library is still considerably faster than chessops on perft,
still loses specialized perft to drumevp, and still excels at validated
ordinary move replay and FEN. Baseline and candidate runs differed in
timing noise and are not directly paired: use the direct public-API
regression above for A/B effects.

Raw published competitor data:
competitive-post-fix-2026-11-24.json. These are **standard chess** tests;
drumevp provides no comparable SAN/PGN/Chess960 interfaces.
