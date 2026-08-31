## 1. Engine Purity & Performance Optimizations

- [ ] 1.1 Remove hardcoded `START_PERFT` startpos bypass in `src/chess.ts:788` and verify dynamic execution passes `tests/perft.mjs`
- [ ] 1.2 Optimize `makeSan` disambiguation in `src/san.ts` by reusing precomputed `CheckContext` across candidate pieces, and verify with `tests/parity.mjs`
- [ ] 1.3 Implement fast single-pass index-based FEN scanner in `src/fen.ts` (`parseFen`), verifying 100% round-trip parity on `samplefen1000.epd`
- [ ] 1.4 Inline 32-bit bitwise math in `src/attacks.ts` (`isAttacked`, `kingAttackers`, `attackersTo`) and optimize `popcnt32` with `Math.imul` in `src/squareSet.ts`

## 2. Zero-Alloc 64-bit Zobrist & 16-bit Packed Moves2

- [ ] 2.1 Implement `src/zobrist.ts` with `{ lo, hi }` 32-bit pairs and Polyglot/Shakmaty constants, wire incremental updating into `makeMove`, and verify with `tests/zobrist-parity.mjs`
- [ ] 2.2 Implement `src/packedMove.ts` (16-bit `packMove`/`unpackMove`, `toMoves2`/`fromMoves2`) and verify round-trip fuzzing with `tests/packed-moves.mjs`

## 3. Unified Root API & Export Aliasing

- [ ] 3.1 Implement the Unified `Chess` class in `src/index.ts` / `src/chess.ts` combining `chess.js` ergonomics with native `.toTree()`, `.zobrist()`, and `.toMoves2()` methods
- [ ] 3.2 Reconfigure `package.json` exports mapping `"./chessjs"` to `./dist/index.js`, delete `src/chessjs.ts`, and verify with `tests/chessjs-parity.mjs`
- [ ] 3.3 Expose integrated `buildTree` and `pgnImport` methods from `turbochess/chessops` and verify with `tests/compat-chessops.mjs` and `tests/chesstree-parity.mjs`

## 4. Workstation Benchmark Suite & Harness Fixes

- [ ] 4.1 Implement `bench/suites/blindbase-real.mjs` profiling repertoire build, reference tree streaming, Chessground dest formatting, and UCI-to-SAN stream
- [ ] 4.2 Add real-time progress indicators to `bench/suites/perft.mjs` and `bench/bench-real.mjs` to prevent perceived harness hangs
- [ ] 4.3 Update `package.json` license to `MIT` and verify repository URL metadata

## 5. Verification & Final Gate Checks

- [ ] 5.1 Run `npm run typecheck` and `npm test` verifying 0 errors across all unit, Zobrist, packed move, and parity tests
- [ ] 5.2 Run `node --expose-gc bench/bench-real.mjs` across all suites (including `blindbase-real`) verifying that all performance gates pass and speedups are measured
