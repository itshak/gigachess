# AGENTS.md — GigaChess AI Agent Instructions

> This file is the canonical "README for AI agents" working on GigaChess.
> All AI coding assistants (Gemini, Claude, Cursor, Copilot, JetBrains AI) should read this file before making any changes.

---

## Project Overview

**GigaChess** is a high-performance, pure TypeScript chess engine and library.
It unifies native stateful `Board` performance, `chess.js` ergonomics, `chesstree` study trees, and Stockfish-level bitboard speed under a 100% permissive **MIT license**.

- **License:** MIT
- **Language:** TypeScript 5.8+ (strict mode, target ES2022)
- **Runtime:** Node.js >=22.5 / Browser (ESM)

---

## Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Native Board API** | High-performance stateful `Board` with in-place mutation & $O(1)$ `Undo` |
| **Bitboard Engine** | Zero-BigInt 32-bit integer pairs (`{ lo: uint32, hi: uint32 }`) |
| **Sliding Attacks** | Black Magic Bitboards with dynamic lazy loading (`Uint32Array`) |
| **Ray Queries** | Precomputed 4,096-entry $64 \times 64$ flat ray & between tables (`attacks.ts`) |
| **Move Generation** | Stockfish `CheckContext` (single-pass pin and check analysis) |
| **Position Hashing**| Incremental $O(1)$ 64-bit Polyglot Zobrist hashing (`zobrist.ts`) |
| **Move Compression**| 16-bit packed binary move streams (`packedMove.ts`, 2 bytes/ply) |
| **Variation Trees** | `chesstree` compatibility driver (`chesstree.ts`) |
| **Packaging** | ESM exports, TypeScript `.d.ts` declaration maps |

---

## Build & Test Commands

```bash
npm install              # Install dependencies
npm run build            # Compile TypeScript to dist/
npm run typecheck        # TypeScript strict typecheck (MUST pass)
npm test                 # Run all 165+ unit & parity test suites

# Real-World Workstation Benchmarks (24 Gates)
node --expose-gc bench/bench-real.mjs --quick   # Fast verification
node --expose-gc bench/bench-real.mjs           # Full 20-run median verification
```

---

## Project Constitution — ALWAYS Follow These Rules

### 1. Performance & Zero-BigInt Primacy
- **NEVER** use 64-bit `BigInt` for square sets in hot loops — JavaScript engines box `BigInt` on the heap.
- **ALWAYS** use 32-bit unsigned integer pairs `{ lo: number, hi: number }` with `>>> 0` bitwise arithmetic.
- **ALWAYS** run `node --expose-gc bench/bench-real.mjs --quick` before declaring performance changes complete. All 24 gates must remain green.

### 2. Exact Parity (Non-Negotiable)
- GigaChess maintains **100% exact parity** with `chess.js` on SAN/FEN/game state rules and `chessops` on legal movegen.
- **NEVER** break the public API contracts or change movegen without running the complete test suite (`npm test`).

### 3. MIT License Clean-Room Integrity
- GigaChess is 100% clean-room MIT.
- **NEVER** copy code from GPL-only or restrictive third-party chess libraries.

---

## Repository Map

```
gigachess/
├── src/                           # TypeScript source code
│   ├── chess.ts                   # Unified Super Chess class & core engine
│   ├── attacks.ts                 # Black Magic & 64x64 flat ray/between tables
│   ├── board.ts                   # Board representation & square operations
│   ├── squareSet.ts               # 32-bit pair SquareSet operations & BLSR
│   ├── fen.ts                     # Single-pass FEN scanner & serializer
│   ├── san.ts                     # SAN parser, maker, & disambiguation
│   ├── chesstree.ts               # Variation tree & recursive PGN engine
│   ├── zobrist.ts                 # Polyglot Zobrist hashing & key tables
│   ├── packedMove.ts              # 16-bit packed moves2 binary encoder
│   └── chessops/                  # Exact chessops compatibility module
├── bench/                         # Real-world benchmark harness & corpora
│   ├── suites/                    # Benchmark suites (sliding, perft, pgn, etc.)
│   └── data/                      # Pinned test corpora (PGN, EPD)
├── tests/                         # Unit and parity test suites
├── openspec/                      # OpenSpec specs, ADRs, and change history
└── dist/                          # Compiled production output
```

---

## Mirrored JS/Rust Rules Contract (MANDATORY)

The current maintenance OpenSpec change lives in
`openspec/changes/dual-engine-hardening-20261123/`. Read its proposal, design,
research and `specs/mirrored-core-contract/spec.md` before editing chess
rules, Chess960, FEN, SAN, repetition, hashing, or packed moves. Its peer
spec is IDENTICAL in `itshak/gigachess-rs` and the golden fixtures are:

- JS `tests/position-keys-v1.tsv`, `tests/moves2-v1.tsv`
- Rust `tests/data/position-keys-v1.tsv`, `tests/data/moves2-v1.tsv`

Immutable cross-language conventions: a1=0; 16-bit `moves2`
`from | to<<6 | promo<<12`; promotions 0/1=N/2=B/3=R/4=Q; castling
encoded as **king source -> original rook square** (including Chess960);
null sentinel `0xffff` with SAN `--` and UCI `0000`; Polyglot/960 rook-file
hash vectors and deterministic seed `0x00C0_FFEE_DABA_D00D`.
Polyglot uses **pseudo-legal** en-passant reachability. FIDE repetition uses
**legal** en-passant, so use `repetitionKey()` for that different purpose.
Neither engine may silently redefine these contracts alone.

GigaChess JS must remain pure JS/TS, no required WASM import or startup wait.
Rust maintains its own optimized native implementation; identical *semantics*
do not require identical internal structures or perft algorithms.
All new rules require paired fixtures and independent parity verification.
