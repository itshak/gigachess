## Why

Phase 1 (ADR-012) and Phase 2 (`purechess-spec` specs now in `openspec/specs/`) locked the only allowed sources (`refs/mit-permissive/` + `refs/docs-refs/` + `bench/magic-tables/*.json`, never `refs/gpl-only/`) and proved Black Magic `{lo,hi}` wins. The MIT `purechess` npm package still does not exist — workstation `src/` still imports GPL `chessops`. This impl change finally builds `purechess` from the language-neutral specs so the workstation can migrate and the bundle can shrink.

## What Changes

- Implements `purechess` npm library per `purechess-{rules,board-movegen,pgn-fen}` specs + ADR-012:
  - `src/squareSet.ts` — `{lo,hi}` pair, pure ops, no `BigInt` in hot path, `target ES2020` (no `downlevelIteration`)
  - `src/attacks.ts` — Black Magic plain fixed-shift uniform 11 (default, 47.86 vs Fancy 45.84 → plain +4.4% @10M; Fancy per-square is allowed alternative for Stockfish-table compat, same 441% vs HQ) via `bench/magic-tables/{rook,bishop}.json` (MIT, not GPL)
  - `src/board.ts` / `src/fen.ts` / `src/san.ts` / `src/pgn.ts` / `src/chess960.ts` / `src/chess.ts` (`Chess`, `Position`, `Result`, `perft`)
- Publishes `purechess` as MIT with `package.json` `sideEffects:false`, `exports` map `"."`, `"./core"` (no PGN/Chess960), `"./pgn"`, `"./chess960"` + `purechess/chessops` + `purechess/chessjs` shims for drop-in adoption, `.d.ts` via `genType` or native, `const enum` inlined per ADR-012.
- **BREAKING (future, not in this change):** Workstation `src/lib/chess.ts` will later swap `import { Chess } from "chessops"` → `import { Chess } from "purechess"` + `purechess/chessjs` for `chess.js` consumers — not in this impl change, but this change must keep `makeSan` byte-identical to `chessops` so `useChessMoveAnnouncer` stays correct.
- Gates via `bench/` harness already in repo: `MQueens/s` +441% vs HQ, `perft(6)=119060324`, `games/s` +50% vs chessops, FEN/SAN parity, bundle gz.

## Capabilities

### New Capabilities
- None — `purechess-{baseline,benchmarks,rules,board-movegen,pgn-fen}` are already Source of Truth (archived `purechess-library` + `purechess-spec`); this change is pure implementation that must satisfy them without new requirement text. `skip_specs: true` in `.openspec.yaml`.

### Modified Capabilities
- None — no requirement text changes; implementation gates are `openspec/specs/{purechess-rules,purechess-board-movegen,purechess-pgn-fen,purechess-benchmarks}` plus `bench/bench-*.mjs` SHALL gates.

## Impact

- **Code:** Adds `src/{squareSet,attacks,board,fen,san,pgn,chess960,chess}.ts` + `src/index.ts` + `bench/magic-tables` already present; no `src-tauri/` Rust change (but `cargo check` gate still runs). `refs/gpl-only/` stays gitignored, impl reads only `openspec/specs/` + `refs/mit-permissive/` + `refs/docs-refs/`.
- **Dependencies:** No new runtime GPL deps; `typescript` + `esbuild` already present, `chessops` stays as bench baseline `0.15.1` until migration is proven. `rescript` stays dev-only (hot path is TS per ADR-012). `RecklessMagics` is offline generator, not runtime.
- **Licensing:** `purechess` is MIT; workstation stays AGPL until migration proves `rg GPL src/` empty. No GPL text in `src/` (CI `rg BigInt src/squareSet.ts` empty, `rg GPL src/` empty).
- **Accessibility:** No UI change, but `makeSan` must stay byte-identical to `chessops` so `useChessMoveAnnouncer` + `AriaLiveAnnouncer` + `[`/`]`/`Alt+` chords in `GameViewShell` are unaffected. Future integration tests will run VoiceOver/NVDA on `[`/`]` stepping with `enableArrowMoveShortcuts` OFF by default.
