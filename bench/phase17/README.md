# Phase 17: remaining forced-GC native-list performance gap

Baseline is exact validated Phase 15 cc375b0, not Phase 8.
Four independently scoped variants: copy (exact-size owned result with scalar
copy instead of typed-array slice); geometry (flat internal ray and between
lookups); slider (one caller-owned mutable internal result per generation,
preserving readonly public attack results); combined (all three).
No result cache, no relaxed legality, no borrowed source.
All compile and pass local ownership, 380 frozen ordered fixtures,
107648 loaded slider checks and 114 frozen perft-state fixtures.
Initial slider compile error fixed by using private mutable structural type.
Full differential, cold parity, original direct, four controlled modes and
20k real-game paired timings on each of four Node24 Linux/Windows hosts.
Do not retain a variant unless it improves the selected engine without
regression; especially scrutinize forced versus natural GC and CPU time.

Phase 16 completed 6/6: run 45694179346. Natural GC wins 20/20,
2.824–4.002x wall throughput against published drumevp. Original
four-engine forced GC loses all five, .848–.993x. Three-engine forced
GC ratios .892–1.113x; Linux CPU ratios .503–.701x, not accounting for
GC before/after measured region. Windows process CPU can be quantized
or zero (JSON null rate); use wall as primary and retain CPU samples.
No final universal fastest claim.
