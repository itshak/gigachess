# ADR-020: Validated pure-JS performance and bounded canonical template

Status: Accepted for 0.6.0, 2026-11-26.

## Decision
Use exact split-32 sliding tables (compact half-rook representation),
ordered direct standard move generation with guarded scratch ownership,
compact independent perft state, owned FEN construction, targeted replay,
a private canonical initial-position template and scalar SAN disambiguation.
Keep the standard and separately bundled fast module graphs pure JS.
Maintain synchronous cold fallback and lazy optional hash/attack loading.
Preserve the mirrored contract and independent mutable Board state.
No arbitrary FEN or move-list cache, runtime flags or competitor code copied.

## Evidence and trade-offs
[Release comparisons](../../docs/BENCHMARKS.md) and [Phase22 selection](../../bench/results/js-phase22-final-2026-11-26.md).
Forced full GC repeatedly invalidated optimized V8 generator code with
embedded weak objects cleared; the bounded canonical Board prevented this
in observed traces and accelerates repeated normal start construction.
The template is initialized on first ordinary Board use; its lifetime is
intentional and documented. The initial-free control confirms wins without
benchmark priming. FEN/perft regressions relative to Phase15 are documented,
not hidden. UltraChess leads several warm WASM lanes and has a measured
first-use cost on one host. Final Mac/browser performance remains deferred.

## Release policy
Tag-driven workflow tests, verifies version and publishes the package,
checks public registry metadata and installs the exact new package for a
cold/loaded smoke test. GitHub release follows verified npm publication.
The user explicitly authorized the 0.6.0 release despite deferred Mac checks.
