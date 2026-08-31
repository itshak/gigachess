## Purpose

Triggers a holistic footprint/perf audit of the 1.5× line-count gap vs `chessops` (3,380 `src/*.ts` vs ~2.2k) after all gates are green, to find deduplication and dead-code wins without changing observable behaviour.

## ADDED Requirements

### Requirement: Holistic audit of line-count and footprint gap vs chessops with no gate regression

The system SHALL produce an audit report `docs/audit-turbochess-footprint.md` (or `bench/results/audit-*.md`) that re-reads **all** `src/*.ts` and lists the top footprint/perf win candidates, then implements the **safe wins** as follow-up tasks. Candidates to audit (from proposal): duplicated `Board`/`Setup`/`FEN` codecs (`src/fen.ts:437` + `src/chessops/fen.ts` + `src/board.ts:238`), `src/rookMagicBlob.ts:12`/`src/bishopMagicBlob.ts:12` (12-line base64) vs `src/rookMagic.ts`/`src/bishopMagic.ts` (object tables, now dead-code behind blobs), `src/squareSet.ts:188` vs `src/chessops/squareSet.ts` (~identical `{lo,hi}`), `src/san.ts:434` vs `src/chessops/san.ts`, `src/chess.ts:988` vs `src/chessops/chess.ts:1` façade duplication, `const enum` vs `object as const` per ADR-012. No `bench/suites/*` gate may regress (MQueens/s +441%, perft parity, PGN 2.1×, FEN 2×, bundle).

#### Scenario: Audit report exists and is actionable
- **WHEN** `cat docs/audit-turbochess-footprint.md` is inspected after the audit
- **THEN** it lists at least 5 deduplication/dead-code candidates with `src/*.ts:line` refs, estimated LOC/bytes saved, and gate impact (e.g. `src/rookMagic.ts` deletion saves ~3,373 KB raw / 81KB gz `bench/results/real-2026-08-30-gates-green.md:43`), and `npm run typecheck` still passes

#### Scenario: No parity or perf regression from audit wins
- **WHEN** the safe wins from the audit are implemented (e.g. delete dead `src/rookMagic.ts`/`src/bishopMagic.ts` object tables after blob migration, deduplicate `fen.ts` codecs) and `npm run bench:real -- --quick` is re-run
- **THEN** all 13 gates remain green and `tests/parity.mjs` dests remain 0 mismatches, so the audit did not change observable behaviour

#### Scenario: i18n and keyboard still covered after audit
- **WHEN** `en`/`ru`/`he` keys for `turbochess.*` (renamed) are checked and `GameViewShell` keyboard `[`/`]`/`Alt+` + `AriaLiveAnnouncer` are re-tested after deduplication
- **THEN** `en`/`ru`/`he` still exist and `enableArrowMoveShortcuts` OFF by default still holds

