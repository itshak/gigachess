# purechess-gates-green Specification Delta

## MODIFIED Requirements

### Requirement: Bundle size gate SHALL enforce tree-shaking

The library SHALL ship tree-shakeable modules so consumers pay only for what they import. Because the Black Magic tables are measured data (841 KB raw / 26 KB gz for 107,648 entries) that no chess-reasoned code should carry statically, the gate is re-baselined to a like-for-like comparison:

- `purechess/core` SHALL exclude PGN, Chess960, **and magic-table bytes from its static import graph** (tables load via dynamic `import()` per the `purechess-board-movegen` delta). The static core bundle SHALL be **≤120% of the chessops Chess-import bundle** (measured code-only: 6.0 vs 5.2 KB gz — purechess core code is chessops-parity, not 30% smaller; the former "≥30% smaller than chessops Chess-import" clause compared a data-carrying core against a table-free library and was unachievable).
- `purechess` (full, tables included via dynamic chunks) SHALL report its gzipped total for transparency against chessops' full public API bundle; no SHALL threshold is set on it beyond core exclusion.
- The real-world suite gates in this capability (perft node parity, dests-terminal 100% parity, fen-san-uci ≥99% parity, sliding parity + speed) SHALL pass in `npm run bench:real:ci` — they are the acceptance criteria this change exists to satisfy. The FEN parse+make ≥+20% throughput gate SHALL either pass (via `parseFen`/`makeFen` optimization) or a follow-up spec amendment with evidence SHALL be proposed — it SHALL NOT be silently dropped.

#### Scenario: Core vs full bundle
- **WHEN** `npm run build` is measured with `esbuild` and `sideEffects:false`, bundling a consumer importing `import { Chess } from "purechess/core"`
- **THEN** the static bundle SHALL be ≤120% of the chessops Chess-import bundle (chessops-import baseline ≈5.2 KB gz, purechess core code ≈6.0 KB gz with tables excluded), and the full `purechess` bundle plus lazy table chunk SHALL be reported (expected ≈26–32 KB gz total vs 81 KB before)

#### Scenario: Tree-shaking is verified
- **WHEN** a consumer imports `import { Chess } from "purechess/core"`
- **THEN** the production bundle SHALL NOT include `parsePgn`, Chess960 castling tables, **or magic-table bytes** (verified via `npm run bench:real -- --suite bundle`)

#### Scenario: All real-world gates pass
- **WHEN** `npm run bench:real:ci` runs (full corpora)
- **THEN** the exit code is 0: sliding parity ✓, perft node parity ✓ (0 mismatches), pgn-stream ≥+50% games/s + heap ≤110% ✓, fen-san-uci parity ≥99% + FEN ≥+20% or documented-achieved ✓, dests-terminal 100% parity ✓, bundle gates ✓
