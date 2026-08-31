<p align="center">
  <img src="./assets/logo.png" width="220" alt="TurboChess Logo" />
</p>

<h1 align="center">TurboChess</h1>

<p align="center">
  <strong>The fastest chess engine in JavaScript.</strong><br>
  A 1-line drop-in upgrade for <code>chess.js</code> and <code>chessops</code> delivering 3.5x faster move validation, 
  120,000 games/sec PGN parsing, and interactive variation trees.
</p>

<p align="center">
  <a href="https://github.com/itshak/turbochess/actions"><img src="https://img.shields.io/github/actions/workflow/status/itshak/turbochess/ci.yml?branch=main&label=CI&style=flat-square" alt="CI Status"></a>
  <a href="https://www.npmjs.com/package/turbochess"><img src="https://img.shields.io/npm/v/turbochess?style=flat-square&color=blue" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/turbochess"><img src="https://img.shields.io/bundlephobia/minzip/turbochess?style=flat-square&color=emerald" alt="bundle size"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-Strict-blue?style=flat-square" alt="TypeScript"></a>
</p>

---

## ⚡ Why TurboChess?

Until today, chess developers had to choose between two compromises:
1. **`chess.js`**: Intuitive API, but slow (array-based board scans, string allocations on every move, no bitboards, no variation trees).
2. **`chessops`**: Fast bitboards, but restrictive GPL licensing, functional-only syntax with no single class, and lack of variation trees or transposition hashing.

**TurboChess eliminates this compromise.** It gives you:
- 🚀 **3.5x Faster than `chess.js`** across all standard operations.
- ⚡ **Up to 3.3x Faster than `chessops`** on real-world workstation workloads.
- 🔄 **1-Line Drop-in Replacement** for `chess.js` (`import { Chess } from 'turbochess'`) and `chessops` (`import * as chessops from 'turbochess/chessops'`).
- 🌳 **Built-in `chesstree` Variation Trees** (`game.toTree()` and `Chess.loadTree(pgn)`).
- 🔑 **Instant $O(1)$ 64-bit Polyglot Zobrist Hashing** (`game.zobrist()`).
- 📦 **16-bit Binary Move Streams (`moves2`)** (25x smaller memory footprint per game).
- 📜 **100% Permissive MIT License** — completely free for commercial and proprietary software.

---

## 📊 Benchmark Comparison

| Metric / Workload | 🚀 **TurboChess** | ♟️ **`chessops`** (0.15.1) | 📦 **`chess.js`** (1.4.0) | TurboChess Advantage |
|---|---|---|---|---|
| **License** | ✅ **100% MIT** | ❌ **GPL-3.0** | ✅ **BSD-2-Clause** | **Free for commercial use** |
| **Sliding Piece Attacks** | **35.5 MAttacks/s** | 10.6 MAttacks/s | N/A *(array scan)* | **3.36x faster (+236%)** vs chessops |
| **Perft Movegen Throughput** | **15.6 Million nodes/s** | 10.0 Million nodes/s | ❌ *(No perft API)* | **+56.4% faster** vs chessops |
| **Chessground UI Dests** | **200,424 pos/s** | 58,000 pos/s | N/A | **3.32x faster (+232%)** vs chessops |
| **FEN Parse + Make** | **285,000 ops/s** | 111,500 ops/s | 90,800 ops/s | **2.45x vs chessops \| 3.14x vs chess.js** |
| **SAN Make + Legal Dests** | **24,727 ops/s** | 18,200 ops/s | 6,947 ops/s | **+36% vs chessops \| 3.56x vs chess.js** |
| **PGN Game Streaming** | **118,000 games/s** (82 MB/s) | 47,000 games/s (33 MB/s) | 1,665 games/s (1.2 MB/s) | **2.51x vs chessops \| 3.05x vs chess.js** |
| **Repertoire Tree Build** | **33,000 lines/s** | 20,400 lines/s | ❌ *(No Tree API)* | **+65.3% faster** vs chessops |
| **Polyglot Zobrist ($O(1)$)** | ✅ **Native (`{lo,hi}`)** | ❌ None | ❌ None | **Zero-allocation transposition match** |
| **16-bit Packed Moves (`moves2`)** | ✅ **Native (`Uint16Array`)** | ❌ None | ❌ None | **25x smaller memory (160 B/game)** |
| **Bundle Size (gzipped)** | **17.5 KB gz** | 28.0 KB gz *(full)* | **12.6 KB gz** | **Complete workstation in 17 KB** |

*Benchmarks measured on Node.js v22 on Apple Silicon (M-series). Run locally via `npm run bench:real`.*

---

## 🛠️ Installation

```bash
npm install turbochess
```

---

## 🏎️ 1-Line Drop-in Migrations

### From `chess.js`
Replace your import statement. Every method, property, and type signature works out of the box with an instant 3.5x speed boost:
```ts
// Before:
// import { Chess } from 'chess.js';

// After:
import { Chess } from 'turbochess';

const chess = new Chess();
chess.move('e4');
chess.move('e5');
console.log(chess.fen()); // 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
console.log(chess.history()); // ['e4', 'e5']
```

### From `chessops`
Import the high-performance compatibility module with exact API shape and 100% MIT license:
```ts
// Before:
// import { Chess } from 'chessops/chess';
// import { parseFen } from 'chessops/fen';

// After:
import { Chess } from 'turbochess/chessops/chess';
import { parseFen } from 'turbochess/chessops/fen';
```

---

## 💡 Quick Examples

### 1. Ultra-Fast Chessground UI Legal Moves
Generate legal move dots for `@lichess-org/chessground` or any UI chessboard in microseconds:
```ts
import { Chess } from 'turbochess';

const game = new Chess();

// Legal destinations map for every piece on the board: Map<fromSquare, SquareSet>
const allDests = game.allDests();

// Or for a single square:
const e2Dests = game.dests('e2');
```

### 2. Variation Trees & PGN Analysis (`toTree` & `loadTree`)
Full recursive variation tree navigation and PGN export built right in:
```ts
import { Chess } from 'turbochess';

// 1. Export live game to an interactive variation tree:
const game = new Chess();
game.move('e4');
game.move('e5');
game.move('Nf3');

const tree = game.toTree();
tree.setCommentAt([1], 'Open Game');
console.log(tree.pgn());

// 2. Load annotated PGN with branching variations:
const treeWrapper = Chess.loadTree(`1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6`);
const root = treeWrapper.getRoot();
```

### 3. $O(1)$ 64-bit Polyglot Zobrist Hashing
Instant position fingerprinting for opening books, transpositions, and repetitions:
```ts
import { Chess } from 'turbochess';

const game = new Chess();
game.move('e4');

const key = game.zobrist(); // { lo: 0x823c9b50, hi: 0xfd114196 }
console.log(game.zobristHex()); // "823c9b50fd114196"
```

### 4. 16-bit Packed Move Streams (`moves2`)
Compress entire game databases down to 2 bytes per ply:
```ts
import { Chess } from 'turbochess';

const game = new Chess();
game.move('e4');
game.move('c5');
game.move('Nf3');

// Serialize history into raw Uint16Array (6 bytes total):
const buffer = game.toMoves2();

// Instant binary replay:
const replayedGame = Chess.fromMoves2(buffer);
console.log(replayedGame.fen() === game.fen()); // true
```

---

## 🔬 How is TurboChess so Fast?

TurboChess incorporates the same hardware-efficient architectural principles found in Stockfish and modern master engines:

1. **Zero-BigInt 32-bit Pair Bitboards (`{ lo, hi }`)**: JavaScript V8 optimizes 32-bit unsigned integers into native CPU registers. BigInt forces heap boxing and garbage collector churn.
2. **Precomputed $64 \times 64$ Flat Ray & Between Tables**: Single-cycle `Uint32Array(4096)` array index lookups replace dynamic loops during pin and check resolution.
3. **Stockfish `CheckContext` (Single-Pass Pin Analysis)**: Pins, check rays, and king-safe destination masks are analyzed **once per position**, turning move validation into fast bitwise intersections ($\text{Pseudo} \cap \text{CheckMask} \cap \text{PinRay}$).
4. **Black Magic Sliding Bitboards**: $O(1)$ Bishop, Rook, and Queen ray generation delivering over **35.5 Million attacks/sec**.
5. **Incremental Zobrist XORs**: Hashing updates in $O(1)$ per move rather than rescanning the 64 squares.
6. **Perft Leaf Popcounting**: Depth-1 node counting skips all JavaScript move object allocations.

---

## 📜 License

MIT © [Itshak](https://github.com/itshak) & [TurboChess Contributors](https://github.com/itshak/turbochess/graphs/contributors).
