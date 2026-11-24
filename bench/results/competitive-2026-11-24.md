# Independent GigaChess / chessops / chess.js / drumevp audit

Date: 2026-11-24 (Israel). Measured on Debian aiserver, Node.js 24.13.0,
Intel Xeon E5-1620 v2 @ 3.70 GHz. GigaChess JS baseline 0.5.0; verified
correctness-fix draft has no intended perft optimization. drumevp source
commit 0bfd032c197dde4dddfcf0810f036cdf78bb8b45 (MIT, version 1.3.2).
The npm distribution version 1.3.2 was unpacked with ignore-scripts:
its 110 MB evaluator postinstall was not run.

## Why this matters

A previous 2-position perft comparison yielded a ~2x drumevp advantage.
That was a real result for that workload, but did NOT benchmark API correctness,
chessops, normal make/undo, cold start, FEN handling, or every existing corpus.

Our earlier claim that GigaChess only beat chessops by around 38% was based
on a different position/depth mix. The new full mixed and two deep comparisons
find GigaChess roughly **1.9–2.1x** faster than chessops for perft,
consistent with earlier GigaChess project claims.

## Correctness: independent checks before timing

- Standard chess: **2,600** unique FEN positions verified against chess.js for
  exact legal UCI move set equality, and board/turn/castling/clock FEN parity.
  Both drumevp Git source and its published npm package: 0 move mismatches,
  0 board-state mismatches on these cases.
- **24 seeded games, 2,400 plies**, make and full unmake; no structural state
  mismatches. Drumevp emits a nominal EP target after a pawn double move even
  when chess.js suppresses it; 134 such display differences were recorded.
  They were not allowed to conceal legal-move or other FEN state differences.
- **Five standard Chess Programming Wiki reference positions** at depths
  1–4: all **20 reference counts** match GigaChess, drumevp source no-hash,
  drumevp source forced-hash, and published npm output.
- **276 additional FENs** from GigaChess's original 126-case perftsuite.epd
  and 150-case WAC tactics EPD: all depth-3 counts agree with chessops and
  both drumevp sources. The EPD bm/id annotations were removed; the original
  source file SHA-256 values are in adjacent JSON.
- Some synthetic FEN inputs are accepted by drumevp but rejected by chess.js:
  duplicate kings, pawns on back rank, and EP targets on the wrong rank.
  Drumevp rejects tested illegal UCI move attempts and leaves the board
  unchanged. Both engines accept some geometrically illegal king placements,
  so do not ascribe that issue exclusively to drumevp.
- Extra terminal-state checks: checkmate, stalemate, king-only insufficient
  material, 50-halfmove draw and a real threefold repetition history agree
  on terminal category and repetition status. The isDraw() API specifically
  differs for stalemate: chess.js reports true, while drumevp separately
  reports isStalemate() and isGameOver() true but isDraw() false. This is an
  API contract difference, not evidence of missed stalemate detection.
- Chess960, SAN/PGN and variation trees lack comparable drumevp public APIs.
  They must be marked N/A, never scored as a win or loss.
- Drumevp uses a different 32-bit packed move format; GigaChess and
  gigachess-rs share their own canonical 16-bit king-to-rook-square wire
  contract. Drumevp's Zobrist implementation hashes EP with a legal-capture
  condition, unlike the Polyglot geometric/pseudo-legal convention. Neither
  is grounds to redefine GigaChess wire data or to assume interoperability.

## Existing official GigaChess benchmark, independently rerun

The original bench/bench-real.mjs perft lane was run, not replaced:

- 276 source FENs: all 126 standard perft cases and 150 WAC tactics
- 20 timed iterations per library plus 3 warmup passes
- At depth cap 3: 8,362,598 nodes per run;
  **GigaChess functional perft: 10,559,244 nodes/s**,
  **chessops: 6,200,967 nodes/s** = 1.703x GigaChess advantage
- The 1,104 FEN/depth parity checks at depth cap 4 also passed, but its
  full 20-run timing was deliberately interrupted because that combination
  requires over 30 seconds per single GigaChess pass on this host.
- The new competitive suite uses the **native mutable Board.perft**
  implementation, whereas the existing benchmark uses GigaChess's
  **functional Position perft**. These are different APIs and the timings
  must not be substituted for one another.

## Full 7-round warm throughput results (representative server run)

Higher is better; perft values are millions of nodes per second. Competing
libraries did not always perform identical work in every API axis.

| Test | Gigachess | drumevp source no hash | drumevp source full hash | published drumevp 1.3.2 | chessops |
|---|---:|---:|---:|---:|---:|
| Mixed 276 FEN perft d3 (Mnodes/s) | **13.41** | 22.37 | 18.68 | **24.01** | 6.15 |
| Start position perft d5 (Mnodes/s) | **8.12** | 15.53 | 12.06 | **16.48** | 3.61 |
| Kiwipete perft d4 (Mnodes/s) | **9.02** | 18.15 | 15.55 | **19.23** | 4.84 |

The optimized drumevp perft explicitly sets updateZobristHash=false and reuses
move lists / attack contexts / undo buffers. Our diagnostic reuses the *same*
upstream make/movegen/undo helpers but enables actual hash updates and checks
that incremental and full position hashes agree afterward. This reduces its
perft advantage but does not erase it. Note GigaChess Board.perft has distinct
perft optimizations and may pay other cache costs; this is a diagnostic, not
an isolated cycle-by-cycle hash cost experiment.

### API throughput (positions or validated plies / second)

| Operation | Gigachess | drumevp source | published drumevp | chess.js |
|---|---:|---:|---:|---:|
| FEN parse+write | **157,941** | 94,970 | 98,794 | 39,772 |
| Fully validated UCI replay | **381,055** | 146,184 | 137,840 | 1,992 |
| Raw legal-move generation | 102,554 | **178,869** | N/A* | N/A* |
| Fresh public engine + movegen | N/A | N/A | 56,255 | N/A |

*The published package does not export raw uncached movegen; constructing a
new Engine is a different workload. chess.js produces SAN; chessops allDests
returns destinations without expanding promotions. The separate suite reports
those API throughputs but they are **NOT equivalent raw movegen competitors**.

A prior full sequential run returned **GigaChess 235,984** versus
**drumevp 183,621** positions/s for raw movegen, while the subsequent rotating
runs returned 110,403 vs 194,356 and 113,548 vs 198,430. That large
run-to-run shift on the shared server means the raw-movegen winner is presently
**inconclusive**; do not publish either as a definitive result. The perft and
validated replay trends were more consistent. Complete samples/p10/p90 are in
competitive-2026-11-24.json.

Drumevp repeated cached generateLegalMoves is millions of calls per second,
but this is cached-array retrieval, NOT generating new chess moves.
Comparing this against GigaChess fresh generation is misleading.

### Cold Node start (fresh process each iteration, nine runs)

| Candidate/module | Import median | Import + first legal move | Process median | Median heap |
|---|---:|---:|---:|---:|
| Gigachess native Board | 22.7 ms | 26.6 ms | 59.6 ms | 6.65 MiB |
| Gigachess root API | 25.5 ms | 29.5 ms | 61.9 ms | 5.18 MiB |
| Published drumevp | 78.7 ms | 81.3 ms | 114.0 ms | 11.76 MiB |
| chess.js | 9.1 ms | 12.5 ms | 44.1 ms | 4.49 MiB |

These are Node cold-ESM-import and first-move times from the **original main** checkout, **not browser benchmarks**.
GigaChess is a small board-focused library; drumevp bundles search and NNUE
capabilities, so package scope differs. The npm postinstall 110 MB model
download is excluded. One should not infer cache/warm throughput from import
latency, or vice versa.

## Competitive code review: why perft is fast

1. Bitboards use two uint32 halves, similar to Gigachess JS.
2. Each recursive depth has a reused Uint32 move list, move generation context,
   attack info with preallocated pin arrays, and undo object. The leaf
   fast path uses a move count without making/unmaking the leaf move.
3. The official perft make call passes updateZobristHash=false. This is a
   legitimate specialized perft contract, not necessarily a game correctness
   bug; a public fully hashed game move has more work.
4. The public ChessEngine legal-move getter caches one Uint32Array per board.
   A cached getter benchmark cannot substitute for uncached generator speed.
5. There is a prechecked king-safety en-passant branch, indicating that legal
   EP pins are deliberately handled, corroborated by successful perft FENs.
6. It accepts some malformed FENs and lacks Chess960, SAN, PGN, variation
   tree and the compact cross-language moves2 interface. This is a scope and
   validation difference, not a claim that normal movegen is wrong.

## Conclusions and next experiments

- GigaChess **really is about twice as fast as chessops in these perft sets**.
- Drumevp has a **real and reproduced recursive perft lead**, even when hashes
  are updated. Do not dismiss the finding solely because its repo has few stars.
- The lead **does not extend to validated replay, FEN, startup, or supported
  features**. GigaChess is notably faster on realistic UCI play and FEN.
- The raw movegen ranking is unsettled due to considerable benchmark variance.
  Repeat with separate processes, CPU affinity where safe, and multiple hosts,
  adding uncertainty estimates before publishing absolute claims.
- Potential future benchmarking candidates: alternate open-source pure
  TypeScript libraries only after verifying their feature set and licenses.
  Keep Rust/WASM engines as a separate *non-integrated* performance reference.
- Before any performance changes, inspect recursive perft count generation,
  scratch buffer lifetimes, make/undo cache maintenance, and legal-move
  generation in context. Only merge optimizations improving meaningful user
  workloads without weakening FEN, castling, Chess960 or move legality.

All scripts and raw benchmark data belong to the separate
competitive-benchmark-fairness-20261124 OpenSpec change, with no engine code
modification. No GitHub CI benchmark run was used.
