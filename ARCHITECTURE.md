# GigaChess Architecture & Performance Blueprint

> **GigaChess** is a native, local-first, zero-BigInt chess bitboard engine and library.
> It unifies **native Rust-mirrored `Board` performance**, **`chess.js` ergonomics**, **`chesstree` study trees**, and **Stockfish-level bitboard speed** under a 100% **MIT license**.

---

## 🏗️ Layered System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Public API Layer                                 │
│  `Board` Class  │  `Undo`  │  `Chess` (facade)  │  `parsePgn`  │  `moves2`  │
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
Position hashing is computed incrementally inside `makeMove` by XORing moving pieces, captured pieces, castling right deltas, and EP files:
- **Standard Chess**: Bit-identical to canonical 64-bit Polyglot keys (`0x463b96181691fc9c` startpos), using the pseudo-legal en-passant condition and White-turn XOR.
- **Chess960**: 16 per-rook-file castling keys indexed by `color * 8 + file` (files a/h pin to Polyglot 768..771; files b..g derived via deterministic splitmix64 PRNG seed `0x00C0_FFEE_DABA_D00D`) matching `gigachess-rs` (ADR-003).
Transposition matching and three-fold repetition checks compare `{ lo, hi }` integer pairs with zero FEN stringifications.

### 5. 16-bit Packed Move Streams (`moves2`)
Move history and game databases are serialized into raw `Uint16Array` buffers (2 bytes per ply, 160 bytes for an 80-ply game vs >4,000 bytes for JavaScript objects), delivering a **25x reduction in memory footprint**:
- **Bit layout**: `(from & 0x3f) | ((to & 0x3f) << 6) | ((promo & 0x0f) << 12)` (promo: 0=none, 1=N, 2=B, 3=R, 4=Q).
- **Castling wire representation**: King-from → rook-square (`e1h1`, `e1a1`, `e8h8`, `e8a8` standard; king → initial rook square for Chess960), 100% unified with `gigachess-rs` and UCI-960 conventions. Zero-copy binary transfer over Tauri IPC.

### 6. Black Magic Bitboards with Lazy Loading
Sliding piece attacks (Bishop, Rook, Queen) use Black Magic bitboard lookups for $O(1)$ throughput (35.5 Million attacks/sec). Magic table payloads are stored as base64 blobs and load asynchronously via dynamic `import()`, keeping the initial static bundle graph to just **17.5 KB gz**.

---

## 📊 Benchmark Summary

- **Move Execution (`makeMove` + `unmakeMove`):** **44.5x faster (+4,350%)** vs `chess.js` (5.98M ops/s)
- **Legal Move Generation:** **11.0x faster (+1,001%)** vs `chess.js` (541k pos/s)
- **Recursive Movegen (Perft):** **18.7 Million nodes/sec (1.88x faster)** vs `chessops` | **37x faster** vs `chess.js`
- **Chessground UI Dests:** **3.71x faster (+271%)** vs `chessops` (215,585 pos/s)
- **Sliding Piece Attacks (Black Magic):** **25.1 MAttacks/sec (2.69x faster)** vs `chessops`
- **PGN Streaming:** **128,701 games/sec (2.78x faster)** vs `chessops` | **35x faster** vs `chess.js`
- **FEN Parse + Make:** **458,961 ops/s (2.43x faster)** vs `chessops` | **5.03x faster** vs `chess.js`
- **SAN Make + Legal Dests:** **49,444 ops/s (2.72x faster)** vs `chessops` | **7.07x faster** vs `chess.js`
- **Static Bundle Size:** **17.4 KB gz** (Includes Board, Chess facade, 960, PGN, Trees, Zobrist, Moves2)

---

## 📜 ADR Index

- [ADR-001: MIT Licensing](openspec/adr/001-licensing.md)
- [ADR-010: Chessops Migration](openspec/adr/010-chessops-migration.md)
- [ADR-013: Castling Destination Normalization](openspec/adr/013-castling-dest-normalization.md)
- [ADR-014: Chessops Exact Compatibility](openspec/adr/014-chessops-exact-public-api.md)
- [ADR-015: GigaChess Branding](openspec/adr/015-gigachess-rename.md)
- [ADR-016: Engine Architecture & Bitboard Optimizations](openspec/adr/016-gigachess-engine-architecture-and-optimizations.md)
- [ADR-017: Rust-Mirrored Native Board API & Chess960 Zobrist](openspec/adr/017-rust-mirrored-native-board-api-and-chess960-zobrist.md)
