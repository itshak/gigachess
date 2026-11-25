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
