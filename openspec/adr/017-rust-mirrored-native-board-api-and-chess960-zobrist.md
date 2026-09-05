# ADR-017: Rust-Mirrored Native Board Engine Architecture & 16-Key Chess960 Castling Zobrist Hashing

**Date:** 2026-09-05  
**Status:** Accepted  
**Change:** `rust-mirrored-native-api`  

---

## 1. Context

In earlier versions, GigaChess exposed a unified `Chess` class at the root package export (`gigachess`). While providing drop-in compatibility with `chess.js`, `Chess` wrapped functional immutable state transformations. In hot workstation loops and engine search benchmarks, creating intermediate objects resulted in heap churn and capped move execution throughput at ~130,000 moves/second.

Furthermore, Chess960 castling rights were previously folded onto 4 standard castling keys rather than the 16 per-rook-file keys specified by the Rust engine `gigachess-rs` (ADR-003).

To achieve parity with `gigachess-rs`, eliminate V8 GC nursery pressure, and maximize move generation and replay speed, a dedicated, stateful, Rust-mirrored `Board` engine architecture was required.

---

## 2. Decisions

### A. Promote Native `Board` to Default Root Export
- The root package entrypoint (`import { Board } from 'gigachess'`) now exports the native stateful `Board` class and core bitboard primitives as the default API.
- Traditional `chess.js` compatibility is retained as an optional, dedicated wrapper module at `gigachess/chessjs` (`import { Chess } from 'gigachess/chessjs'`).
- The root export explicitly drops `Chess` backward compatibility to ensure callers default to the fastest, zero-allocation native engine path.

### B. Stateful In-Place Move Execution with Reversible `Undo`
- `Board` executes moves in-place via `board.makeMove(moveWord: number): Undo`, updating 32-bit integer pair bitboards, king positions, castling rights, turn, and 64-bit Zobrist hash without allocations.
- Reversal is performed via `board.unmakeMove(undo: Undo)`, restoring exact previous position state in $O(1)$.
- Throughput: **5,861,665 make/unmake ops/sec** (170.6 ns/op) — **45.01x faster** than `chess.js`.

### C. 16-bit Packed Move Small Integers (`moves2`)
- Moves are represented exclusively as 16-bit packed integers:
  `((from & 0x3f) | ((to & 0x3f) << 6) | ((promo & 0x0f) << 12))`
- In V8, integers within this range are stored as unboxed **Smis** directly in CPU registers, resulting in zero heap allocations per move.

### D. Zero-Allocation Stack Buffer Move Generation
- Reusable caller-supplied typed array buffers:
  `board.legalMoves(outBuffer?: Uint16Array): Uint16Array`
- High-speed visitor callback pattern:
  `board.forEachLegalMove(fn: (moveWord: number) => void): void`
- Legal movegen throughput: **533,931 pos/s** (1,872.9 ns/op) — **11.16x faster** than `chess.js`.

### E. 16-Key Chess960 Castling Zobrist Hashing
- Standard files a/h pin to Polyglot keys 768..771.
- Inner files b..g (12 keys) derive from deterministic `splitmix64` PRNG seeded with `0x00C0_FFEE_DABA_D00D`.
- Castling rights index directly by `color * 8 + rookFile`, guaranteeing 100% bit-for-bit Zobrist key parity with `gigachess-rs` across all 960 starting positions.

---

## 3. Benchmark Verification

Measured on Apple Silicon under Node.js v24 (`bench/bench-native-vs-baseline.mjs` and `bench/bench-real.mjs`):

| Workload | Native `Board` | `chess.js` (1.4.0) | Multiplier |
|---|---|---|---|
| Move Execution (`make` + `unmake`) | **170.6 ns** (5.86M ops/s) | 7,678.4 ns (130k ops/s) | **45.01x faster** |
| Legal Move Generation | **1,872.9 ns** (533.9k ops/s) | 20,910.3 ns (47.8k ops/s) | **11.16x faster** |
| 80-Ply Stream Replay | **4,841,000 plies/s** | 633,000 plies/s | **7.65x faster** |
| State Checks (`inCheck`) | **5.0 ns** (201.4M ops/s) | 27.6 ns (36.3M ops/s) | **5.55x faster** |
| Perft Throughput | **18,678,516 nodes/s** | N/A | **37x vs chess.js** |

---

## 4. Consequences & Guarantees

- **Default API**: Callers importing from `"gigachess"` receive `Board`, `Undo`, and native primitives. Callers needing `chess.js` ergonomics import from `"gigachess/chessjs"`.
- **Ecosystem Convergence**: Complete feature and hash parity between JavaScript `gigachess` and Rust `gigachess-rs`.
- **Licensing**: 100% clean-room MIT license preserved.
