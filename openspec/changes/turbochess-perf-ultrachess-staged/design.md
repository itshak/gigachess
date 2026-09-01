## Context

TurboChess TS is the fast MIT engine for `BlindBase` and the `turbochessboard` board. `ultrachess` (Rust ` mitigation`) is the same algorithm family but `50-95×` faster via native `u64` and bulk tricks. This change borrows only structural ideas that survive `TS` `u32×2` pair translation, benchmark-first.

## Goals / Non-Goals

**Goals:**
- Real harness before any engine edit, with frozen baseline.
- Three incremental TS-only wins, each measured alone, merged only if `>3%` median win.
- Keep `MIT`, `no WASM`, `no PEXT`, `dist <35kB gz`, `95%` cov.

**Non-Goals:**
- `Rust`/`WASM` integration (deferred).
- `cozy-chess` `19ns` `movegen` one-shot or `1.7ns` `clone` — those trade-offs (arena) are not TS wins.

## Decisions

### D1: Harness First, Baseline Frozen

- **Decision:** Land `bench/bench-perft.mjs` real + `bench/bench-micro.mjs` + `bench/vs-ultrachess.mjs` in one PR, run `BENCH_ITERS=200k` `node bench/bench-micro.mjs` and `node bench/bench-perft.mjs --depth 6` on `M-series` `Node 24`, write `bench-results/turbochess-baseline.json` + `.md` (like `ultrachess/BENCH.md` gate). Every later engine PR rebases and diffs vs baseline with `±3%` noise band.
- **Why:** Current stub reports `2548 Mnps` (synth `+45ms`) while `tests/perft.mjs` shows `~6.8 Mnps` `d4` — numbers disagree, cannot gate.
- **Rejected:** Borrowing `ultrachess` `just bench` directly — Rust `criterion` not applicable to `u32×2`.

### D2: Bulk Count Sink

- **Decision:** Introduce `MoveSink` interface (`push_targets(from, mask)` / `push_pawn_targets_offset` / `push_one`) like `movegen.rs`. `generateLegalMoves(pos, ctx, sink)` bulk-emits bitboards. `MoveCounter` sink sums `popcnt32(lo)+popcnt32(hi)` without `Move` allocation. `perft` at `depth==1` uses counter path (ultrachess `BENCH.md` geomean `1.23×` vs `cozy-chess` comes from this).
- **TS mapping:** `popcnt32` already `Math.imul` (`squareSet.ts:190`); reuse. `MoveList` stays `ArrayVec<Move,256>`-like `Array<Move>` prealloc `256` with `len` gate, but bulk path bypasses it.

### D3: Zero-Copy Move Share

- **Decision:** `legalMovesInto(pos, out:Uint32Array|Uint16Array):number` returns count, writes `packed = from | to<<6 | promo<<12` into caller buffer (256 slots). `PGN` batch `replay` allocates one `Uint32Array(256*batchSize)` and slices, instead of `Map` per `legal_moves` (`turbochess/BENCH.md` `replay` hot).
- **Why:** Mirrors ultrachess `shared Uint32Array` over `WASM` memory (`README.md` zero-copy). In `TS` the win is GC avoidance, not FFI.

### D4: Cached Checkers

- **Decision:** `Undo { captured, prev_castling, prev_ep, prev_halfmove, prev_zobrist:{lo,hi}, prev_checkers:SquareSet }` (`position.rs:Undo`). `Position.checkers:SquareSet` maintained in `make`/`unmake`; `inCheck()` is `checkers.lo|checkers.hi!==0` (`0.32ns` ultrachess vs `2ns` `shakmaty`). `zobrist` already `O(1)`, this fixes `inCheck` recompute (~20-100ns).
- **Trade-off:** `+8B` per history entry (two `u32`), negligible vs `Vec<Undo>` already bounded by `50-move` rule.

### D5: Incremental Gating

- **Decision:** Land D2, then D3, then D4 each as separate commit, each runs `bench-micro` + `bench-perft` median-of-3, require `>3%` win and `perft` parity (`tests/perft.mjs` all `PASS`) to keep. Revert otherwise. No squashing.

## Risks / Trade-offs

- **[Risk]** `D2` bulk adds branching in `movegen` hot path — may regress non-bulk `legal_moves` (caller wants list).
  - **Mitigation:** Keep original `legal_moves` path calling `MoveList` sink; bulk only for `count`/`perft` leaf.
- **[Risk]** Baseline freeze ties CI to one host (`M4 Max` reference).
  - **Mitigation:** Publish `±3%` band, not absolute `Mnps`; CI gates on regression vs baseline median, not on `ultrachess` absolute.

## Open Questions

- Keep `BENCH_ITERS=200k` vs `500k` for `TS` noise? `ultrachess` uses `200k` + `3 passes` median — match.
