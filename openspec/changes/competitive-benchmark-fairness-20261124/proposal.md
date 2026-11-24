# Proposal: benchmark GigaChess against independent TypeScript engines fairly

## Why

The prior narrow perft comparison with drumevp made it sound as if another
library beat GigaChess across the board. It had only measured starting
position and Kiwipete perft, without testing equivalent input legality, full
move execution, parser behavior, native API semantics, startup, or the
previous benchmark corpora. The previous GigaChess/chessops advantage of
approximately 2x cannot be disproven by a third-party perft microbenchmark.

## What changes

Add an opt-in, correctness-gated, source-pinned competitive suite under the
existing bench framework. Test source and published npm output; compare
independent legal move sets, reference perft, 276 existing EPD corpus positions,
FEN semantics, stateful replay and undo, invalid input and cold startup.
Measure both the competitor's normal perft that intentionally skips Zobrist
updates and a diagnostic full-hash variant using its own unchanged move API.

Produce transparent machine-readable raw timing samples, named workloads,
and reproducibility docs. Keep existing bench:real defaults and CI unmodified.
Add the competitive lane only when explicitly selected.

## Scope

- Measurement tools and documentation only; NO movegen, hash, Board or
  production library changes.
- GigaChess remains pure TypeScript, no WASM dependency or NNUE model download.
- Competing engine source remains outside the repository, pinned by Git SHA.
- The competitor's lack of Chess960/SAN/PGN is displayed as N/A; do not
  penalize or falsely benchmark a nonexistent API.
- Only use permissive code (MIT); chessops GPL is a dev-only oracle,
  never copied into production.
- This change is independent of the dual-engine-hardening PR and can be
  reviewed on main before any additional performance optimizations.

## Success

No claim about speed may be made without a correctness gate for the exact
workload, all inputs and artifacts pinned, and apples-to-apples API scope
identified. A fast perft implementation that skips hashing must not be
described as faster at fully validated move execution.
