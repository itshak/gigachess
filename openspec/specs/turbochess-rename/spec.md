# turbochess-rename Specification

## Purpose
Renames the MIT library from `purechess` to `turbochess` (turbo = speed, since the engine is now imperative inside per ADR-012) and keeps `purechess` as a one-release alias, with ADR-013 and import-specifier parity.

## Requirements

### Requirement: Package and import specifier rename to turbochess with purechess alias

The system SHALL rename the npm package from `purechess` to `turbochess` and expose the same `exports` map (`.`, `./core`, `./pgn`, `./chess960`, `./chessops`, `./chessjs`) under `turbochess`. `package.json` `name` SHALL be `turbochess`, `purechess` SHALL remain as an alias re-export for one minor (re-export `turbochess`), and `npm view turbochess` SHALL be 404 before publish (reserve `turbochess` + `turbo-chess` fallback, no conflict with `chess`, `chess.js`, `chess.ts`, `chessops`).

#### Scenario: Import specifier parity
- **WHEN** a consumer writes `import { Chess } from "turbochess"` or `from "turbochess/chessops"` or `from "turbochess/pgn"`
- **THEN** it resolves to the same ESM as `purechess` did, with identical `.d.ts` and `sideEffects:false` tree-shaking, and `import { Chess } from "purechess"` still resolves via alias for one release

#### Scenario: ADR and docs updated
- **WHEN** `openspec/adr/013-turbochess-rename.md` is added and `README.md` + `openspec/` references are updated `purechess` → `turbochess`
- **THEN** ADR records why `turbochess` (ADR-012 functional-API-only + Black Magic fancy per-square) and alias removal plan, and `rg -n "from.*purechess" src/` is empty after the workstation swap (next cap)

#### Scenario: i18n and keyboard parity preserved through rename
- **WHEN** `turbochess` `makeSan` is called for `Qh4#` and the workstation `BoardContainer` renders `turbochess/chessops` `Dests`
- **THEN** `en`/`ru`/`he` keys `turbochess.*` (renamed from `purechess.*`) exist and `AriaLiveAnnouncer` via `useChessMoveAnnouncer` remains queue-safe, and keyboard `[`/`]`/`Alt+` chords remain reachable (no `Ctrl+` on Windows)
