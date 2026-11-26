# Design and rejected experiments

Black-magic shifts >=52 need only high 32 bits of the 64x64 product.
Use 16-bit unsigned cross-products and signed Math.imul without allocating
multiple temporary 64-bit objects.

Leaf counting can use 32-bit shifts to count all pawn push and capture
categories simultaneously only if en passant is absent, no pawn pinned
and checkMask is unrestricted. Fallback preserves exceptional rules and
promotion contributions from distinct originating pawns.

Build an enemy attack union for sparse material or mobile kings, use
direct target probes for occupied/crowded boards. Keep each context
caller-owned; avoid reentrant global state.

Rejected via isolated A/B: caller-owned mutable slider attack scratch
regressed 11–34%, and per-ply mutable Undo reuse was neutral to slower.
These must remain outside the production patch.

## Additional isolated quiet-mutation prototype

Tested a specialized quiet-move bitboard mutation affecting only mover
color, piece-role and occupancy. It passed standard perft reference counts,
attack-map checks and frozen move ordering, but 11-round A/B was uneven:
start -3.1%, Kiwipete +4.3%, promotion +5.3%, endgame +0.3%,
public validated replay -0.3%. Do NOT merge this variant because
there is no robust broad improvement and it adds state/undo risk.

Longer-term: test a carefully isolated depth-two bulk counting algorithm
with deep Chess960, EP and random replay/undo correctness gates.

## Selected implementation (0.6.0)
See [ADR-020](../../adr/020-validated-pure-js-performance-0.6.0.md),
[final report](../../../docs/BENCHMARKS.md) and raw Phase22 data. Earlier
prototypes above are historical; the selected scratch storage is guarded
for synchronous reentrancy and never escapes as a public returned array.
The bounded canonical template and scalar SAN formatting close the
observed V8 direct-generation deficit. Report bounded FEN/perft trade-offs.
