# GigaChess Architecture & Performance Blueprint

> **GigaChess** is a native, local-first, zero-BigInt chess bitboard engine and workstation library.
> It unifies **`chess.js` ergonomics**, **`chesstree` study trees**, and **Stockfish-level bitboard speed** under a 100% **MIT license**.

---

## 🏗️ Layered System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Public API Layer                                 │
│  `Chess` Class  │  `Chess960`  │  `parsePgn`  │  `toTree()`  │  `moves2`    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                         Core Rule & Move Engine                             │
│  CheckContext Analysis │ Legality Filtering │ Pseudo Movegen │ FEN Scanner  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                    Low-Level High-Performance Bitboards                     │
│  Black Magic Tables  │ 64x64 Flat Ray/Between │ Polyglot Zobrist │ {lo,hi}  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Key Performance Engineering Principles

### 1. Zero-BigInt 32-bit Pair Layout (`SquareSet = { lo: number, hi: number }`)
JavaScript engines (V8 / SpiderMonkey / JavaScriptCore) optimize 32-bit bitwise operations (`|`, `&`, `^`, `>>> 0`) into single CPU instructions. In contrast, 64-bit `BigInt` forces object allocation and boxing on the heap. All bitboards in GigaChess are split into low/high 32-bit unsigned integers.

### 2. Precomputed $64 \times 64$ Flat Ray & Between Tables
All ray and between-square queries run in $O(1)$ through precomputed 4,096-entry `Uint32Array` tables:
```ts
const idx = ((from & 63) << 6) | (to & 63);
const betweenMask = { lo: BETWEEN_LO[idx], hi: BETWEEN_HI[idx] };
```
Eliminates dynamic loops, file/rank offset math, and branches during pin, check, and castling path evaluation.

### 3. Stockfish `CheckContext` (Single-Pass Pin & Check Analysis)
Rather than making/unmaking trial moves on a scratch board for every candidate piece, `analyzeCheckContext(pos)` computes king attackers, double-check flags, check intercept rays, and slider pin lines **once per position**. Destination generation is then a bitwise mask operation:
$$\text{LegalDests} = \text{PseudoDests} \cap \text{CheckMask} \cap \text{PinRay}$$

### 4. Incremental $O(1)$ 64-bit Polyglot Zobrist Hashing
Position hashing is computed incrementally inside `makeMove` by XORing moving pieces, captured pieces, castling right deltas, and EP files. Transposition matching and three-fold repetition checks compare `{ lo, hi }` integer pairs with zero FEN stringifications.

### 5. 16-bit Packed Move Streams (`moves2`)
Move history and game databases are serialized into raw `Uint16Array` buffers (2 bytes per ply, 160 bytes for an 80-ply game vs >4,000 bytes for JavaScript objects), delivering a **25x reduction in memory footprint**.

### 6. Black Magic Bitboards with Lazy Loading
Sliding piece attacks (Bishop, Rook, Queen) use Black Magic bitboard lookups for $O(1)$ throughput (35.5 Million attacks/sec). Magic table payloads are stored as base64 blobs and load asynchronously via dynamic `import()`, keeping the initial static bundle graph to just **17.5 KB gz**.

---

## 📊 Benchmark Summary

- **UI Legal Dests (Chessground):** **3.32x faster (+232%)** vs `chessops`
- **Sliding Piece Attacks:** **3.36x faster (+236%)** vs `chessops`
- **PGN Streaming:** **2.50x faster (+150%)** vs `chessops` | **3.05x faster** vs `chess.js`
- **Single-Pass FEN Scanner:** **2.45x faster (+145%)** vs `chessops` | **3.14x faster** vs `chess.js`
- **Recursive Movegen (Perft):** **15.6 Million nodes/sec (+56.4% faster)** vs `chessops`
- **Static Bundle Size:** **17.5 KB gz** (Includes Chess, 960, PGN, Trees, Zobrist, Moves2)

---

## 📜 ADR Index

- [ADR-001: MIT Licensing](openspec/adr/001-licensing.md)
- [ADR-010: Chessops Migration](openspec/adr/010-chessops-migration.md)
- [ADR-013: Castling Destination Normalization](openspec/adr/013-castling-dest-normalization.md)
- [ADR-014: Chessops Exact Compatibility](openspec/adr/014-chessops-exact-public-api.md)
- [ADR-015: Turbochess Branding](openspec/adr/015-turbochess-rename.md)
- [ADR-016: Engine Architecture & Bitboard Optimizations](openspec/adr/016-turbochess-engine-architecture-and-optimizations.md)
