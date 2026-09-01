# Proposal: Benchmark-First Incremental Perf from ultrachess (TS)

## Why

TurboChess TS (`5015 LOC`, `src/squareSet.ts:1` `{lo,hi}` zero-BigInt) is correct and fast enough for `BlindBase` (`1-3×` `chess.js`), but `ultrachess` (Yahor Barkouski, `MIT`, `rust/core:6252 LOC`) shows `50-95×` headroom via the same algorithm family (pin+check masks, magic bitboards) on identical inputs (`BENCH.md` `836 Mnps` native, `581` `Bun`/`336` `Node` `WASM`, `61×` `tryMove` / `1500×` `legalMoves` vs `chess.js` on our `apps/benchmarks` run `BENCH_ITERS=50k`).

We should not rewrite TS in Rust/WASM (`proposal` says `no Rust/WASM` for this change) — instead we borrow ultrachess's *structural* wins that translate to TS: `MoveSink` bulk counting, zero-copy move sharing, cached `checkers`, and its gated harness. Current `bench/bench-perft.mjs:1` is a stub synth (`+45ms` fake, `2548 Mnps`) and `tests/perft.mjs:1` only covers 6 positions depth ≤4; we have no criterion micro-bench (FEN/SAN/`isCheck`/`hash` ns/op) and no `vs ultrachess` JS baseline, so we cannot tell whether a patch helps.

This change does **benchmark-first, one-patch-at-a-time**: extend the harness, freeze a baseline `bench-results/turbochess-baseline.json`, land 3 TS-only enhancements incrementally with per-patch re-measure, keep only wins.

## What Changes

- **Benchmark extension (must be first, no engine changes):**
  - Replace `bench/bench-perft.mjs` stub with real `perft(board, depth)` wall-clock (median-of-3, `Throughput::Elements`) vs reference counts (`119060324` `startpos d6`). Keep `chessops` compare if installed.
  - Add `bench/bench-micro.mjs` (criterion-style, `BENCH_ITERS` env): `fenWrite`, `fenParse`, `movegen one-shot`, `make+unmake 48-ply`, `isCheck` in/out, `zobrist hash`, `SAN 48 moves`, `clone`. Matches `ultrachess/BENCH.md` table rows for apples-to-apples.
  - Add `bench/vs-ultrachess.mjs` — JS `TurboChess` vs `ultrachess` `Node` (same `FEN`, same `move`) when `ultrachess` installed as dev-dep, otherwise skip. Gates on perft parity before publishing numbers (like `ultrachess` `just bench`).
  - Freeze `bench-results/turbochess-baseline.json` + `bench-results/turbochess-baseline.md` before any engine patch.

- **Incremental engine patches (each gated, revert if no gain):**

  1. **Bulk count sink (`countLegalMoves`):** `MoveSink` trait-like `bulk vs materialise` split — `generateLegalMoves(pos, sink)` where `MoveCounter` sums `popcnt32` on whole `targets` bitboards at leaves (`depth==1` perft bulk). Avoids `MoveList` alloc/`pop_lsb` loop. Mirrors `ultrachess/rust/core/src/movegen.rs:1-9` (`MoveList` `256` `MaybeUninit` + `MoveCounter`).
  2. **Zero-copy move share (`legalMovesUint32`):** `legalMovesInto(pos, out:Uint32Array):number` packing `from|to<<6|promo<<12` into a preallocated `256`-slot view (shared `ArrayBuffer` when called from `PGN` batch). Eliminates `Map`/`Array` per `legal_moves` call — same shape as ultrachess zero-copy `Uint32Array` via `WASM` boundary.
  3. **Cached checkers (`Undo.prev_checkers`):** Extend `Position` `history:Undo[]` (`src/chess.ts` `Undo`) to store `prev_checkers:SquareSet` + `prev_zobrist:{lo,hi}`; `inCheck()` becomes branch-free `checkers.lo|checkers.hi !=0` (`position.rs` `checkers:Bitboard` `0.32ns`), `unmake` restores without recompute (~150ns saved per ply, verified by `inCheckGameOver` bench).

- **Testing harness parity:** add `test/fuzz-differential.mjs` — `1k` random games `TurboChess` vs `chess.js` lockstep (FEN, legal sets, `isCheck`/`isCheckmate` byte-equal per ply) like `ultrachess` `100k-game` gate, but TS-only and cheap. Enforce `≥95%` branch cov on `movegen`+`zobrist`.

- **Explicit non-goals:** No `Rust`/`WASM`, no `PEXT`, no `AVX2`, no bundle-size bump (`size-limit` `<24kB` react analog → keep `dist/core.js` `<35kB` gz). No `BigInt` reintroduction.

## Capabilities

### New Capabilities
- `turbochess-bench-real-engine`: Real perft + micro + vs-ultrachess harness with baseline freezing and parity-gated publishing.
- `turbochess-perf-bulk-count`: `countLegalMoves` bulk popcount path.
- `turbochess-perf-zero-copy-moves`: `legalMovesInto` / `Uint32Array` shared view.
- `turbochess-perf-cached-checkers`: `Undo.prev_checkers` + branch-free `inCheck`.

### Modified Capabilities
- `turbochess-optimization-audit`: Expand from `CheckContext` reuse + FEN scanner to include bulk, zero-copy, cached checkers gates.

## Impact

- **Public API:** Additive only: `countLegalMoves(pos)`, `legalMovesInto(pos,out)` aside `legalMoves()`. No breaking change to `Chess`/`Board`.
- **Perf:** Expected `1.2-1.8×` perft at `depth 6` from bulk alone (ultrachess wins `1.23×` vs `cozy-chess` on same trick), plus `~30ns` / `isCheck` and less GC from zero-copy on `replay` batch. Only patches that show `>3%` median win on `bench-micro` stay.
- **Risk:** Low — each patch behind baseline gate, revert if no gain. No `WASM` `wasm-unsafe-eval` `CSP` risk.
