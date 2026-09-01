## 1. Benchmark Extension (MUST be first, no engine changes)

- [ ] 1.1 Replace `bench/bench-perft.mjs` stub ( synth `+45ms`) with real `perft(board,depth)` median-of-3 `Throughput::Elements` vs `119060324` `startpos d6`, keep optional `chessops` compare, gate on `nodes == expected` or exit non-zero
- [ ] 1.2 Add `bench/bench-micro.mjs` (`BENCH_ITERS=200k` default, 3 passes median) for `fenWrite`, `fenParse`, `movegen one-shot`, `make+unmake 48-ply`, `isCheck in/out`, `hash`, `SAN 48`, `clone` with `ns/op` table matching `ultrachess/BENCH.md` rows, write `bench-results/micro-baseline.json`
- [ ] 1.3 Add `bench/vs-ultrachess.mjs` (optional `ultrachess` dev-dep): same `FEN`+`move` for `tryMove`, `legalMoves`, `hash` `ns/op` vs `ultrachess` `Node`, skip if not installed, gate on perft parity before publishing
- [ ] 1.4 Run all three: `BENCH_ITERS=200k node bench/bench-micro.mjs`, `node bench/bench-perft.mjs --depth 6`, `node bench/vs-ultrachess.mjs` on `M-series` `Node 24`, freeze `bench-results/turbochess-baseline.json` + `.md` baseline tag, verify `npm run typecheck && npm test` green
- [ ] 1.5 `openspec validate --change turbochess-perf-ultrachess-staged` green

## 2. Patch 1 — Bulk Count Sink (`countLegalMoves`)

- [ ] 2.1 Introduce `MoveSink` (`push_targets`, `push_pawn_targets_offset`, `push_one`) and `MoveCounter`/`MoveList` sinks in `src/movegen.ts` style, split `generateLegalMoves(pos,ctx,sink)` bulk; keep `legalMoves()` path via `MoveList`
- [ ] 2.2 Add `countLegalMoves(pos):number` using `MoveCounter` (popcnt `lo+hi`), wire `perft` leaf `depth==1` to bulk path
- [ ] 2.3 Verify `tests/perft.mjs` `ALL PASS` (6 positions depth 6/7 `position 3`) and `node bench/bench-perft.mjs --depth 6` shows `>3%` `Mnps` vs baseline median; if not, revert
- [ ] 2.4 Run `node bench/bench-micro.mjs` — `movegen one-shot` must not regress for `list` path; keep only if `perft` wins

## 3. Patch 2 — Zero-Copy Move Share

- [ ] 3.1 Add `legalMovesInto(pos, out:Uint32Array):number` packing `from|to<<6|promo<<12` (`src/packedMove.ts` wire), `0` alloc, `256` cap
- [ ] 3.2 Refactor `blind-base` batch `replay` style loop to use shared `Uint32Array(256*batch)` slicing, remove per-game `Map`
- [ ] 3.3 Verify heap `MB` per `replay` batch drops `>10%` vs baseline and `movegen one-shot` `ns/op` not regressed; else revert

## 4. Patch 3 — Cached Checkers (`Undo.prev_checkers`)

- [ ] 4.1 Extend `src/chess.ts` `Undo` with `prev_checkers:SquareSet` + `prev_zobrist:{lo,hi}`, maintain `Position.checkers` in `make`/`unmake`, make `isCheck()` branch-free `lo|hi!==0`
- [ ] 4.2 Verify `position 3` `en-passant discovered-check` still correct, `tests/perft.mjs` parity, and `bench-micro` `isCheck` `ns/op` drops `>10%` and `make+unmake` not regressed; else revert

## 5. Hardening & Archive

- [ ] 5.1 Add `test/fuzz-differential.mjs` `1k` random games vs `chess.js` lockstep `FEN`+`legal`+`isCheck` per ply, enforce `≥95%` branch cov on `movegen`+`zobrist` (like `ultrachess` `TESTING.md` `just test`)
- [ ] 5.2 Re-run full `bench/bench-micro.mjs` + `bench/bench-perft.mjs --depth 6` + `vs-ultrachess` after all kept patches, update `bench-results/turbochess-after.json`, publish `%` vs baseline `md` table
- [ ] 5.3 `npm run typecheck && npm test && node bench/bench-perft.mjs --depth 5` green, `openspec validate` green, `openspec archive turbochess-perf-ultrachess-staged` with `BENCH.md` update
