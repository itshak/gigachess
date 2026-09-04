## 1. Benchmark Harness & Frozen Baseline

- [x] 1.1 Replace `bench/bench-perft.mjs` stub with real `perft(board,depth)` median-of-3 wall-clock vs `119060324` `startpos d6`, gate on `nodes == expected`
- [x] 1.2 Add `bench/bench-micro.mjs` (`BENCH_ITERS=200k` default, 3 passes median) for `fenWrite`, `fenParse`, `movegen one-shot`, `make+unmake 48-ply`, `isCheck`, `hash`, `SAN parse`, `SAN render`, `clone`
- [x] 1.3 Add `bench/vs-ultrachess.mjs` comparing TS engine vs `ultrachess` Node wrapper on identical positions
- [x] 1.4 Freeze `bench-results/gigachess-baseline.json` and `.md` report before engine modifications

## 2. Phase 1 — Standard Chess Fast-Path Separation

- [x] 2.1 Replace `ReadonlySet<number>` castling in Standard Chess with 4-bit integer mask (`WK=1, WQ=2, BK=4, BQ=8`)
- [x] 2.2 Implement `CASTLE_CLEAR_STD[64]` table lookup for instant rights clearing in `makeMove`/`unmakeMove`
- [x] 2.3 Implement constant bitmask clearance checks for Standard Chess (`0x60`, `0x0E`, `0x60000000`, `0x0E000000`), routing to `CASTLE_PATH` only when `isChess960 === true`
- [x] 2.4 Verify all unit tests and `tests/castling.mjs` pass cleanly

## 3. Phase 2 — Zero-Allocation Targeted SAN Parser & Suffix Fast-Path (Rust Task 3 Transfer)

- [x] 3.1 Refactor `parseSan` in `src/san.ts` to use reverse attacker lookups (`attacks.attackersTo & pieceRoleBB`) instead of calling `genLegalMovesForSan` and `allDests`
- [x] 3.2 Optimize checkmate suffix detection in `makeSan`: only evaluate mate when `isCheck(next)` is true, with early-exit on first legal evasion found
- [x] 3.3 Verify `tests/chessjs-parity.mjs` and verify SAN parse latency drops >4× (target <1.5 µs vs ~6.5 µs)

## 4. Phase 3 — Piece-Centric Movegen & Vectorized Pawn Shifts (Rust Task 1 Transfer)

- [x] 4.1 Replace square-by-square iteration over `own` bitboards with direct piece-centric iteration (`pawn`, `knight`, `bishop`, `rook`, `queen`, `king`)
- [x] 4.2 Vectorize pawn push and capture generation using parallel 32-bit bitwise shifts
- [x] 4.3 Monomorphize White and Black pawn push routines to eliminate `turn === White` branching
- [x] 4.4 Verify all unit tests and `tests/parity.mjs` pass cleanly

## 5. Phase 4 — Static Castling Path Tables & Flat Line Rays (Rust Task 4 Transfer)

- [x] 5.1 Define precomputed `CASTLE_PATH_LO` and `CASTLE_PATH_HI` tables for rank-0 castling clearance in Chess960
- [x] 5.2 Replace `scratchPinRays: Map<number, SquareSet>` with precomputed flat array tables `LINE_RAY_LO` and `LINE_RAY_HI`
- [x] 5.3 Verify Chess960 castling test suite (`tests/castling.mjs`) passes 100%

## 6. Phase 5 — `MoveSink` Bulk Counting & `MoveVisitor` Zero-Allocation Pattern

- [x] 6.1 Implement `MoveCounter` bulk popcount sink accumulating bitboards at perft leaf nodes (`depth == 1`)
- [x] 6.2 Add `countLegalMoves(pos): number` and integrate into `perft` leaf
- [x] 6.3 Implement `legalMovesInto(pos, out: Uint16Array | Uint32Array): number` emitting 16-bit packed `moves2` words (`from | (to << 6) | (promo << 12)`)
- [x] 6.4 Implement `forEachLegalMove(pos, (from, to, promo) => void)` visitor pattern

## 7. Phase 6 — Cached Checkers & Precomputed King Squares (Rust Task 2 Transfer)

- [x] 7.1 Store `checkers: SquareSet` in `Position` and `prev_checkers: SquareSet` in `Undo`, maintaining checkers across make/unmake
- [x] 7.2 Make `isCheck(pos)` branchless: `(pos.checkers.lo | pos.checkers.hi) !== 0`
- [x] 7.3 Store `kingSq: [number, number]` directly in the board state to eliminate dynamic `kingSquare` scans

## 8. Phase 7 — Hardening, Fuzz Differential Testing, Documentation & Archive

- [x] 8.1 Implement `tests/fuzz-differential.mjs` running 1,000 random game playouts in lockstep against `chess.js` and `chessops`
- [x] 8.2 Run full `bench/bench-micro.mjs` and `bench/bench-perft.mjs`, recording speedup delta table in `bench-results/gigachess-after.json`
- [x] 8.3 Update `README.md` benchmark and head-to-head comparison tables with verified post-optimization numbers and speedups
- [x] 8.4 Codify architectural decisions in `openspec/adr/014-maximum-performance-and-zero-allocation-architecture.md`
- [x] 8.5 Sync delta specs to main specifications (`openspec/specs/`)
- [x] 8.6 Run `npx openspec validate --changes`
- [x] 8.7 Archive completed change to `openspec/changes/archive/`
