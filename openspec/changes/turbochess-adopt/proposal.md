## Why

`purechess` now beats `chessops` on every `bench/bench-real.mjs` gate (3.36× sliding, +19% perft, 2.1× PGN, 2.02× FEN, `bench/results/real-2026-08-30-gates-green.md` 13/13) and `chess.js` on all 4 lanes (`bench/results/chessjs-2026-08-31.md` 2.68× FEN, 3.41× SAN, 2.83× PGN), but the name `purechess` promised a *pure functional* engine while `openspec/adr/012-purechess-toolchain.md:37` now says **functional *only* at the public API boundary (non-mutable userdata), imperative *inside* (`WritableBoard` scratch, `forEachSquare`)** for max perf. `purechess` is also taken on npm? *No, it is free*, but the semantics no longer match — `turbochess` signals the actual value: **turbo speed**. This change renames the package, wires the workstation one-line swap, and triggers a holistic footprint/perf audit (why `chessops` is 1.5× smaller in lines than our 3,380 `src/*.ts`).

## What Changes

- **Renaming `purechess` → `turbochess` (BREAKING for consumers, alias for transition):**
  - `package.json` `name` `purechess` → `turbochess`, `package-lock.json`, `README.md`, `openspec/` references, `npm view turbochess` availability check (`npm-name-cli` free → reserve `turbo-chess` fallback, conflict `turbochess` ≠ `chess.js`/`chess.ts`/`chessops`). `purechess` stays as **alias** `npm publish --access public` with `package.json` `publishConfig` or as re-export `import { Chess } from "purechess"` → `turbochess` for one-release transition.
  - `dist/` `exports` map `. "./core" "./pgn" "./chess960" "./chessops" "./chessjs"` unchanged, just under `turbochess` import specifier (`import { Chess } from "turbochess"` / `from "turbochess/chessops"`).
  - `openspec/adr/013-turbochess-rename.md` records why `turbochess` (ADR-012 functional-API-only + Black Magic Fancy per-square 107k blobs, not pure FP) and that `purechess` alias will be removed after one minor.
- **One-line workstation swap (the `turbochess-adopt` in the name):**
  - Workstation `src/lib/chess.ts` (or wherever `import { Chess } from "chessops"` lives per ADR-010) changes **one import line** `from "chessops"` → `from "turbochess/chessops"` (and `pgn-chess-tree` → `turbochess/pgn` where used). No logic change, just re-export. Gated on `tests/compat-chessops.mjs` + `tests/parity.mjs` + `bench/bench-real.mjs` 13/13 remaining green, plus VoiceOver/NVDA `[`/`]`/`Alt+` + `AriaLiveAnnouncer` `makeSan` byte-identical.
- **Holistic optimization audit (instruction to impl agent):** After rename+swap, the impl agent SHALL re-read **all** `src/*.ts` (3380 LOC today: `src/chess.ts:988`, `src/fen.ts:437`, `src/san.ts:434`, `src/pgn.ts:347`, `src/attacks.ts:453`, `src/board.ts:238`, `src/squareSet.ts:188` vs `chessops` ~2.2k) and find footprint/perf wins without changing observable behaviour (all `bench/suites/*` gates + `perft`/`dests` parity vs `chessops` must stay green). Focus on:
  - Duplicated `Board`/`Setup`/`FEN` codecs between `src/fen.ts` + `src/chessops/fen.ts` + `src/board.ts` (three FEN paths); `src/rookMagicBlob.ts`/`src/bishopMagicBlob.ts` (12 lines each, just base64 strings) vs `src/rookMagic.ts`/`src/bishopMagic.ts` (object tables, now dead-code behind blobs); `src/squareSet.ts` ops vs `src/chessops/squareSet.ts` (near-identical `{lo,hi}`); `src/san.ts:434` vs `src/chessops/san.ts` duplication; `src/chess.ts:988` `perft`/`dests` vs `src/chessops/chess.ts:1` façade duplication.
  - Lazy-loading boundary: `src/attacks.ts:453` already lazy via `ensureMagicTablesLoaded()` + `bench/magic-tables` blobs (47KB gz total vs 83KB static was 15.6× `chessops`; now 118% of `chessops` per `real-2026-08-30-gates-green.md`), but `dist/rookMagic.js`/`dist/bishopMagic.js` still ship object tables for harness — can they be deleted after blob migration?
  - `const enum` vs `object as const` trade-off per `openspec/adr/012-purechess-toolchain.md:81` — are we over-using `object as const` where `const enum` would shave 50-150B per enum?

## Capabilities

### New Capabilities
- `turbochess-rename`: Renaming `purechess` → `turbochess` (npm package, import specifier, docs, OpenSpec) with `purechess` alias for one release and ADR-013.
- `turbochess-adopt`: One-line workstation import swap `chessops` → `turbochess/chessops` (and `pgn-chess-tree` → `turbochess/pgn`) with parity/perf gates.
- `turbochess-optimization-audit`: Holistic footprint/perf audit of the 1.5× line-count gap vs `chessops` (~2.2k vs 3,380 `src/*.ts`) — find and document deduplication and dead-code wins without changing gates.

### Modified Capabilities
- None — `purechess-{baseline,benchmarks,rules,board-movegen,pgn-fen}` remain Source of Truth; this change only renames the **distribution** and **adopts** it. No requirement text changes beyond the new caps.

## Impact

- **Code:** `package.json` `name`, `package-lock.json`, `src/` *no* logic change (only import specifiers in `src/lib/chess.ts` + `src/chessops/*` re-exports), `openspec/` + `docs/` + `bench/` string `purechess` → `turbochess` (plus alias). `dist/` output via `tsc -p tsconfig.build.json` unchanged shape, just under `turbochess` specifier.
- **Dependencies:** No new runtime deps; `chessops@0.15.1` and `chess.js@1.4.0` stay as bench baselines (dev, never in `src/`). `npm view turbochess` must be 404 before publish (reserve `turbochess` + `turbo-chess` fallback, check vs `chess`, `chess.js`, `chess.ts`, `chessops` conflicts per proposal).
- **Licensing:** `turbochess` stays **MIT** (like `purechess`), workstation stays **AGPL-3.0-or-later** until the one-line swap proves `rg GPL src/` empty. Alias `purechess` → `turbochess` avoids breaking `purechess-remaining-cleanroom` consumers.
- **Accessibility:** No UI change, but `turbochess/chessops` `makeSan` must stay byte-identical to `chessops` (so `useChessMoveAnnouncer` + `AriaLiveAnnouncer` + `[`/`]`/`Alt+` remain correct, `enableArrowMoveShortcuts` OFF by default, VoiceOver/NVDA next-impl verification).
