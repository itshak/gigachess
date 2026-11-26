# Phase 15 candidate: TargetFlat

Baseline: 4fef578 (Phase 8). Selected from Phase 9–14 campaigns; no
third-party engine code copied and no dependency or public API added.
Phase 14 run 45676511779, commit 8c1df81. Linux x64/ARM64, Windows x64
(Node 24) and Linux x64 Node 22 completed; Apple Silicon still queued
and explicitly deferred for this selection, not waived for release.

| Platform/runtime | FEN roundtrip | Validated replay | Fresh real-game movegen | Start d6 | Kiwipete d5 |
|---|---:|---:|---:|---:|---:|
| Linux x64 Node 24 | 1.518 | 1.366 | 1.048 | 1.001 | 1.022 |
| Linux ARM64 Node 24 | 1.539 | 1.411 | 1.019 | 0.982 | 0.977 |
| Windows x64 Node 24 | 1.486 | 1.407 | 1.086 | 1.004 | 1.001 |
| Linux x64 Node 22 | 1.503 | 1.608 | 1.082 | 0.977 | 0.976 |

Wall-time throughput ratios to same-job Phase 8. These are measurements
of the selected experimental variant before minor candidate maintenance
fixes; revalidate the exact candidate. Isolated-process direct ratios
against Phase 8 generally 1.03–1.11; mixed-engine direct tests against
published drumevp remain below parity in several environments. Do not
claim universal fastest JS or interpret the very large isolated competitor
ratios as end-to-end speedups. Forced GC and board creation outside the
clock and JIT cross-contamination can affect those measurements.

Keep: owned FEN construction/serialization, targeted non-king legality,
scalar Zobrist, pre-generated split-half rook attacks (108544 decoded
bytes vs 821248, 10678 gzip bytes), and flat leaper tables. Reject LocalOut
because of real-game and isolated regressions. Retain baseline perft
state and make/unmake. No folded hash, extra leaf paths or popcount table.

Maintenance: public analyzer signature unchanged; incomplete context
is private. Inconsistent enemy occupancy falls back to reference context.
The existing split32 regeneration command now emits compact rook and
original bishop data and was verified byte-for-byte against both blobs.
Cold and loaded exhaustive occupancy checks and strict typecheck pass.

Release gate: npm test, official 24-gate quick suite, exact candidate
against pinned published/source rivals, validated ordered moves/SAN/FEN
and replay, deep perft vs Phase 8, and isolated timing with lifecycle cost.
Mac validation deferred; no release or unqualified performance claim.

## Final validation (22:18 Israel time, 25 November)

[Corrected run 45683312594](https://github.com/itshak/gigachess/actions/runs/45683312594)
passed all six jobs, five independent platform/runtime configurations.
Exact engine candidate cc375b0, CI 6ee2ebe. Raw timings, correctness and
machine metadata: `js-phase15-final/`. The earlier failures were
Windows URL conversion, legacy chesstree's mutation of the modern
chessops package metadata, and the gzip OS header byte. Fixes leave
chess behavior and decoded attack tables unchanged. All full npm tests
and expanded legality tests pass; local official quick suite 24/24.
Each paired job includes 257280 destination comparisons and 1048916 UCI
checks. All-library matrix: 20k positions, 300 games, 21046 plies;
all five matrices complete with no recorded mismatches or failures.

| Platform | FEN | Replay | Fresh movegen | Start d6 | Kiwi d5 | Direct 4k vs drumevp |
|---|---:|---:|---:|---:|---:|---:|
| Linux x64 Node22 | 1.602 | 1.366 | 1.090 | .982 | .966 | .870 |
| Linux x64 Node24 | 1.555 | 1.437 | 1.025 | .982 | 1.004 | .817 |
| Linux ARM Node24 | 1.505 | 1.328 | 1.070 | .989 | .982 | 1.018 |
| Windows ARM Node24 | 1.475 | 1.357 | 1.086 | .986 | .976 | .882 |
| Windows x64 Node24 | 1.532 | 1.444 | 1.079 | .982 | 1.027 | .768 |

Ratios relative to Phase 8 except last column (published drumevp).
All-library matrix wins against tested pure-JS competitors on all
supported lanes across all five configurations, including perft d5/d4
and normalized UCI. Published drumevp ratios: native 1.582–2.332,
UCI 1.277–1.524, FEN 1.514–1.810, replay 1.454–2.267, start d5
1.864–1.923, Kiwi d4 1.729–1.996. Source competitor also loses
all supported matrix lanes. WASM is faster; distinct backend category.

Independent native generation median candidate/published ratios
3.106–9.967; complete lifecycle 2.077–2.917. Do not generalize
these unusually high native ratios: forced GC, JIT feedback and
workload distribution change the timings substantially. Mixed-engine
4k direct loses four of five. This remains an open measurement and
performance question. Keep the selected engine as draft; no main merge,
npm tag or universal fastest claim. Apple Silicon postponed by user.

## Subsequent selection, 26 November

Keep Phase15 engine cc375b0. Independent Phase17 17/17, Phase18
15/15 and Phase19 11/11 completed successfully. Geometry improvements
do not consistently reproduce across runtimes; Rays and Lean show
SAN-list regressions on individual Linux configurations and still lose
the original mixed forced-GC direct benchmark in four of five hosts
each. Neither selected. Both beat published drumevp for isolated complete
lifecycle (forced and natural GC) in all five configurations.
Phase19 evidence and Phase20 ownership/retention diagnostics:
https://github.com/itshak/gigachess/tree/bench/phase20-retention-20261126/bench/results/js-phase19-final
Phase20 benchmark-only branch d635e7f preserves Phase15 unchanged.
Rejected push-origin pawn mask prototype passed correctness but produced
0.829x local paired fresh movegen. No release, no new engine behavior,
no claims that the remaining mixed benchmark gap is closed.

## Phase 21 independent breakthrough

Run 45714146090: all six jobs passed. Candidate 769db80 uses one
private reusable initial-position Board and independent mutable copies.
Original direct movegen wins 2.009–3.620x against published drumevp
on all five tested Linux/Windows configurations; generator weak-object
invalidations zero. Initial construction 7.262–13.478x, paired replay
1.090–1.216x vs Phase15. Natural workloads and perft remain competitive.
One SAN regression .885x and some FEN parse regressions remain.
The arbitrary-FEN-only control shows initialization dependence;
Phase22 tests early initialization and SAN simplification, including
exact ordered SAN parity, before selecting production changes.
Evidence: https://github.com/itshak/gigachess/tree/bench/phase22-template-finalization-20261126/bench/results/js-phase21-final
Engine remains Phase15 in this draft until final selection. Mac deferred.
