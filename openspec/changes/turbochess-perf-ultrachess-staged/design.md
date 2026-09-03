## Context

GigaChess JavaScript / TypeScript is engineered for ultra-high-performance chess operations in modern web browsers, Node.js, Electron, and React applications. Following the complete performance win in our Rust sibling (`gigachess-rs`), this design codifies the architectural transfer of these micro-optimizations into TypeScript, specifically tuned for the V8 JIT compiler and modern JavaScript runtimes.

---

## Goals / Non-Goals

**Goals:**
- Deliver the fastest chess move generator, SAN parser, and perft engine in the JavaScript/TypeScript ecosystem.
- Achieve zero heap allocations in all internal move generation and replay hot loops.
- Maintain 100% backward compatibility with existing public APIs (`Chess`, `parseSan`, `makeSan`, `perft`, `allDests`).
- Maintain 100% permissive MIT licensing with zero GPL dependencies.
- Pass 100% of all differential fuzz tests and perft reference tests.

**Non-Goals:**
- Requiring WebAssembly (WASM) or native binaries. The engine remains 100% pure TypeScript/JavaScript running anywhere without CSP (`wasm-unsafe-eval`) restrictions.
- Reintroducing BigInt. We retain 32-bit unsigned integer pairs `{ lo: u32, hi: u32 }` which map directly to unboxed CPU registers in V8.

---

## Decisions

### D1: Real Benchmark Harness & Frozen Baseline
- **Decision:** Land `bench/bench-micro.mjs` (Criterion-style micro-benchmarks for FEN parse/write, movegen one-shot, make/unmake, isCheck, zobrist hash, SAN parse/render) and real wall-clock `bench/bench-perft.mjs`.
- **Baseline Freeze:** Record initial baseline numbers in `bench-results/gigachess-baseline.json` before merging optimizations.
- **Gating Band:** Require a median speedup with 0 regressions on identical inputs across 3 benchmark runs.

### D2: Zero-Allocation Targeted SAN Parser & Suffix Optimization
- **Decision:** Replace the brute-force `genLegalMovesForSan()` call in `parseSan()` with reverse attacker lookups:
  ```ts
  // 1. Identify destination square `to` and moving role `pieceRole`
  // 2. Query reverse attackers directly:
  const attackers = attacks.attackersTo(pos.board, to, pos.turn, pos.board.occupied);
  const candidatesBB = sq.and(attackers, board.pieces(pos.board, pieceRole));
  // 3. Filter by disambiguation file/rank if present
  // 4. Validate legality with lightweight isLegal(pos, candidateMove)
  ```
- **Suffix Fast-Path:** In `makeSan()`, only test `isCheckmate()` when `isCheck(next)` evaluates to true. When evaluating mate, immediately return false upon discovering the first legal evasion (king step or attacker block/capture).
- **Impact:** Reduces SAN parse latency from ~6.5 µs down to <1 µs (6×–8× speedup).

### D3: Piece-Centric Move Generation & Vectorized Pawn Shifts
- **Decision:** Eliminate square-by-square iteration over `own` bitboards in `allDests()` and `genLegalMoves()`. Generate moves piece-by-piece:
  - **Pawns:** Compute single pushes `((pawns << 8) & ~occ)`, double pushes from rank 2/7, and left/right diagonal captures in parallel using bitwise shifts.
  - **Knights:** Iterate directly over `pos.board.knight & own` using `Math.clz32(lsb)`.
  - **Sliders:** Iterate directly over `bishop & own`, `rook & own`, and `queen & own`.
  - **King:** Direct step attacks from cached `kingSq`.
- **Why:** Eliminates all `board.pieceAt()` calls in move generation, which previously scanned 6–12 piece bitboards on every occupied square.

### D4: Bulk Count Sink (`MoveSink` / `countLegalMoves`)
- **Decision:** Implement a dual-mode move generation architecture:
  - `generateLegalMoves(pos, ctx, sink: MoveSink)`
  - `MoveCounter`: Accumulates `popcnt32(lo) + popcnt32(hi)` directly from target bitboards at perft leaves (depth 1), bypassing move list construction and LSB bit extraction.
  - `MoveList`: Preallocated stack view collecting moves when the caller requires the list.
- **Impact:** Yields a 1.3×–1.8× speedup in perft throughput.

### D5: Zero-Copy 16-Bit Packed `moves2` & Visitor Callbacks
- **Decision:** Expose `legalMovesInto(pos, out: Uint16Array | Uint32Array): number` emitting 16-bit packed words:
  `word = from | (to << 6) | (promo << 12)`
  Provide a visitor callback `forEachLegalMove(pos, (from, to, promo) => void)` for internal search and tree building without creating `Move` objects.
- **Impact:** Eliminates GC pressure entirely during game replay and move tree exploration.

### D6: Cached Checkers & Direct King Square Tracking
- **Decision:** Store `checkers: SquareSet` in `Position` and `prev_checkers: SquareSet` in `Undo`. Maintain checkers incrementally across `makeMove()` / `unmakeMove()`.
- **Branchless `isCheck`:** `isCheck(pos)` becomes `(pos.checkers.lo | pos.checkers.hi) !== 0`, evaluating in 2 integer operations.
- **Cached King Square:** Store `kingSq: [number, number]` directly in the board state, eliminating dynamic `kingSquare()` bitboard scans.

### D7: Static Castling Path Clearance Bitmasks (`CASTLE_PATH`) & Flat Line Rays
- **Decision:** Precompute a flat `Uint32Array` table `CASTLE_PATH_LO` and `CASTLE_PATH_HI` of size 64 indexed by `(kFile << 3) | rFile` for rank 0.
- **Single-Cycle Castling Check:** Castling path clearance is verified with `((CASTLE_PATH_LO[idx] & occ.lo) | (CASTLE_PATH_HI[idx] & occ.hi)) === 0`.
- **Flat Line Ray Tables:** Precompute `LINE_RAY_LO` and `LINE_RAY_HI` indexed by `(ksq << 6) | sq`, replacing `scratchPinRays: Map<number, SquareSet>` with flat typed array lookups.

### D8: V8 TurboFan Compiler & Representation Optimizations
- **Decision:**
  - Enforce `>>> 0` unsigned 32-bit integer coercions on all bitwise operations to guarantee unboxed SMI register allocation in V8.
  - Maintain stable hidden classes (object shapes) for `Position` and `Board` structs without dynamic property injection or deletion.
  - Keep hot helper routines under 600 AST nodes to ensure TurboFan inlining.
  - Set `tsconfig.build.json` target to `ES2022` to emit modern native V8 opcodes (`Math.clz32`).

---

## Risks / Trade-offs

- **[Risk]** Adding `MoveSink` may add branching in move generation.
  - *Mitigation*: Monomorphize or inline the two paths: dedicated `countLegalMoves()` function for leaf bulk counting, and `generateLegalMovesInto()` for move collection.
- **[Risk]** Memory footprint of precomputed tables.
  - *Mitigation*: The `CASTLE_PATH` table is 64 × 8 bytes = 512 bytes; the flat `LINE_RAY` table is 4096 × 8 bytes = 32 KB. Both fit easily into L1/L2 CPU caches.
