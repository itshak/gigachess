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
