## Context

`gigachess` JS currently exposes `Chess` (the `chess.js` compatibility class) as its primary public interface. While the engine internally uses high-performance bitboards, consumer hot paths are slowed down by FEN/SAN string conversions, object cloning, and GC nursery pressure. 

Furthermore, `gigachess-rs` (Rust) implemented ADR-003, introducing 16 per-rook-file castling Zobrist keys (`color * 8 + file`) for Chess960 with a published deterministic `splitmix64` PRNG seed (`0x00C0_FFEE_DABA_D00D`), whereas JS `src/zobrist.ts` still folded Chess960 rights onto the 4 standard keys (`768..771`).

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Implement a stateful, high-performance `Board` class in `src/board.ts` mirroring `gigachess::Board` in Rust.
- Establish the 16-bit `moves2` integer (`word: number`, V8 Smi) as the primary currency for move execution and generation.
- Implement in-place `makeMove(moveWord: number): Undo` and `unmakeMove(undo: Undo)` to eliminate board object cloning in hot loops.
- Expose zero-allocation legal move generation into a caller-supplied `Uint16Array(256)` via `board.legalMoves(buf)`.
- Update `src/zobrist.ts` to implement the 16 rook-file Chess960 castling keys, guaranteeing 100% bit-for-bit Zobrist parity between Rust and JS.
- Refactor `Chess` into a thin facade over `Board`, ensuring 100% backward compatibility for all existing tests and consumers.

**Non-Goals:**
- Deprecating or breaking the `chess.js` or `chessops` API facades.
- Altering Standard Chess Polyglot Zobrist hashes (standard positions with rooks on a/h remain 100% bit-identical to the canonical Polyglot vector `0x463b96181691fc9c`).

## Decisions

### 1. Stateful In-Place `Board` with Lightweight `Undo`
- **Choice**: Design `Board` as a stateful class with mutable internal bitboards and an `Undo` object structure for unmaking moves.
- **Rationale**: In V8, cloning an immutable `Position` allocates multiple objects (`{ board, turn, castling, checkers, ... }`). In-place mutation with bitwise updates and an unmake stack allows the engine to run perft, game replays, and tree searches in register/Smi space at over 600,000 moves/second.
- **Alternatives Considered**: Keeping pure functional `Position` objects. Rejected because garbage collection pauses degrade UI frame rates and tree build throughput in large database applications.

### 2. 16-bit `moves2` Integers as Primary Move Type
- **Choice**: Moves are represented as unsigned 16-bit numbers `(from & 0x3f) | ((to & 0x3f) << 6) | ((promo & 0x0f) << 12)`.
- **Rationale**: Numbers in the range $0 \le w \le 65535$ are guaranteed to be represented as V8 **Smis (Small Integers)**. Smis reside directly in CPU registers or on the call stack and incur zero heap allocations.
- **Castling Convention**: Both standard and Chess960 castling encode as king-square $\to$ rook-square (`e1h1`, `e1a1`, etc.), perfectly matching `gigachess-rs` and UCI-960.

### 3. 16 Rook-File Castling Zobrist Keys for Chess960 (Rust ADR-003 Parity)
- **Choice**: Compute 16 castling keys indexed by `color * 8 + file` (Black = 0, White = 1, file = 0..7). Standard files a (file 0) and h (file 7) pin to Polyglot keys 768..771. The 12 inner keys (files b..g) are derived at module initialization using `splitmix64` seeded with `0x00C0_FFEE_DABA_D00D`.
- **Rationale**: Eliminates hash collisions in Chess960 where two positions differ only by which rook holds castling rights, while guaranteeing 100% cross-language hash parity with `gigachess-rs`.

### 4. Thin `Chess` and `chessops` Facades
- **Choice**: The existing `Chess` class wraps an internal `Board` and translates string inputs/outputs on demand.
- **Rationale**: Eliminates rule duplication across facades. All existing tests (`tests/chessjs-parity.mjs`, `tests/fuzz-differential.mjs`) continue to pass without code changes in external apps.

### 5. Before-and-After Comparative Benchmarking
- **Choice**: Implement a dedicated comparative harness `bench/bench-native-vs-baseline.mjs` comparing the baseline `Chess` class against the new `Board` API on identical workloads (perft, game replay, movegen, and memory allocation profiling with `--expose-gc`).
- **Rationale**: Provides empirical proof of latency reductions and GC pressure elimination, publishing results to `bench-results/baseline-vs-native.md`.

## Risks / Trade-offs

- **[Risk] State corruption if `Undo` is modified or reused incorrectly** → *Mitigation*: Provide pure `clone()` on `Board` for snapshotting state when callers do not want to manage an `Undo` stack.
- **[Risk] Chess960 hash mismatch across language boundaries** → *Mitigation*: Add cross-engine parity test vectors verifying standard and Chess960 Zobrist hashes against `gigachess-rs` test cases.
