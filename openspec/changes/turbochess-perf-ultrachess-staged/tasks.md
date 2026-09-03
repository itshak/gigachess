## 1. Benchmark Harness & Frozen Baseline

- [x] 1.1 Replace `bench/bench-perft.mjs` stub with real `perft(board,depth)` median-of-3 wall-clock vs `119060324` `startpos d6`, gate on `nodes == expected`
- [ ] 1.2 Add `bench/bench-micro.mjs` (`BENCH_ITERS=200k` default, 3 passes median) for `fenWrite`, `fenParse`, `movegen one-shot`, `make+unmake 48-ply`, `isCheck`, `hash`, `SAN parse`, `SAN render`, `clone`
- [ ] 1.3 Add `bench/vs-ultrachess.mjs` comparing TS engine vs `ultrachess` Node wrapper on identical positions
- [ ] 1.4 Freeze `bench-results/gigachess-baseline.json` and `.md` report before engine modifications

## 2. Phase 1 — Zero-Allocation Targeted SAN Parser & Suffix Fast-Path (Rust Task 3 Transfer)

- [ ] 2.1 Refactor `parseSan` in `src/san.ts` to use reverse attacker lookups (`attacks.attackersTo & pieceRoleBB`) instead of calling `genLegalMovesForSan` and `allDests`
- [ ] 2.2 Optimize checkmate suffix detection in `makeSan`: only evaluate mate when `isCheck(next)` is true, with early-exit on first legal evasion found
- [ ] 2.3 Verify `tests/san_parity.mjs` and run `bench-micro`: verify SAN parse latency drops >4× (target <1.5 µs vs ~6.5 µs)

## 3. Phase 2 — Piece-Centric Movegen & Vectorized Pawn Shifts (Rust Task 1 Transfer)

- [ ] 3.1 Replace square-by-square iteration over `own` bitboards with direct piece-centric iteration (`pawn`, `knight`, `bishop`, `rook`, `queen`, `king`)
- [ ] 3.2 Vectorize pawn push and capture generation using parallel 32-bit bitwise shifts
- [ ] 3.3 Verify all unit tests and `tests/parity.mjs` pass cleanly with zero regressions

## 4. Phase 3 — Static Castling Path Tables & Flat Line Rays (Rust Task 4 Transfer)

- [ ] 4.1 Define precomputed `CASTLE_PATH_LO` and `CASTLE_PATH_HI` tables for rank-0 castling clearance, replacing dynamic square iteration
- [ ] 4.2 Replace `scratchPinRays: Map<number, SquareSet>` with precomputed flat array tables `LINE_RAY_LO` and `LINE_RAY_HI`
- [ ] 4.3 Verify Chess960 castling test suite (`tests/castling.mjs`) passes 100%

## 5. Phase 4 — Bulk Count Sink & Zero-Copy 16-Bit Packed Moves

- [ ] 5.1 Implement `MoveCounter` bulk popcount sink accumulating bitboards at perft leaf nodes (`depth == 1`)
- [ ] 5.2 Add `countLegalMoves(pos): number` and integrate into `perft` leaf
- [ ] 5.3 Implement `legalMovesInto(pos, out: Uint16Array | Uint32Array): number` emitting 16-bit packed `moves2` words (`from | (to << 6) | (promo << 12)`)
- [ ] 5.4 Implement `forEachLegalMove(pos, callback)` visitor pattern

## 6. Phase 5 — Cached Checkers & Precomputed King Squares (Rust Task 2 Transfer)

- [ ] 6.1 Store `checkers: SquareSet` in `Position` and `prev_checkers: SquareSet` in `Undo`, maintaining checkers across make/unmake
- [ ] 6.2 Make `isCheck(pos)` branchless: `(pos.checkers.lo | pos.checkers.hi) !== 0`
- [ ] 6.3 Store `kingSq: [number, number]` directly in the board state to eliminate dynamic `kingSquare` scans

## 7. Phase 6 — Hardening, Fuzz Differential Testing & Archive

- [ ] 7.1 Implement `tests/fuzz-differential.mjs` running 1,000 random game playouts in lockstep against `chess.js` and `chessops`
- [ ] 7.2 Run full `bench/bench-micro.mjs` and `bench/bench-perft.mjs`, recording speedup delta table in `bench-results/gigachess-after.json`
- [ ] 7.3 Run `npx openspec validate --changes`
