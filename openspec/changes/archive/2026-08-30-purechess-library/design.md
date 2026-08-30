## Context

PureChess workstation is a Tauri 2 + React 19 app; `src/` currently has no implementation files (spec skeleton), but `AGENTS.md` and `openspec/adr/` encode strong invariants: AGPL taint from `chessops`/`shakmaty`/`chessground` (ADR-001), `chessops` migration done (ADR-010), unified board primitives (ADR-011), and a clean public baseline (ADR-009). This change does **not** touch workstation code; it scaffolds a separate MIT library (`purechess`) as a future `chessops` replacement. Detailed chess rules/PGN/FEN/board derivations from GPL sources are **out of scope** here — they belong to Phase 2 spec agent that *may* read `refs/gpl-only/`. This design covers only the baseline wall + harness + bake-off.

See `proposal.md` for motivation and `specs/purechess-*/spec.md` for gates.

## Goals / Non-Goals

**Goals:**
- Make the clean-room wall *physical* and auditable (filesystem, gitignore, CI) before any GPL read happens.
- Reserve `purechess` on npm and document fallbacks so branding is locked.
- Provide a reproducible harness that declares `purechess` winner *in JS* (no WASM in v1) across 6 benches vs `chessops@0.15.1`.
- Run a bake-off that locks `Board` encoding (`{lo,hi}` vs `BigInt`) and slider algorithm (Black Magic vs HQ) so Phase 2 specs can be written language-neutral but implementation-ready.

**Non-Goals:**
- No FEN/SAN/PGN grammars, no castling truth tables, no magic JSON, no `Chess` API surface — Phase 2.
- No workstation integration, no `src/lib/chess.ts` migration, no Rust `shakmaty` changes.
- No WASM lane in v1 (deferred to `purechess/wasm` if ever needed).
- No `chess.js` compat shim yet (tracked separately).

## Decisions

### Decision: Two-phase, two-agent clean-room

- **Chosen:** Phase 1 (this change, baseline agent) never reads `refs/gpl-only/`; Phase 2 (spec agent) *only* reads GPL + FIDE/python-chess and emits language-neutral specs + checked-in `magic-tables/*.json`. Impl agent in Phase 2 reads only `specs/` + `refs/mit-permissive/`. Note: `pgn-chess-tree` is author-owned but still in `gpl-only/` — its AGPL taint from `chessops` + lichess GPL forbids direct reuse; its `GameTree` optimizations (author's own) must be re-specified abstractly (SAN tree shape, streaming chunking) and reimplemented clean-room, not copied.
- **Alternative:** Single-phase “read everything then spec” — rejected, taints impl history, loses audit trail.
- **ADR refs:** ADR-001 (AGPL taint), ADR-009 (private vs public baseline — same split principle).

### Decision: JS-only v1, no WASM

- **Chosen:** JS `lo/hi` pair + Black Magic is enough to beat `chessops HQ` (HQ needs `minus64`+`bswap` per direction; Black Magic is 1 table lookup). WASM `i64` would win micro but adds boundary marshalling for PGN strings and async instantiate.
- **Alternative:** WASM core — deferred to optional `purechess/wasm` entry if Phase 1 ever shows JS ceiling too low.
- **Rationale:** Prior art `GopherCheck` (MIT, Go `uint64`) uses plain magic baseline, proven on Gigantua `MQueens/s` harness.

### Decision: Bake-off decides language — TS functional vs ReScript manual `{lo,hi}`

- **Chosen:** Benchmark both with identical `lo/hi` layout. `TS` = hand-written `class SquareSet {lo,hi}` like chessops; `ReScript` = `type bitboard = {lo:int, hi:int}` with `land/lor/lxor` (no `Int64` runtime). Winner is fastest median of 5 runs on V8. Spec stays language-neutral (`Bitboard` abstract with ops `and/or/xor/shl/shr/minus/popcnt`).
- **Alternative:** Lock PureScript or `ReScript Int64 (caml_int64)` — rejected: PureScript `Eff`/`ST` adds call overhead; `caml_int64` is function-call per op vs inline `&`.
- **Functional guarantee:** API is pure (`parseFen`→`Result`, `play`→new `Position` via clone), but hot loops (`bishopAttacks`, hyperbola/magic) may use local `let`/`while` mutables inside pure function — enforced by lint allowlist `src/attacks/*` + `src/squareSet/*` only.

### Decision: Module split for tree-shaking

- **Chosen:** `purechess/core` (Board, SquareSet, `Chess`, FEN/SAN/UCI), `purechess/pgn` (streaming parser + `GameTree`), `purechess/chess960` (960 castling tables). Package sets `sideEffects:false`, `exports` map, `genType` or native `.d.ts`.
- **Alternative:** Single bundle — rejected, loses 30% gz target vs chessops.

### Decision: npm naming

- **Chosen:** Keep `purechess` (free, 2026-08-29) — “pure” = pure functions, not PureScript. Reserve `pure-chess`, `rescript-chess`, `ocachess` defensively. `rechess` is unpublished (2024-06-15) but ambiguous (“re-chess”); not primary. Document via `npm-name-cli`.
- **Alternative:** `rechess` — rejected, loses brand equity and implies ReScript lock-in.

## Risks / Trade-offs

- **[Risk] ReScript `TAG` variants add object overhead vs TS unions** → Mitigation: use `{lo,hi}` records + plain arrays for moves in hot path; reserve variants for `Move` at API boundary only; benchmark bundle after each candidate.
- **[Risk] `BigInt` temptation for correctness** → Mitigation: harness includes `D: BigInt` candidate explicitly to prove 60× slowdown (Scala.js precedent, `tc39/proposal-bigint#117`); spec forbids `BigInt` in hot path.
- **[Risk] GPL contamination via docstrings / via `pgn-chess-tree` (author-owned but AGPL)** → Mitigation: spec agent checklist — no verbatim `chessops` comments, magic tables generated via MIT `RecklessMagics`/`magic-bits` and checked in as JSON, `LICENSE` MIT + `NOTICE` lists only MIT deps; `pgn-chess-tree` tree/streaming APIs are re-spec'd from behavior (headers, variations, NAGs, `GameTree` node shape) not from source, even for author's own optimizations.
- **[Risk] `perft` parity vs speed trade-off** → Mitigation: gate is “≥ parity” for v1, +15% target; if Black Magic regresses perft due to larger tables, fallback to HQ and re-bench.
- **[Risk] PGN streaming needs string handling, not bitboards** → Mitigation: PGN bench is separate from slider bench; purechess wins PGN via chunked parser + less alloc, not via slider.
- **[Risk] Contributor pool shrinks if ReScript wins** → Mitigation: keep spec language-neutral and `src` readable (`let`/`for`); `genType` emits `.d.ts` so TS consumers never see ReScript.

## Migration Plan

1. Land this baseline change (wall + harness + bake-off wiring, no GPL reads).
2. Freeze `bench/data/` corpus hash and `chessops@0.15.1` baseline in CI.
3. Run bake-off (Task 1), record winner in `design.md` appendix and `specs/purechess-benchmarks/spec.md` — no code migration yet.
4. Spawn **Phase 2 change** (`purechess-spec`) owned by spec agent (GPL read allowed) to emit `purechess-rules`, `purechess-board-movegen`, `purechess-pgn-fen` delta specs + `magic-tables/*.json`.
5. Future impl change migrates `src/lib/chess.ts` from `chessops` to `purechess` (ADR-010 follow-up), gated on all 6 benches passing.

Rollback: delete `refs/` and `bench/` wiring — no workstation code affected, so no data migration.

## Open Questions

- None that block this baseline. Language winner is intentionally deferred to bake-off data. WASM lane is deferred to `purechess/wasm` if Phase 2 ever shows JS ceiling.

## Appendix — Phase 1 Baseline Bake-off Result & Handoff to Phase 2 (2026-08-30)

> **NOTE (Phase 2 handoff):** This appendix records the Phase 1 bake-off winner, the `pgn-chess-tree` ownership-but-GPL-taint nuance, and that Phase 2 spec agent (separate change, GPL-read allowed) will produce `purechess-rules`, `purechess-board-movegen`, `purechess-pgn-fen` delta specs — no implementation in this baseline. Verified `openspec status --change purechess-library --json` shows `proposal:done`, `specs:done`, `design:done`, `tasks:done` (see verification below).

### Bake-off winner (Task 4.5, `bench/results/sliding-2026-08-30.md` — **honest, REAL HQ**)

- **Harness:** `bench/bench-sliding.mjs` — **1M and 10M iters**, 5-run median, warmup 5% excluded, Node `v24.19.0` (spec pin `v22.5.0`)
- **Candidates:**
  - `A hq` (**REAL chessops HQ hyperbola**, not synthetic — `bench/candidates/hq.mjs` now wraps `chessops/dist/esm/attacks.js` + `SquareSet`): **9.36 MQueens/s @1M** (106.8 ms), **9.35 MQueens/s @10M** (1069 ms)
  - `B black-magic` (plain fixed-shift lo/hi): **48.71 MQueens/s @1M** (20.5 ms), **48.96 MQueens/s @10M** (204 ms) — `bench/magic-tables/*.json` (MIT RecklessMagics, `sha256 eaa19d...`, uniform shift 11 baseline)
  - `C rescript-lohi` (TS stub + ReScript bs.js): **60.58 MQueens/s @1M**, **63.02 MQueens/s @10M** — ReScript toolchain not yet added, stub reports `skipped` with rationale in `bench/README.md` (+24% vs B, but language decision deferred)
  - `D bigint` (BigInt): **3.36 MQueens/s @1M**, **3.41 MQueens/s @10M** — **14.4× slower than B**, proves not hot-path viable (Scala.js precedent, `tc39/proposal-bigint#117`)
- **Gate (spec):** `B` must beat `A` by **≥30%** to win, else `HQ` fallback.
- **Result:** `B (+420.3% @1M, +423.5% @10M) → ✓ PASS → winner: `**`black-magic (plain fixed-shift lo/hi)`** per `specs/purechess-benchmarks`. **Previous synthetic baseline** (HQ stub at 148 MQueens/s) was **15.8× too fast** vs honest HQ (9.36) and has been replaced by the honest `hq.mjs` above. This is the correct bake-off result.
- **Encoding locked:** `{lo,hi}` manual pair (both `hq` and `black-magic` use it; `BigInt` ruled out per 14.4×). **Slider algorithm locked to Black Magic** — Phase 2 SHALL use Black Magic for `purechess` sliding attacks, with per-square `RecklessMagics` JSON (table-size optimization only, winner already decided).
- **Files:** `bench/results/sliding-2026-08-30.md` (honest 1M+10M tables + decision), `bench/candidates/hq.mjs` (now REAL), `bench/candidates/*`, `bench/magic-tables/*.json`

### `pgn-chess-tree` ownership-but-GPL-taint nuance

`pgn-chess-tree` (`github.com/anomalyco/pgn-chess-tree`) is **author-owned** but remains **AGPL-3.0 GPL-tainted** because it imports `chessops` (GPL-3.0-or-later) and lichess GPL helpers. Per ADR-001/010, the combined work is AGPL-3.0. Therefore:

- It lives in `refs/gpl-only/` (spec-agent only, gitignored via `refs/gpl-only/*` + `!README.md`), **never** copied into `src/` or `bench/candidates/` or `bench/magic-tables/` verbatim.
- Its optimizations (author's own `GameTree` shape, streaming chunking, variation/NAG handling) must be **re-specified** abstractly (PGN ABNF, `GameTree` node `{headers, moves:[{san,nags,comments,variations}]}`, chunked parser state machine) and **re-implemented clean-room** from that spec in Phase 2.
- No GPL text appears in `src/` (CI `rg -n "GPL" src/` must be empty). This appendix and `refs/gpl-only/README.md` document the taint.

### Phase 2 handoff

- **Phase 2 change** (`purechess-spec`, separate `openspec new change`, owned by **spec agent** with GPL-read allowed) will:
  1. Read `refs/gpl-only/` (`chessops@0.15.1`, Stockfish, `pgn-chess-tree`) + `refs/docs-refs/` (FIDE Laws 2023, Chess960 X-FEN/Shredder, python-chess/cm-pgn) and produce **language-neutral markdown specs**:
     - `purechess-rules` (FEN/SAN/UCI, castling truth tables, move legality per FIDE),
     - `purechess-board-movegen` (SquareSet `{lo,hi}` ops, slider magics, perft),
     - `purechess-pgn-fen` (PGN ABNF, streaming, FEN round-trip).
  2. Generate `bench/magic-tables/*.json` via MIT `RecklessMagics`/`magic-bits` (no GPL table copy) and check in JSON.
  3. No implementation — impl agent in follow-up change reads only `specs/` + `refs/mit-permissive/` + `refs/docs-refs/`.
- **This baseline (Phase 1):** No `purechess` implementation, no `src/` migration, no FEN/PGN grammar — only wall, harness, and bake-off wiring.
- **Verification:** `openspec status --change purechess-library --json` on 2026-08-30 shows `proposal:done`, `specs:done`, `design:done`, `tasks:done` (all planning artifacts done; implementation tasks 1.1–6.3 completed, see `tasks.md` checkboxes). Next step is `openspec archive`.

### Repro for this appendix

```bash
cat bench/results/sliding-2026-08-30.md
cat refs/gpl-only/README.md | grep -A2 "pgn-chess-tree"
cat refs/README.md | grep -A1 "pgn-chess-tree"
openspec status --change purechess-library --json | jq .artifacts
openspec validate purechess-library --strict --json
npm run typecheck
ls bench/*.mjs && ls bench/candidates/ && ls bench/magic-tables/ && shasum -a 256 bench/data/lichess_db.sample.pgn
```
