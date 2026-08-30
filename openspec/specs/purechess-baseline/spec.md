# purechess-baseline Specification

## Purpose
Establishes the clean-room wall, repository layout, naming, and two-phase process for the MIT-licensed `purechess` drop-in replacement for `chessops` (standard + Chess960, no variants), without yet defining detailed chess rules.

## Requirements

### Requirement: Clean-room filesystem wall SHALL be enforced

The repository SHALL maintain a physical separation between GPL-tainted and permissive sources so that an implementation agent never reads GPL code.

#### Scenario: Impl agent cannot see GPL sources
- **WHEN** implementation agent lists allowed read roots from `refs/README.md`
- **THEN** only `refs/mit-permissive/` and `refs/docs-refs/` are listed, and `refs/gpl-only/` is absent and `.gitignore`d

#### Scenario: Spec agent is the only GPL reader
- **WHEN** a contributor needs to derive FIDE/Chess960/PGN/FEN rule tables from `chessops` or Stockfish
- **THEN** they do so only as spec agent and produce language-neutral markdown tables, never copying code or docstrings verbatim

#### Scenario: Audit proves separation
- **WHEN** CI checks git history for the implementation path (`src/`, `bench/`, `package.json`)
- **THEN** no commit authored by impl agent contains a read of `refs/gpl-only/` and no GPL text appears in `src/`

### Requirement: Implementation sources SHALL be restricted to permissive, docs, and generated tables — GPL, node_modules, and internet are forbidden

The implementation (all files under `src/`, `bench/` implementation code, and `package.json` implementation dependencies) SHALL NOT read, copy, import, or bundle any file from `node_modules/` (including `node_modules/chessops` and any `chess.js`/`chess.ts` package), `refs/gpl-only/`, or any internet URL. Only the following are allowed as sources: `openspec/specs/` (language-neutral tables), `refs/mit-permissive/`, `refs/docs-refs/`, and `bench/magic-tables/*.json` (MIT, generated offline via `RecklessMagics`). Any GPL-licensed text, including verbatim or transpiled `chessops` source, is forbidden in `src/` and in git history for the implementation change. CI SHALL fail if `rg -n "chessops" src/` or `rg -n "BigInt" src/squareSet.ts` finds GPL-derived or non-performant code outside tests, or if any `src/` file was created by reading `node_modules/chessops/dist/`.

#### Scenario: node_modules is not a source
- **WHEN** an implementation agent needs chess move logic
- **THEN** it reads `openspec/specs/purechess-rules/spec.md` and `refs/docs-refs/FIDE-Laws-2023.notes.md`, not `node_modules/chessops/dist/esm/chess.js` or any `chessops` package file, and `rg -r "from.*chessops" src/` is empty

#### Scenario: Internet is not a source
- **WHEN** an agent needs a PGN or FEN reference
- **THEN** it uses vendored `refs/docs-refs/cm-pgn-notes.md` or `bench/data/lichess_db.sample.pgn`, not `curl`/`WebFetch` to `github.com`/`lichess.org` for GPL code, and no `src/` file contains a fetched GPL snippet

#### Scenario: GPL audit fails on violation
- **WHEN** CI runs `git log --all --oneline -- src/` and `rg -n "GPL|chessops" src/` or checks `package.json` for a `chessops` runtime dependency in `src/` bundle
- **THEN** the check fails if any `src/` file contains GPL text or was derived from `node_modules/chessops`, and the implementation is marked `not implemented` until rewritten clean-room

### Requirement: Repository layout for refs SHALL follow license split

The system SHALL organize reference clones exactly as documented.

#### Scenario: Layout is verifiable
- **WHEN** an auditor runs `ls refs/`
- **THEN** they see `gpl-only/`, `mit-permissive/`, `docs-refs/`, and `refs/README.md` describing allowed consumers and pinning each clone to a commit hash

#### Scenario: GPL clones are isolated outside workstation history
- **WHEN** `refs/gpl-only/chessops` is cloned
- **THEN** it lives outside the workstation's `src/` git history (e.g., `../purechess-refs/` or gitignored `refs/gpl-only/`) and is never imported by `src/lib/chess.ts`

### Requirement: NPM naming SHALL be reserved and documented

The project SHALL reserve `purechess` (primary, verified free 2026-08-29) and document fallbacks.

#### Scenario: Primary name is confirmed
- **WHEN** `npm view purechess` is run
- **THEN** it returns 404 (available) and `proposal.md` records the check via `npm-name-cli`

#### Scenario: Fallbacks are documented
- **WHEN** a reader opens `specs/purechess-baseline/spec.md`
- **THEN** they find at least 3 alternatives: `pure-chess` (free), `rescript-chess` (free), `ocachess` (free), with conflict notes vs `chess`, `chess.js`, `chess.ts`, `chessops`

#### Scenario: Keyboard and screen reader contracts are preserved for future consumers
- **WHEN** purechess is later integrated into `GameViewShell` / `BoardContainer`
- **THEN** board interactions remain reachable via keyboard (`[`, `]`, `f`, `Home`, `End`, `Alt+` chords on Windows) and move announcements via `AriaLiveAnnouncer` are not regressed (verified by future integration tests, no UI change in this phase)

### Requirement: Two-phase process SHALL be explicit

This baseline phase SHALL NOT contain detailed rule/PGN/FEN specs; those are deferred to Phase 2.

#### Scenario: Baseline contains no GPL-derived rule tables
- **WHEN** a reviewer inspects `openspec/changes/purechess-library/specs/`
- **THEN** they find only `purechess-baseline` and `purechess-benchmarks` deltas, and no `FEN grammar`, `castling truth table`, or `PGN ABNF` derived from `chessops`/Stockfish

#### Scenario: Phase 2 is cleanly scoped
- **WHEN** Phase 2 change is created by spec agent
- **THEN** its proposal lists new capabilities `purechess-rules`, `purechess-board-movegen`, `purechess-pgn-fen` and references FIDE 2023 Laws, Chess960 X-FEN/Shredder-FEN, and python-chess/cm-pgn as canonical inputs

### Requirement: i18n and accessibility constraints SHALL propagate

Any future user-facing strings introduced via purechess (error messages for illegal FEN/PGN) SHALL have `en`, `ru`, `he` keys.

#### Scenario: Error strings are localized
- **WHEN** `parseFen` returns a `FenError` with a user-facing message
- **THEN** the error code maps to i18n keys `purechess.fen.<code>` in `en`, `ru`, `he` translation files
