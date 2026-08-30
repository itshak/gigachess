## Why

PureChess workstation is AGPL-3.0-or-later *because* it bundles GPL-3.0 chess libs (`chessops` TS, `shakmaty` Rust, `chessground`) per ADR-001 and ADR-010. This blocks MIT consumers and prevents replacing the buggy `chess.js` ecosystem. A clean-room, MIT-licensed drop-in replacement for `chessops` (standard + Chess960 only, no variants), published as `purechess` on npm, would remove the biggest GPL taint from the frontend, unlock smaller bundles, and give the project full control over performance — especially PGN workflows that dominate repertoire/database use.

This change is **Phase 1 — baseline only**. It erects the clean-room wall, reserves naming, defines success metrics, and runs a bake-off to pick the implementation language/encoding. **Phase 2** (separate change, executed by an isolated *spec agent* with GPL read access) will produce detailed language-neutral rule/PGN/FEN/board specs derived from `chessops`, Stockfish, and FIDE.

## What Changes

- **BREAKING (future, not in this phase):** Once `purechess` ships, `src/lib/chess.ts` and workspace consumers will migrate from `chessops` to `purechess` (ADR-010 follow-up). No code migration in this baseline phase.
- Erects **clean-room filesystem wall**: `refs/gpl-only/` (spec-agent only: `chessops`, Stockfish, `pgn-chess-tree` — note `pgn-chess-tree` is owned by the author but remains GPL-tainted due to `chessops` + lichess GPL code and SHALL NOT be copied) vs `refs/mit-permissive/` (impl-agent may read: GopherCheck, NuclearChess, Chess4j, `magic-bits`, RecklessMagics, `Chess_Movegen` / Gigantua) vs `refs/docs-refs/` (FIDE 2023 Laws, python-chess docs). Documents that `impl agent` never mounts `refs/gpl-only`.
- Reserves **npm names**: `purechess` (free, verified 2026-08-29), `pure-chess` fallback, plus `rescript-chess` / `ocachess` defensive reserves; records `npm-name-cli` + registry + typosquat checks.
- Defines **benchmark harness + success gates** to decide language/encoding at end of Phase 1: `MQueens/s` sliding micro, `perft(6)`, FEN/SAN round-trip, PGN streaming (100k-game corpus) — all vs `chessops@0.15.1` on pinned Node, 5-run median.
- Runs **bake-off Task 1**: `TS functional ({lo,hi} manual)` vs `ReScript {lo,hi} manual` vs `ReScript Int64 (caml_int64)` vs `BigInt` vs `chessops HQ` baseline — same corpus, same harness. Winner locks board encoding and slider algorithm (Black Magic fixed-shift expected) for Phase 2 specs.
- Explicitly **defers** detailed rule tables, castling algorithms, PGN grammar, magic table JSON, and API surface mapping to Phase 2 spec agent — this change creates only *scaffolding* specs.

## Capabilities

### New Capabilities
- `purechess-baseline`: Clean-room wall, repo layout, npm naming, two-phase process, performance gates, and bake-off procedure. Becomes `specs/purechess-baseline/spec.md`.
- `purechess-benchmarks`: Benchmark harness, corpora, metrics (`MQueens/s`, perft, PGN games/s, bundle gz), and pass/fail thresholds. Becomes `specs/purechess-benchmarks/spec.md`.

### Modified Capabilities
- None — no existing `openspec/specs/` behavior is changed in this baseline phase. Detailed rule changes land in Phase 2 delta specs.

## Impact

- **Code:** No workstation source (`src/`, `src-tauri/`) is touched in this phase. Adds `refs/` (gitignored for `gpl-only`), `bench/` harness, `specs/purechess-*` docs.
- **Dependencies:** No new npm/cargo deps in this phase; Phase 2 may add `rescript` or keep `typescript` based on bake-off. All permissive refs are MIT (verified) — see `refs/README.md`.
- **Licensing:** Baseline docs are MIT/CC0; library target is MIT (per ADR-001 follow-up). GPL sources remain isolated to `refs/gpl-only` and are never copied into `src`. `pgn-chess-tree` authorship does not cleanse GPL taint — its optimizations must be re-specified from scratch via spec agent, not copied.
- **Accessibility:** No UI change in this phase. Phase 2 benchmark harness must include SAN/announcement parity checks so future `purechess` doesn't regress `AriaLiveAnnouncer` move announcements.
- **Risk:** If bake-off shows TS-functional beats ReScript on all benches, ReScript is dropped with no rework — spec stays language-neutral.
