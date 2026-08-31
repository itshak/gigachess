# turbochess-adopt Specification

## Purpose
Wires the workstation one-line import swap from `chessops` (and `pgn-chess-tree`) to `turbochess` so the desktop app drops GPL `chessops` entirely, gated on parity and bench/perf remaining green.

## Requirements

### Requirement: One-line workstation import swap to turbochess

The system SHALL change exactly one import line in the workstation adapter (e.g. `src/lib/chess.ts` today `import { Chess } from "chessops"` → `from "turbochess/chessops"` and `pgn-chess-tree` → `turbochess/pgn` where used) with no logic change, re-exporting the same `Chess`, `parseFen`/`makeFen`, `parseSan`/`makeSan`, `parsePgn`/`makePgn` surface. After the swap, `rg -n "from.*chessops" src/` and `rg -n "pgn-chess-tree" src/` SHALL be empty, and `rg GPL src/` empty remains.

#### Scenario: One-line diff
- **WHEN** `git diff HEAD -- src/lib/chess.ts` is inspected after the swap
- **THEN** the diff is exactly `from "chessops"` → `from "turbochess/chessops"` (plus `pgn-chess-tree` → `turbochess/pgn` if present) and no other `src/` logic line changes

#### Scenario: Parity gates remain green after swap
- **WHEN** `npm run test` (`perft`, `castling`, `parity`, `purity`, `compat-chessops`, `chessjs-parity`) and `bench/bench-real.mjs --quick` (13 gates) and `bench/suites/chessjs.mjs` (100% parity) are run after the swap
- **THEN** all perft `1104/1104`, dests `0 mismatches / 295,185 moves`, FEN `99.97%` (3 Chess960 `HAha` vs `KQkq` expected), SAN 100%, PGN 2.1×, bundle core 118% of `chessops` remain green, so `purechess-adopt` (ADR-010) is unblocked

#### Scenario: Keyboard and screen reader not regressed by swap
- **WHEN** `GameViewShell` `BoardContainer` is driven by `turbochess/chessops` `Chess` and the user presses `[` (back) / `]` (forward) or `Alt+B` / `Alt+R` on Windows with NVDA/JAWS in browse mode
- **THEN** `AriaLiveAnnouncer` via `makeSan` stays byte-identical to the `chessops` baseline, `enableArrowMoveShortcuts` stays OFF by default, and focus stays in `BoardContainer` (no `autoFocus` disruption)
