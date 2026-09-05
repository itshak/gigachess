# ADR-015: Rename the library distribution purechess → gigachess

**Date:** 2026-08-31
**Status:** Accepted
**Change:** `gigachess-adopt` (tasks 1.1–1.2)

> Note: this ADR is numbered **015** — the change tasks say `013-gigachess-rename.md`,
> but ADR numbers 013 (`castling-dest-normalization`) and 014
> (`chessops-exact-public-api`) were already taken when this change landed.

## Context

The library (MIT) now beats `chessops` on every `bench/bench-real.mjs` gate
(3.36× sliding, +19% perft, 2.1× PGN, 2× FEN —
`bench/results/real-2026-08-30-gates-green.md`, 13/13) and `chess.js` on all
four lanes. But the name `purechess` promised a *pure functional* engine,
while ADR-012 says the engine is functional **only at the public API
boundary** (non-mutable userdata) and imperative **inside** (`WritableBoard`
scratch, `forEachSquare`) for maximum performance.

## Decision

1. **Rename the npm package to `gigachess`** (turbo = speed). Verified free:
   `npm view gigachess` → 404 on 2026-08-31 (`naming-report.md`); fallback
   `turbo-chess` also free. No conflict with `chess`, `chess.js`, `chess.ts`,
   `chessops` (all distinct, all taken).
2. **`purechess` stays as a one-release alias**: the `alias/purechess/`
   scaffold publishes a thin re-export package that depends on `gigachess`
   and re-exports its full public API. Consumers of
   `import { Chess } from "purechess"` keep working for one minor, then the
   alias is removed (see Consequences).
3. **Exports map stays the same shape** (`.` `./core` `./pgn` `./chess960`
   `./chessops` `./chessjs`) under the new specifier, **plus additive deep
   subpaths** `./chessops/<mod>` (mirroring `chessops`'s own deep-import
   layout) so the workstation can swap `chessops/chess` →
   `gigachess/chessops/chess` as pure specifier changes with zero logic
   changes.
4. Docs, README, bench harness labels and source headers update `purechess`
   → `gigachess` with the alias note. Historical artifacts keep their
   period-correct names: capability specs (`purechess-baseline`,
   `purechess-benchmarks`, …) and archived change IDs
   (`purechess-gates-green`, `purechess-remaining-cleanroom`, …) remain
   Source of Truth and are **not** renamed.

## Consequences

- `npm publish --access public` reserves `gigachess`.
- **Alias removal plan:** after one minor release of `gigachess`, stop
  publishing `purechess`, mark `purechess` `deprecated` on npm with
  `"deprecated": "renamed to gigachess"` in its `package.json`, and delete
  `alias/purechess/`.
- The workstation (separate repo) swaps `chessops` → `gigachess/chessops`
  imports (task 2.1) gated on parity/bench suites remaining green.
- Rollback: revert `package.json` `name` to `purechess-workstation`; no data
  migration.

## References

- `openspec/adr/012-purechess-toolchain.md` (functional-API-only, §4, §8)
- `openspec/adr/014-chessops-exact-public-api.md` (compat façade)
- `naming-report.md` (availability evidence)
