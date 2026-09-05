<p align="center">
  <img src="./assets/logo.png" width="220" alt="GigaChess Logo" />
</p>

<h1 align="center">GigaChess</h1>

<p align="center">
  <strong>The fastest chess engine and library in JavaScript & TypeScript.</strong><br>
  Featuring a high-performance native Rust-mirrored <code>Board</code> API with <strong>45x faster move execution</strong> (5.9M ops/s), 
  <strong>11x faster legal movegen</strong>, <strong>18.7M nodes/s perft throughput</strong>, zero-alloc Zobrist hashing, 
  and optional drop-in wrappers for <code>chess.js</code> and <code>chessops</code>.
</p>

<p align="center">
  <a href="https://github.com/itshak/gigachess/actions/workflows/ci.yml"><img src="https://github.com/itshak/gigachess/actions/workflows/ci.yml/badge.svg" alt="CI Status"></a>
  <a href="https://www.npmjs.com/package/gigachess"><img src="https://img.shields.io/npm/v/gigachess?style=flat-square&color=blue" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/gigachess"><img src="https://img.shields.io/bundlephobia/minzip/gigachess?style=flat-square&color=emerald" alt="bundle size"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-Strict-blue?style=flat-square" alt="TypeScript"></a>
</p>

---

<p align="center">
  <img src="./assets/social-preview.png" width="100%" alt="GigaChess Social Preview" />
</p>

> 🦀 **Looking for maximum native backend performance?** Check out [**`gigachess` (Rust)**](https://github.com/itshak/gigachess-rs) — the fastest chess move generator in Rust, featuring 540M nodes/sec perft throughput, hardware PEXT / Fancy Magic bitboards, 16-bit binary replay (1.4M games/sec), and zero heap allocations for high-throughput chess services, database indexing, and search engines. Available on [crates.io](https://crates.io/crates/gigachess).

---

## ⚡ Why GigaChess?

Traditional JavaScript chess libraries forced developers to accept severe compromises:
1. **`chess.js`**: Intuitive API, but slow: string allocations on every move, array-based board scans, no bitboards, and no variation trees.
2. **`chessops`**: Fast bitboards, but restrictive GPL licensing, functional-only syntax without a single stateful class, and no variation trees or transposition hashing.

**GigaChess eliminates these compromises.**
- 🚀 **45x Faster Move Execution than `chess.js`**: In-place stateful `Board` with `makeMove`/`unmakeMove` executing at over **5.98 Million moves/sec** (167.0 ns/op).
- ⚡ **11x Faster Legal Movegen than `chess.js`**: Zero-allocation packed buffer generation (`board.legalMoves(buffer)`) at **541,200 pos/s** (1,848 ns/op).
- 🏎️ **18.7M nodes/s Perft Throughput**: 1.88x faster than `chessops` and **37x faster than `chess.js`**.
- 🔄 **Optional Compatibility Wrappers**: Dedicated drop-in wrappers for `chess.js` (`gigachess/chessjs`) and `chessops` (`gigachess/chessops`).
- 🔑 **Instant $O(1)$ 64-bit Polyglot Zobrist Hashing**: Zero-BigInt `{lo, hi}` hash updated incrementally via bitwise XORs. Standard Polyglot startpos parity (`0x463b96181691fc9c`) and 16-key Chess960 castling scheme matching `gigachess-rs`.
- 📦 **16-bit Packed Move Streams (`moves2`)**: Replay 80-ply games from a compact 160-byte binary buffer at **4.84 Million plies/sec**.
- 🌳 **Built-in `chesstree` Variation Trees**: Interactive study tree navigation, comments, glyphs, and PGN export.
- 📜 **100% Permissive MIT License**: Completely free for commercial and proprietary software.

---

## 📊 Benchmark Comparison

### 1. Native `Board` vs `chess.js` Baseline

Direct microbenchmark comparison measured under Node.js v24 on Apple Silicon (`bench/bench-native-vs-baseline.mjs`):

| Metric / Workload | 🚀 **GigaChess (`Board`)** | 📦 **`chess.js`** (1.4.0) | Speedup Advantage |
|---|---|---|---|
| **Move Execution (`make` + `unmake`)** | **167.0 ns / op** (5,986,400 ops/s) | 7,434.1 ns / op (134,500 ops/s) | **44.50x faster (+4,350%)** |
| **Legal Move Generation** | **1,847.7 ns / op** (541,200 ops/s) | 20,341.3 ns / op (49,200 ops/s) | **11.01x faster (+1,001%)** |
| **80-Ply Game Stream Replay** | **4,803,000 plies/s** | 649,000 plies/s | **7.40x faster (+640%)** |
| **Game State Query (`isCheck` / `inCheck`)** | **4.9 ns / op** (203,390,000 ops/s) | 26.3 ns / op (38,080,000 ops/s) | **5.34x faster (+434%)** |
| **Memory Footprint (80-Ply Game)** | **160 Bytes** (`Uint16Array`) | ~4,200 Bytes (Object Graph) | **26.2x less memory** |

---

### 2. Real-World Benchmarks vs chessops & chess.js (24 Gates Verified)

Full real-world benchmark suites (`node --expose-gc bench/bench-real.mjs`):

| Workload | 🚀 **GigaChess** | ♟️ **`chessops`** (0.15.1) | 📦 **`chess.js`** (1.4.0) | GigaChess vs Baselines |
|---|---|---|---|---|
| **License** | ✅ **100% MIT** | ❌ **GPL-3.0** | ✅ **BSD-2-Clause** | **Permissive for commercial use** |
| **Perft Movegen Throughput** | **18,678,516 nodes/s** | 9,930,000 nodes/s | ❌ *(No perft API)* | **1.88x vs chessops \| 37x vs chess.js** |
| **Sliding Attacks (Black Magic)** | **25.1 MAttacks/s** | 9.3 MAttacks/s | N/A *(Array scan)* | **2.69x faster (+169%)** |
| **PGN Streaming Throughput** | **128,701 games/s** (89 MB/s) | 46,296 games/s (32 MB/s) | 3,634 games/s (2.5 MB/s) | **2.78x vs chessops \| 35x vs chess.js** |
| **Chessground UI Dests** | **215,585 pos/s** | 58,100 pos/s | N/A | **3.71x faster (+271%)** |
| **FEN Parse + Make** | **458,961 ops/s** | 188,473 ops/s | 91,214 ops/s | **2.43x vs chessops \| 5.03x vs chess.js** |
| **SAN Make + Legal Dests** | **49,444 ops/s** | 18,200 ops/s | 6,992 ops/s | **2.72x vs chessops \| 7.07x vs chess.js** |
| **Repertoire Tree Build** | **3,737 games/s** | 2,160 games/s | ❌ *(No Tree API)* | **1.73x faster (+73%)** |
| **Polyglot Zobrist Hash ($O(1)$)** | ✅ **Native (`{lo,hi}`)** | ❌ None | ❌ None | **Bit-for-bit with gigachess-rs** |

---

## 🛠️ Installation

```bash
npm install gigachess
```

---

## 🔄 Migration Guide

### 1. Migrating from `chess.js`

> [!NOTE]
> **Default API Update in GigaChess v0.3+**: The default package root (`import { Board } from 'gigachess'`) now exports the high-performance native Rust-mirrored `Board` engine. The traditional `chess.js`-style mutable class is available via `gigachess/chessjs`.

#### Option A: 1-Line Drop-in Compatibility Wrapper (`gigachess/chessjs`)
If you have an existing codebase built around `chess.js` and want an instant upgrade with zero code changes, simply point your import to `gigachess/chessjs`:

```ts
// Before:
// import { Chess } from 'chess.js';

// After (1-line change):
import { Chess } from 'gigachess/chessjs';

const chess = new Chess();
chess.move('e4');
chess.move('e5');
console.log(chess.fen());     // 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
console.log(chess.history()); // ['e4', 'e5']
```

#### Option B: Upgrade to Native `Board` for 45x Speedup
For maximum speed, switch from `Chess` to the native `Board` API. It uses in-place mutation, 16-bit packed moves, and zero heap allocations:

```ts
import { Board, packMove, unpackMove } from 'gigachess';

// Initialize starting position
const board = new Board(); // or Board.fromFen(fen)

// Parse SAN into a 16-bit packed move and execute in-place (170 ns)
const move = board.parseSan('e4');
const undo = board.makeMove(move);

console.log(board.toFen());  // 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
console.log(board.inCheck()); // false

// Instant reversible unmake
board.unmakeMove(undo);
console.log(board.toFen());  // startpos restored
```

---

### 2. Migrating from `chessops`

GigaChess provides a 100% clean-room MIT replacement module mirroring `chessops`:

```ts
// Before:
// import { Chess } from 'chessops/chess';
// import { parseFen } from 'chessops/fen';

// After:
import { Chess } from 'gigachess/chessops/chess';
import { parseFen } from 'gigachess/chessops/fen';
```

---

## 💡 Native `Board` API Reference

### 1. Move Execution & Unmaking
```ts
import { Board } from 'gigachess';

const board = new Board();

// Parse and make moves
const m1 = board.parseSan('e4');
const undo1 = board.makeMove(m1);

const m2 = board.parseSan('e5');
const undo2 = board.makeMove(m2);

// Fast status queries
console.log('Is in check:', board.inCheck());
console.log('Turn:', board.turn); // 0 = White, 1 = Black

// Reversible undo
board.unmakeMove(undo2);
board.unmakeMove(undo1);
```

### 2. Zero-Allocation Move Generation
```ts
import { Board } from 'gigachess';

const board = new Board();

// Fast iteration without allocating an array
board.forEachLegalMove((move) => {
  // move is a 16-bit packed integer (Smi)
  console.log(board.toSan(move));
});

// Or write directly into a reusable Uint16Array buffer:
const buffer = new Uint16Array(256);
const count = board.legalMoves(buffer);
console.log(`Generated ${count} legal moves without heap allocations`);
```

### 3. $O(1)$ 64-bit Polyglot Zobrist Hashing
GigaChess computes Polyglot-compliant 64-bit Zobrist keys incrementally during `makeMove` / `unmakeMove`:
- **Standard Chess**: Pins to Polyglot keys `0..780`, verifying startpos hash `0x463b96181691fc9c`.
- **Chess960**: 16 per-rook-file castling keys (`color * 8 + file`). Standard files a/h pin to Polyglot 768..771; files b..g derive via deterministic `splitmix64` seeded with `0x00C0_FFEE_DABA_D00D` matching `gigachess-rs` (ADR-003).

```ts
import { Board } from 'gigachess';

const board = new Board();
const key = board.zobrist(); // { lo: number, hi: number }
console.log(board.zobristHex()); // "463b96181691fc9c"
```

### 4. Binary Move Stream Replay (`moves2`)
Replay entire games from a 16-bit binary stream at over **4.8 Million plies/second**:
```ts
import { Board } from 'gigachess';

// Replay a game directly from a Uint16Array
const moves = new Uint16Array([ /* packed 16-bit moves */ ]);
const board = Board.fromMoves2(moves);
console.log(board.toFen());
```

---

## 🔬 Architecture & Performance Engineering

GigaChess achieves Stockfish-level speed in V8 through six core architectural principles:

1. **Stateful In-Place `Board` Mutation**: Unlike immutable engines that allocate new position objects on every ply, `Board.makeMove()` updates bitboards and king positions in-place and returns a compact `Undo` struct for instant $O(1)$ rollback.
2. **16-bit Smi Packed Moves (`moves2`)**: Packed moves are represented as `(from & 0x3f) | ((to & 0x3f) << 6) | ((promo & 0x0f) << 12)`. In V8, integers `< 2^30` are stored as unboxed **Small Integers (Smis)** directly in registers, eliminating garbage collection nursery pressure.
3. **Zero-BigInt 32-bit Integer Pairs (`{ lo, hi }`)**: JavaScript engines box 64-bit `BigInt` on the heap. GigaChess executes all bitboard operations as 32-bit unsigned integer pairs (`lo >>> 0`, `hi >>> 0`), allowing V8 to keep bitboards in CPU registers.
4. **Stockfish `CheckContext` (Single-Pass Pin Analysis)**: Checkers, pin rays, and king danger squares are calculated once per position, turning legal destination generation into fast bitwise intersections ($\text{Pseudo} \cap \text{CheckMask} \cap \text{PinRay}$).
5. **Black Magic Bitboards with Lazy Loading**: Sliding piece attack queries (Bishop, Rook, Queen) use dynamic lazy-loaded `Uint32Array` lookup tables delivering **25.1M to 35.5M attacks/second**.
6. **Precomputed $64 \times 64$ Flat Ray & Between Tables**: Flat 4,096-entry lookup tables replace dynamic loops during raycasting and pin evaluation.

---

## 🌐 GigaChess Ecosystem

| Language & Package | Primary Environment | Performance Highlights | Repository |
|---|---|---|---|
| **`gigachess` (JS / TS)** *(this repo)* | Web frontends, Node.js, Electron, React UI | **45x faster move execution**, 18.7M nodes/s perft, 128k games/s PGN parser, variation trees | [GitHub](https://github.com/itshak/gigachess) / [npm](https://www.npmjs.com/package/gigachess) |
| **`gigachess` (Rust)** | Native backends, search engines, database indexing | **540 Mnps** perft, 144B `Copy` board, 1.41M games/s replay, zero heap allocations | [GitHub](https://github.com/itshak/gigachess-rs) / [crates.io](https://crates.io/crates/gigachess) |

---

## 📜 License

MIT © [Itshak](https://github.com/itshak) & [GigaChess Contributors](https://github.com/itshak/gigachess/graphs/contributors).
