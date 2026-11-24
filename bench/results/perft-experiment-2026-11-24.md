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
