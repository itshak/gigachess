# Phase 18: refine geometry, close the Windows ARM64 gap
Baseline: exact validated Phase 15 cc375b0. Phase17 run 45695007831
passed 17/17; raw artifacts preserved in bench/results/js-phase17-final.
Geometry wins original direct vs published drumevp on Linux x64 1.017,
Linux ARM64 1.030, Windows x64 1.008, but Windows ARM64 .896.
Do not integrate unchanged: replay ratios .941–.983; Windows ARM64 FEN
roundtrip .693. Raw Windows ARM64 samples are bimodal around 37/56 ms
for both engines, so aggregate four independently prepared batches per
recorded sample for non-deep lanes. Every batch checks same checksum.
Retain original single-batch direct test and phase16 control modes.

Variants: rays (flat empty-board ray pairs only), between (access existing
between arrays directly), shared (both without duplicating 32 KiB tables),
geocopy (shared + manual output copy), lean (shared + skip absolutely
pinned knights and separate low/high king safety loops).
Internal BETWEEN exports are not exposed through package root/subpaths.
All five build and pass local ownership, 380 ordered fixtures, 114 frozen
perft/state fixtures and 107648 exhaustive loaded slider occupancies.
Run full 10k movegen differential and 20k paired validation in CI.
Screen all five on Linux x64 and Windows ARM64, shared and lean also
on Linux ARM64 and Windows x64. Do not publish or merge until the selected
candidate has full validation; macOS remains deferred.
