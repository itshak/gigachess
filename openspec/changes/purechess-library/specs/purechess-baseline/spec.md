## Purpose

Establishes the clean-room wall, repository layout, naming, and two-phase process for the MIT-licensed `purechess` drop-in replacement for `chessops` (standard + Chess960, no variants), without yet defining detailed chess rules.

## ADDED Requirements

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
