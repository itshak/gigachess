# Phase 13: focus on the remaining direct movegen deficit

The original 4000-position uncached workload exposes a deficit not
visible in the 20k real-game workload. Published drumevp 1.3.2 has
~450k positions/s on Linux Node24 versus Phase 8 ~298k. Its source
and published artifacts are pinned exactly as in the original matrix.

Four isolated Phase 8 trials:
- split: split monolithic generator into piece-specific functions for JIT;
- flat: use typed 32-bit leaper tables in the standard path;
- both: combine the previous two;
- localout: allocate local output instead of shared scratch + slice.
TargetHalf (Phase 12 front-runner) is an additional control. No copied
external code; no caching or weakening validation. The trials preserve
the exact move order and ownership contracts.

22 independent performance jobs plus corpus preparation. Exact
4k-position direct comparison (25 measured, 12 warmups) plus same-host
paired 20k-position real-game benchmark. Correctness first. Do not
advance a variant based on a single platform or a mixed API comparison.
