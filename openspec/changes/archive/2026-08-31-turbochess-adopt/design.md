## Context

See `proposal.md` Why. Current `purechess` (MIT) now beats `chessops` on all 13 `bench/bench-real.mjs` gates, but the name promises pure-functional while ADR-012 says **functional *only* at the public API boundary** (`tests/purity.mjs` deep-freeze, `Board`/`Position` `readonly`) and **imperative inside** (`WritableBoard` scratch, `forEachSquare`) for speed, and Black Magic is **fancy per-square** via blobs (not plain uniform 11). This design covers the rename to `turbochess` (turbo = speed), the one-line workstation swap, and the audit for the 1.5× line-count gap (3,380 `src/*.ts` vs `chessops` ~2.2k) without changing gates.

## Goals / Non-Goals

**Goals:**
- Rename the distribution `purechess` → `turbochess` (npm `name`, `package.json` `exports` map stays `"." "./core" "./pgn" "./chess960" "./chessops" "./chessjs"` but under `turbochess` specifier) with a one-minor `purechess` alias re-export and ADR-013.
- Wire the workstation one-line swap `src/lib/chess.ts` `from "chessops"` → `from "turbochess/chessops"` (plus `pgn-chess-tree` → `turbochess/pgn`) gated on `bench/bench-real.mjs` 13/13 and `tests/compat-chessops.mjs` remaining green, plus VoiceOver/NVDA `[`/`]`/`Alt+` + `AriaLiveAnnouncer`.
- Produce `docs/audit-turbochess-footprint.md` that holistically re-reads all `src/*.ts` and finds footprint/perf wins for the 1.5× gap without regressing gates.

**Non-Goals:**
- No `src/` logic change beyond import specifiers and the alias re-export, no new magic tables, no WASM lane, no `src-tauri/` Rust, no DB schema.
- No new runtime deps; `chessops@0.15.1` and `chess.js@1.4.0` stay as bench baselines (dev, never in `src/`).

## Decisions

### Decision: Rename to turbochess, keep purechess alias for one minor

- **Chosen:** `package.json` `name: "turbochess"`, `npm publish` reserves `turbochess` (404 today via `npm-name-cli`, fallback `turbo-chess` checked vs `chess`/`chess.js`/`chess.ts`/`chessops`) and keeps `purechess` as a one-release alias (`purechess` package re-exports `turbochess`, or `purechess@latest` depends on `turbochess`). `openspec/adr/013-turbochess-rename.md` records why `turbochess` (ADR-012 functional-API-only + fancy per-square) and removal plan. All `openspec/` + `docs/` + `bench/` strings `purechess` → `turbochess` with alias note.
- **Alternative:** Keep `purechess` — rejected: name implies pure FP, but the engine is now explicitly imperative inside per ADR-012 §4; `turbochess` signals the actual value (3.36× sliding, 2.1× PGN) and is free on npm.
- **ADR refs:** ADR-012, new ADR-013.

### Decision: One-line swap via thin re-export, not a fork

- **Chosen:** Workstation `src/lib/chess.ts` changes exactly one line per import (`from "chessops"` → `from "turbochess/chessops"`), plus `from "pgn-chess-tree"` → `from "turbochess/pgn"` where used. `turbochess/chessops` is the same `src/chessops/*` compat (`compat`/`transform`/`debug` as thin conversions, not new movegen) and `turbochess/chessjs` is the same mutable façade over `src/chess.ts` — both already exist as `purechess` entries, just under the new specifier. No logic, just re-export.
- **Alternative:** Fork `chessops` and patch — rejected: would copy MIT `chessops` code and its hyperbola.

### Decision: Audit is holistic re-read, then safe wins only, gated

- **Chosen:** After rename+swap, the impl agent SHALL re-read **all** `src/*.ts` (3380 LOC today) and list the top wins in `docs/audit-turbochess-footprint.md` with `src/*.ts:line` refs and estimated LOC/bytes saved, then implement only the **safe wins** that keep all `bench/suites/*` gates green (MQueens/s +441%, perft 1104/1104, PGN 2.1×, FEN 2×, bundle core 118% of `chessops`, `chessjs` 100%). Candidates: duplicated `Board`/`Setup`/`FEN` codecs (`src/fen.ts:437` + `src/chessops/fen.ts` + `src/board.ts:238`), dead `src/rookMagic.ts`/`src/bishopMagic.ts` object tables behind blobs (`bench/magic-tables` blobs are 47KB gz vs object 81KB gz), `src/squareSet.ts:188` vs `src/chessops/squareSet.ts` near-identical, `src/san.ts:434` vs `src/chessops/san.ts`, `src/chess.ts:988` vs `src/chessops/chess.ts:1` façade duplication, `const enum` vs `object as const` per ADR-012.
- **Alternative:** Audit and rewrite in one go — rejected: risks gate regression (the `perft`/`dests` parity was 0 mismatches only after the `makeMove` castling fix).
- **ADR refs:** ADR-012 §8 (module split, `const enum`).

## Risks / Trade-offs

- [Risk] Rename breaks `purechess-remaining-cleanroom` consumers mid-flight → Mitigation: `purechess` alias re-export for one minor, `purechess/chessops` → `turbochess/chessops` shim, `README` migration note `import { Chess } from "purechess"` → `from "turbochess"`.
- [Risk] One-line swap hides a missing `chessops` API (`variant.ts` etc.) → Mitigation: `tests/compat-chessops.mjs` already locks `allDests`/`makeSan`/`parseSan`/`perft`/`SquareSet` + `dist/chessops` re-exports; swap is gated on it remaining 51/51.
- [Risk] Audit tempts to delete `src/rookMagic.ts`/`src/bishopMagic.ts` while `bench/magic-tables` still serves `dist/rookMagic.js` for harness → Mitigation: delete only after `bench/bench-real.mjs` confirms blob path is the sole loader (`rg rookMagic src/` empty except blob).

## Migration Plan

1. Land `turbochess-adopt` (rename + one-line swap + audit report) — `npm run typecheck` + `rg GPL src/` empty + `bench/bench-real.mjs --quick` 13/13 green + `bench/suites/chessjs.mjs` 100% + VoiceOver/NVDA `[`/`]`/`Alt+` check.
2. Publish `turbochess` to npm (MIT) with `purechess` alias; remove alias after one minor.
3. Rollback: revert `src/lib/chess.ts` import to `from "chessops"` and `package.json` `name` to `purechess`; no data migration.

## Open Questions

- None that block this change — WASM lane remains deferred per ADR-012 until JS ceiling proven too low.
