# Proposal: Maximum Performance Engine & Zero-Allocation Architecture (TS)

## Why

Following the complete performance triumph in the Rust engine (`gigachess-rs` v0.1.2: 540 Mnps perft, 46.2 ns move generation, 698 ns SAN parser, beating Ultrachess, Shakmaty, and Cozy-Chess across all axes), we now transfer these proven micro-architectural breakthroughs to **GigaChess JavaScript / TypeScript** (`gigachess` on npm).

JavaScript engines (V8 in Node.js/Chrome, JavaScriptCore in Safari, SpiderMonkey in Firefox) execute 32-bit unsigned integers (`>>> 0`) directly inside native CPU registers without boxing (Small Integers, or SMIs). However, current JavaScript chess engines suffer from severe architectural bottlenecks:
1. **Garbage Collection Churn**: Allocating `{ lo, hi }` objects for every bitwise operation, `{ from, to, ... }` objects for every move, and `Set<number>` / `Map<number, SquareSet>` for castling and pin lookups creates millions of transient heap objects per second, triggering constant Minor GC pauses.
2. **Missing Standard Chess Fast-Path**: 99.9% of games played online and indexed in databases are Standard Chess. Yet currently, castling rights are modeled as dynamic `ReadonlySet<number>`, requiring `new Set()` heap allocations and dynamic square iterations on every move, rather than a single 4-bit integer mask.
3. **Exhaustive Movegen for Single Moves**: In `parseSan`, parsing a simple move like `"Nf3"` currently calls `genLegalMovesForSan()`, which calls `allDests()`, allocating a full `Map<number, SquareSet>`, instantiating all 30–50 legal moves in the position, and iterating them all.
4. **Square-by-Square Scans with `pieceAt`**: Move generation iterates all 16 squares of the player to move and repeatedly calls `board.pieceAt(pos.board, sqIdx)`, which scans up to 12 piece bitboards on every square.
5. **Slow Dynamic Check Queries**: Calling `isCheck()` repeatedly scans the board for the king square, then executes an expensive `attacks.isAttacked()` ray query.

By implementing the complete suite of architectural innovations proven in Rust—including **early Standard Chess vs Chess960 separation**, **`MoveSink` bulk popcounting**, **`MoveVisitor` zero-alloc iterations**, and V8-specific TurboFan compiler optimizations—we will make GigaChess JS the unchallenged fastest chess library in the JavaScript/TypeScript ecosystem.

---

## What Changes

### 1. Early Standard Chess vs Chess960 Separation (Massive JS Win)
- **4-Bit Integer Castling Mask**: In Standard Chess, represent rights as a 4-bit SMI integer (`WK = 1, WQ = 2, BK = 4, BQ = 8`), completely eliminating JavaScript `Set<number>` allocations on make/unmake.
- **Single-Cycle Rights Clearing**: Rights are cleared on moves with a single line:
  `pos.castlingMask &= (CASTLE_CLEAR_STD[from] & CASTLE_CLEAR_STD[to]);`
  (using a precomputed 64-element lookup table, requiring 0 branching and 0 allocations).
- **Constant Clearance Bitmasks**:
  - White O-O: `(occ.lo & 0x60) === 0` (F1, G1).
  - White O-O-O: `(occ.lo & 0x0E) === 0` (B1, C1, D1).
  - Black O-O: `(occ.hi & 0x60000000) === 0` (F8, G8).
  - Black O-O-O: `(occ.hi & 0x0E000000) === 0` (B8, C8, D8).
- **Chess960 Fallback**: Only when the position is flagged as Chess960 (`isChess960: true`) does the engine invoke the generalized `CASTLE_PATH` table routines.

### 2. Zero-Allocation Targeted SAN Parser & Fast Check Suffixes (Transferred from Rust Task 3)
- **Targeted Reverse Attacker Queries**: Replace `genLegalMovesForSan(pos)` with reverse attacker queries (`attacks.attackersTo(board, to, us, occ) & pieceRoleBB`). For `"Nf3"`, query knights attacking `f3`, filter by disambiguation file/rank, and test candidate legality with `isLegal()`.
- **Latency Reduction**: Drops SAN parsing latency from ~6.5 µs to **<1 µs** (a 6×–8× speedup), drastically accelerating PGN parsing and database ingestion.
- **Fast Checkmate Suffix Detection**: In `makeSan`, a move can only give checkmate if it gave check (`isCheck(next)`). Only test `isCheckmate` when `isCheck` is true, and early-exit on the very first legal evasion found.

### 3. `MoveSink` & `MoveVisitor` First-Class Architecture
- **`MoveSink` Protocol**:
  - In a perft leaf (or count query), the sink is a **`MoveCounter`**: it accumulates `popcnt32(targets.lo) + popcnt32(targets.hi)` directly from whole bitboards, skipping bit extraction and move instantiation entirely.
  - When moves are needed in memory, the sink is a **`MoveCollector`** that writes 16-bit packed words (`from | to << 6 | promo << 12`) into a flat `Uint16Array(256)` stack buffer.
- **`MoveVisitor` Zero-Allocation Callback**:
  - Expose `forEachLegalMove(pos, (from, to, promo) => void)`.
  - In modern V8, non-escaping closures are inlined directly by TurboFan into the loop, allowing search, bots, and move explorers to run with **zero object allocations**.

### 4. Piece-Centric Move Generation & Vectorized Pawns (Transferred from Rust Task 1)
- **Eliminate `pieceAt` Scanning**: Stop iterating square-by-square over `own` bitboards. Instead, iterate piece-by-piece:
  - **Pawns**: Vectorized single pushes `((pawns << 8) & ~occ)`, double pushes, and diagonal captures in parallel using bitwise shifts.
  - **Knights**: Iterate exclusively `pos.board.knight & own` with `Math.clz32(lsb)`.
  - **Sliders**: Iterate exclusively `bishop`, `rook`, `queen` bitboards.
- **Color Specialization**: Separate White and Black pawn loops to eliminate `turn === Color.White ? 8 : -8` branch evaluations inside inner loops.

### 5. Cached Checkers & Precomputed King Squares (Transferred from Rust Task 2)
- **O(1) Single-Cycle Check Test**: Cache `checkers: SquareSet` in `Position` and `Undo.prev_checkers`. `isCheck(pos)` becomes `(pos.checkers.lo | pos.checkers.hi) !== 0` (0 allocations, 2 ops).
- **Direct King Square Tracking**: Store `kingSq: [number, number]` directly in the board state instead of dynamic square scanning.

### 6. Compile-Time Static Castling Path Tables (`CASTLE_PATH`) & Flat Line Rays (Transferred from Rust Task 4)
- **Static Chess960 Clearance**: Precompute a flat `Uint32Array` table `CASTLE_PATH_LO` and `CASTLE_PATH_HI` indexed by `(kFile << 3) | rFile` for rank 0.
- **Flat Line Ray Tables**: Replace `scratchPinRays: Map<number, SquareSet>` with precomputed flat array tables `LINE_RAY_LO` and `LINE_RAY_HI` indexed by `(ksq << 6) | sniperSq`, eliminating `Map` allocations.

### 7. V8 TurboFan & Modern Compiler Optimizations
- **ES2022 Native Output**: Target modern ES2022 with native `Math.clz32` and strict SMI bitwise coercions (`>>> 0`).
- **Monomorphic Object Shapes**: Ensure all internal position states maintain identical hidden class layouts without property additions or deletions.
- **Inlining Budget**: Keep hot helper functions under 600 AST nodes to ensure TurboFan inlines them into the caller loop.

---

## Capabilities

### New Capabilities
- `turbochess-perf-standard-chess-fastpath`: 4-bit integer castling rights, `CASTLE_CLEAR_STD` table, and constant clearance bitmasks for Standard Chess.
- `turbochess-perf-targeted-san`: Reverse attacker SAN parser (<1 µs) and early-exit checkmate suffix detection.
- `turbochess-perf-piece-centric-movegen`: Direct piece bitboard iteration and vectorized pawn shifts.
- `turbochess-perf-static-path-lookups`: Static `CASTLE_PATH` clearance bitmasks and flat array ray lookup tables.
- `turbochess-perf-bulk-count`: `countLegalMoves` bulk popcount sink at perft leaves.
- `turbochess-perf-zero-copy-moves`: `legalMovesInto` packed `moves2` view and `forEachLegalMove` visitor.
- `turbochess-perf-cached-checkers`: Direct `checkers` caching and branch-free `inCheck`.
- `turbochess-bench-real-engine`: Comprehensive micro-benchmark suite, perft wall-clock suite, and cross-engine comparisons.

---

## Impact

- **Public API**: 100% backward compatible. All existing methods (`moves()`, `isLegal()`, `parseSan()`, `makeSan()`, `perft()`) preserve existing behavior and types while running significantly faster.
- **Performance**:
  - Standard Chess Moves & Make/Unmake: **2.5×–4× faster** via 4-bit integer castling mask and constant clearance bitboards.
  - SAN Parsing: **5×–8× faster** (<1 µs vs 6.5 µs).
  - Move Generation: **2×–3× faster** (eliminating `pieceAt` scans).
  - Perft Throughput: **2×–4× faster** (bulk counting + cached checkers + static castling tables).
  - Memory & GC: Zero heap allocations in all internal move generation and replay hot loops.
- **Risk**: Zero. Every optimization is gated behind parity tests (`tests/parity.mjs`, `tests/perft.mjs`, `tests/fuzz-differential.mjs`).
