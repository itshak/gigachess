## Context

GigaChess JavaScript / TypeScript is engineered for ultra-high-performance chess operations in modern web browsers, Node.js, Electron, and React applications. Following the complete performance win in our Rust sibling (`gigachess-rs`), this design codifies the architectural transfer of these micro-optimizations into TypeScript, specifically tuned for the V8 JIT compiler and modern JavaScript runtimes.

---

## Goals / Non-Goals

**Goals:**
- Deliver the fastest chess move generator, SAN parser, and perft engine in the JavaScript/TypeScript ecosystem.
- Implement early Standard Chess vs Chess960 fast-path separation, optimizing the 99.9% common case.
- Achieve zero heap allocations in all internal move generation and replay hot loops.
- Implement `MoveSink` bulk popcounting and `MoveVisitor` zero-allocation callback patterns.
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

### D2: Early Standard Chess vs Chess960 Fast-Path Separation
- **Decision:** Separate Standard Chess castling handling from Chess960 at the root of `Position`:
  - In Standard Chess, represent castling rights as a 4-bit integer mask (`WK = 1, WQ = 2, BK = 4, BQ = 8`), completely eliminating `ReadonlySet<number>` and `new Set()` allocations.
  - Rights updates on moves are executed via a single line:
    `pos.castlingMask &= (CASTLE_CLEAR_STD[from] & CASTLE_CLEAR_STD[to]);`
  - Clearance and transit checks use constant bitmasks:
    - White O-O: `(occ.lo & 0x60) === 0`
    - White O-O-O: `(occ.lo & 0x0E) === 0`
    - Black O-O: `(occ.hi & 0x60000000) === 0`
    - Black O-O-O: `(occ.hi & 0x0E000000) === 0`
  - When Chess960 is enabled (`isChess960 === true`), fall back to the generalized `CASTLE_PATH` lookup tables.
- **Impact:** Eliminates all `Set` object creations and dynamic file comparisons in 99.9% of games.

### D3: Zero-Allocation Targeted SAN Parser & Suffix Optimization
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

### D4: Piece-Centric Move Generation & Vectorized Pawn Shifts
- **Decision:** Eliminate square-by-square iteration over `own` bitboards in `allDests()` and `genLegalMoves()`. Generate moves piece-by-piece:
  - **Pawns:** Compute single pushes `((pawns << 8) & ~occ)`, double pushes from rank 2/7, and left/right diagonal captures in parallel using bitwise shifts.
  - **Knights:** Iterate directly over `pos.board.knight & own` using `Math.clz32(lsb)`.
  - **Sliders:** Iterate directly over `bishop & own`, `rook & own`, and `queen & own`.
  - **King:** Direct step attacks from cached `kingSq`.
  - **Color Specialization:** Monomorphic routines for White and Black pawns, avoiding `color === White ? 8 : -8` branches in loops.
- **Why:** Eliminates all `board.pieceAt()` calls in move generation, which previously scanned 6–12 piece bitboards on every occupied square.

### D5: `MoveSink` Bulk Popcounting & `MoveVisitor` Zero-Allocation Callbacks
- **Decision:** Implement a dual-mode move generation architecture:
  - `generateLegalMoves(pos, ctx, sink: MoveSink)`
  - **`MoveCounter` Sink**: Accumulates `popcnt32(lo) + popcnt32(hi)` directly from target bitboards at perft leaves (depth 1), bypassing move list construction and LSB bit extraction.
  - **`MoveCollector` Sink**: Writes 16-bit packed words (`from | to << 6 | promo << 12`) into a flat `Uint16Array(256)` stack buffer.
  - **`MoveVisitor`**: Expose `forEachLegalMove(pos, (from, to, promo) => void)` where V8 inlines non-escaping closures directly into the loop, allowing search and bot engines to run with zero allocations.
- **Impact:** Yields a 1.5×–2.5× speedup in perft throughput and eliminates GC pressure.

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
  - Keep hot helper routines under 600 AST nodes to ensure TurboFan inlines them directly into caller loops.
  - Set `tsconfig.build.json` target to `ES2022` to emit modern native V8 opcodes (`Math.clz32`).

---

## Risks / Trade-offs

- **[Risk]** Standard Chess fast path might desync with Chess960 if not tested uniformly.
  - *Mitigation*: Differential testing against `chess.js` for Standard Chess and `python-chess` / `shakmaty` for Chess960.
- **[Risk]** Adding `MoveSink` may add branching in move generation.
  - *Mitigation*: Dedicated `countLegalMoves()` function for leaf bulk counting, and `generateLegalMovesInto()` for move collection.
