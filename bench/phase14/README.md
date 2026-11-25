# Phase 14: final candidate combinations and isolated direct benchmarking
Baseline 4fef578. Phase 13 Flat advanced because both direct and real-game
movegen improve across all four completed Node24 hosts. LocalOut regressed
14–22% in real-game move generation despite direct improvements, so it is
only an interaction/diagnostic control, not a preferred release candidate.
Four candidates: targetflat (TargetHalf + flat leapers), safeflat (SafeHalf +
flat leapers), targetflatcontrol (targeted replay + original rook tables +
flat leapers), targetflatlocal (targetflat + independent full output buffer).
Keep the public analyzeCheckContext signature unchanged; the non-king-only
optimization is private. A compile error in the initial SafeFlat wrapper
was fixed before dispatch. Initial local pairs were noisy and showed
regressions in movegen; do not infer an overall gain from local replay alone.

18 independent jobs + corpus. Existing exact 4k-position direct benchmark
and 20k real-game paired tests, plus isolated-process timing (three
counterbalanced executions, 12 warmup and 15 measured rounds, 4 x 4k fresh
positions per round; construction outside timed work; no cached lists).
Published competitor is pinned as before. Correctness includes expanded
legality parity, full ordered moves, ownership, frozen perft and occupancy
checks. Do not merge merely because CI jobs pass; review timings and
cross-platform behavior. Retain separate isolated and mixed-process results.
