# Phase 11: selective folded hash and compact transitions

Base: 4fef578. Phase 8 production engine unchanged. Five independently
implemented trials all pass exhaustive relevant occupancy checks (107648),
114 frozen standard/Chess960 perft fixtures and compact differential
571 positions / 1142 comparisons. The offline folded generator finds
collision-free 32-bit multiplication for all 128 square/role mappings
by rotating the upper half into disjoint bits in the lower half.
The new rook gzip grows from 27741 to 44182 bytes; bishop gzip is 5832.
No external implementation copied.

Paired local Node24 results (4k positions, 276 mixed perft, 7 rounds):
| Variant | Fresh move list | Mixed d3 | Start d5 | Kiwipete d4 |
|---|---:|---:|---:|---:|
| folded | 1.214 | 1.075 | 1.006 | 1.060 |
| foldfast | 0.844 (CPU 1.151) | 1.033 | 0.899 | 1.050 |
| undo | - | 0.995 | 0.978 | 1.042 |
| sibling | - | 1.055 | 1.042 | 0.927 |
| undofused | - | 1.042 | 0.996 | 1.204 |

Only folded and undofused are advanced to 8 independent trials across
Linux x64/ARM64, Windows x64, macOS Apple Silicon. Undo variants
reduce copying by inverse updates; fused captures avoid scanning
captured piece roles twice. Their benefit is workload-dependent.
No blanket speedup claim, no caching or public API changes.
Do not merge if paired regressions or correctness failures appear.
Phase 9 and Phase 10 remain independent campaigns.
