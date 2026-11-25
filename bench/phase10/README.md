# Phase 10: sliding table and popcount research

Independent from the 21 Phase 9 variants. All source patches are
relative to 4fef578. Primary target is pure JS/TS. WASM remains an
architecture reference; no caching, transposition hashing or skipped
public validation is included in performance comparisons.

Research references (algorithm ideas, original implementation; no
external code copied):
- Gigantua/Chess_Movegen (MIT): alternative sliding attacks.
- analog-hors/cozy-chess (MIT): bulk move generation / compact state.
- mcarbonell/chess-movegen-js (MIT): comparison of bitboard and 0x88.
- Chess Programming Wiki: Kindergarten Bitboards and Magic Bitboards.

The key idea: for any ray, blockers in the low 32-bit half and high
32-bit half independently truncate the ray. The intersection gives the
nearest blocker of the full 64-bit occupancy. The rook table now needs
a SUM of each half's subset counts, rather than their PRODUCT.

Ten isolated variants: half, byte, line, halffused, halfrook, linefast,
halfblob, poppair, pop16, halfpop. Halfblob generates the smaller rook
blob directly with independent naive attacks and deterministic 32-bit
hashes; 821248 -> 108544 decoded bytes, 27741 -> 10678 gzip bytes.
Bishop stays on the original small full table. Runtime table layout
changes only; cold fallback and public independent attack results
remain unchanged. Line trial eagerly builds large tables; not suitable
for release without a separate startup investigation.

Local exhaustive 107648 occupancy cases, frozen perft and paired
screen results are stored in bench/results/js-phase10-screening.
The slow naive line extraction is not included in CI. Other nine
variants get four hardware platforms and selected Node 22/Bun runs:
41 paired jobs plus preparation. Separate cold and loaded attack
measurements use both real and synthetic occupancies, three roles,
8 warmups and 15 timed rounds. Deep perft and real 20k-position
end-to-end correctness-gated comparisons use the Phase 9 harness.
The local measurements are preliminary and not acceptance criteria.
