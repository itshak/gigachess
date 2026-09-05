## 1. 16-Key Chess960 Castling Zobrist Implementation

- [x] 1.1 Implement splitmix64 PRNG seeded with `0x00C0_FFEE_DABA_D00D` in `src/zobrist.ts` to derive the 12 inner castling keys (files b..g) and construct the 16-key table (low and high 32-bit pairs for 16 keys), pinning files a/h to Polyglot keys 768..771.
- [x] 1.2 Update `castlingKeyIdx` and incremental castling Zobrist updates in `src/zobrist.ts` to index by `color * 8 + rookFile` and verify standard chess hashing remains bit-identical.
- [x] 1.3 Add Chess960 cross-language parity tests in `tests/zobrist-parity.mjs` asserting matching Zobrist keys between TypeScript `gigachess` and Rust `gigachess-rs`.

## 2. Stateful Native `Board` Engine Class

- [x] 2.1 Implement `Board` class in `src/board.ts` with in-place bitboard layout, `makeMove(moveWord: number): Undo`, and `unmakeMove(undo: Undo)` operating on 16-bit `moves2` integers.
- [x] 2.2 Implement zero-allocation `board.legalMoves(outBuffer?: Uint16Array): Uint16Array` and `board.forEachLegalMove(fn: (mv: number) => void)` directly writing 16-bit `moves2` integers.
- [x] 2.3 Expose direct 64-bit Zobrist getters (`zobristBigInt(): bigint`, `zobristLo: number`, `zobristHi: number`, `zobristHex(): string`) and instant `inCheck(): boolean` derived from cached checkers.
- [x] 2.4 Implement on-demand projections on `Board`: `toSan(moveWord)`, `toUci(moveWord)`, `toFen()`, `parseSan(san)`, and `parseUci(uci)`.

## 3. Thin `Chess` & `chessops` Facades and Package Exports

- [x] 3.1 Refactor `Chess` class in `src/chess.ts` to wrap an internal `Board` instance and delegate move validation and execution with zero rule duplication.
- [x] 3.2 Export `Board` and `Undo` from `src/index.ts` and `src/core.ts`.
- [x] 3.3 Verify package exports in `package.json` for `"."`, `"./core"`, `"./chessjs"`, and `"./chessops"`.

## 4. Verification and Comparative Benchmarks

- [x] 4.1 Run `npm run typecheck` and verify zero TypeScript compilation errors.
- [x] 4.2 Run `npm test` verifying all test suites (`perft`, `parity`, `chessjs-parity`, `chesstree-parity`, `zobrist-parity`, `packed-moves`, `zero-copy-moves`, `fuzz-differential`) pass 100%.
- [x] 4.3 Create a comparative benchmark harness (`bench/bench-native-vs-baseline.mjs`) measuring baseline `Chess` class vs native `Board` on identical workloads: legal move generation, in-place make/unmake, moves2 stream replay, and memory/GC heap allocations.
- [x] 4.4 Execute baseline vs new native API benchmarks before and after restructuring, documenting exact throughput multipliers and GC reductions in `bench-results/baseline-vs-native.md`.
