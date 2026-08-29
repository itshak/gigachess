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
