## ADDED Requirements

### Requirement: chessops compat layer (compat.ts) SHALL be a thin conversion over purechess core

The system SHALL expose `src/chessops/compat.ts` as ESM re-exports that convert `purechess` types to `chessground` `Dests`/`Board` shapes without re-implementing movegen. Functions SHALL be pure and SHALL delegate to `purechess/board-movegen` (`allDests`, `isLegal`, `kingAttackers`) and `purechess-rules` (castling rights). No `chessops` code SHALL be read or copied from `node_modules/chessops` or `refs/gpl-only/` or the internet — only `openspec/specs/{purechess-rules,purechess-board-movegen}`.

#### Scenario: chessground Dests parity
- **WHEN** `compat.chessToDests(pos)` is called for 1k random positions from `bench/suites/dests-terminal.mjs` corpus
- **THEN** output is byte-identical to `chessops/compat.ts` `chessToDests` for the same `pos` (maps `allDests` → `Map<Square, Square[]>`)

#### Scenario: Keyboard and screen reader parity via compat
- **WHEN** `BoardContainer` consumes `compat` `Dests` to render legal-move highlights and the user navigates with `[`/`]` or `Alt+B`
- **THEN** highlights and `AriaLiveAnnouncer` announcements remain byte-identical to the `chessops` baseline and `enableArrowMoveShortcuts` stays OFF by default

#### Scenario: Clean-room source check
- **WHEN** CI runs `rg -n "from.*chessops" src/chessops/compat.ts` and `rg -n "GPL" src/chessops/compat.ts`
- **THEN** both return empty and `rg -n "chessops" src/` is empty
