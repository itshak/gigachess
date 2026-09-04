# GigaChess Baseline Benchmark Report (Pre-Optimization)

**Date:** September 4, 2026  
**Runtime:** Node.js v24.19.0 (macOS, Apple Silicon)  
**Methodology:** 3 passes median, explicit `global.gc()` between passes, unboxed 32-bit integer arithmetic (`>>> 0`), exact parity gates.

---

## 1. Perft Benchmark (`startpos` d6)

| Depth | Target Nodes | Result Nodes | Parity | Median Time (ms) | Throughput (Mnps) | vs chessops@0.15.1 |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **6** | 119,060,324 | 119,060,324 | **PASS** (exact) | 9,961.1 ms | **11.95 Mnps** | **+44.8%** (8.25 Mnps) |

---

## 2. Micro-Benchmarks (`bench/bench-micro.mjs` — 200,000 iters)

| Operation | Target / Input | Median (ns/op) | Throughput (ops/s) |
|:---|:---|:---:|:---:|
| `fenWrite` | startpos / kiwipete / midgame | 669.9 ns | 1,492,733 ops/s |
| `fenParse` | startpos / kiwipete / midgame | 1,580.6 ns | 632,675 ops/s |
| `movegen` | `startpos` (1-shot `allDests`) | 1,874.3 ns | 533,541 ops/s |
| `movegen` | `kiwipete` (1-shot `allDests`) | 3,055.2 ns | 327,316 ops/s |
| `movegen` | `chess960` (1-shot `allDests`) | 1,810.3 ns | 552,384 ops/s |
| `make+unmake` | 48-ply mainline cycle | 182,677.5 ns/cycle | 3,805.8 ns/ply |
| `isCheck` | in check (Fool's mate) | 43.0 ns | 23,259,081 ops/s |
| `isCheck` | out of check (startpos) | 64.1 ns | 15,606,762 ops/s |
| `zobrist` | scratch (`calculateZobrist`) | 271.8 ns | 3,678,911 ops/s |
| `zobrist` | incremental (`zobristAfterMove`) | 168.9 ns | 5,921,898 ops/s |
| `SAN parse` | 1-shot `parseSan` | 3,557.1 ns | 281,130 ops/s |
| `SAN render` | 1-shot `makeSan` | 507.6 ns | 1,970,071 ops/s |
| `clone` | board copy (`cloneBoard`) | 43.2 ns | 23,125,841 ops/s |

---

## 3. Cross-Engine Comparison: GigaChess (Pure TS) vs Ultrachess (Rust WASM)

| Operation | GigaChess (Pure TS) | Ultrachess (WASM) | Ratio / Winner |
|:---|:---:|:---:|:---:|
| **Movegen (startpos)** | **1,891.4 ns** | 5,024.8 ns | **2.66x faster** (TS win) |
| **Movegen (kiwipete)** | **3,065.0 ns** | 12,022.6 ns | **3.92x faster** (TS win) |
| **FEN write** | 550.2 ns | 349.8 ns | 1.57x (WASM win) |
| **FEN parse** | 1,596.5 ns | 889.0 ns | 1.80x (WASM win) |
| **isCheck** | 52.4 ns | 10.6 ns | 4.92x (WASM win) |
| **Perft (d4 = 197,281)** | 7.27 Mnps | 116.61 Mnps | 16.04x (WASM win) |

*Movegen note:* GigaChess pure TS outperforms Ultrachess JS wrapper by 2.6x–3.9x due to zero JS-WASM boundary object marshaling overhead. The staged optimization phases target closing the gap on perft bulk leaf counting, cached checkers, and targeted SAN.
