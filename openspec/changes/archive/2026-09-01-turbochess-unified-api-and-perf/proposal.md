# Proposal: Unified Super API, Zero-Alloc Zobrist, Packed Moves2 & Blind-Base Benchmarks

## Why
TurboChess aims to be the high-performance, 100% MIT-licensed chess engine and analysis library for modern web and desktop applications (such as `blind-base`). Currently, the codebase is split across three fragmented facades (`chessops`, `chesstree`, and `chessjs`), introduces duplicate translation layers, lacks 64-bit Zobrist hashing and 2-byte binary move encoding (`moves2`), contains a hardcoded perft shortcut on startpos, and lacks dedicated profiling against the real-world workstation workloads used in `blind-base`.

This change unifies the API surface around a single modern "Super API" at the root entrypoint (`turbochess`) that combines `chess.js` ergonomics with native tree navigation (`chesstree`), adds zero-allocation `{ lo, hi }` 64-bit Zobrist hashing and 16-bit packed move encoding (`moves2`), accelerates core engine hot paths (zero-alloc SAN disambiguation, single-pass FEN scanning, inlined bitwise attack tests), removes the startpos perft bypass, and introduces a dedicated `blind-base` real-world benchmark suite.

## What Changes
- **Unified Root API (`turbochess`)**: The root `Chess` class is redesigned as an ergonomic, high-performance superset of `chess.js`, adding native tree operations (`.toTree()`, `.loadTree()`), fast Chessground dest generation (`.dests()`, `.allDests()`), Zobrist hashes (`.zobrist()`, `.zobristHex()`), and binary move stream methods (`.toMoves2()`, `.loadMoves2()`).
- **Zero-Allocation 64-bit Zobrist Hashing (`src/zobrist.ts`)**:
  - Polyglot/Shakmaty-compatible 64-bit random constants.
  - Represented as `{ lo: number, hi: number }` (zero `BigInt` heap overhead).
  - Maintained incrementally ($O(1)$) in `makeMove` for instant repetition checks and transposition tables.
- **16-bit Packed Move Encoding (`src/packedMove.ts`)**:
  - 2-byte move format matching `blind-base`'s `gigabase_moves.rs` (`word = from | (to << 6) | (promo << 12)`).
  - 25x–50x memory reduction for game databases (160 bytes per 80-ply game in `Uint16Array`).
  - Ultra-fast binary game replay and direct Tauri IPC bridge support.
- **API Consolidation & Deprecation**:
  - `turbochess/chessjs` becomes a direct 1-line alias to the root `turbochess` export (deleting `src/chessjs.ts` ~433 LOC).
  - `turbochess/chesstree` is folded into root and `turbochess/chessops` as integrated tree methods, while keeping a backward-compatible export.
- **Engine Performance & Purity**:
  - Remove hardcoded `START_PERFT` bypass in `src/chess.ts:788` for 100% genuine engine calculation across all positions.
  - Optimize `makeSan` disambiguation by reusing precomputed `CheckContext` across candidate pieces (3x–5x faster SAN generation on complex boards).
  - Implement a fast single-pass, zero-regex, zero-split FEN scanner (`parseFen`) and formatter (`makeFen`).
  - Inline bitwise operations in `attacks.ts` (`isAttacked`, `kingAttackers`, `attackersTo`) to eliminate intermediate `{lo, hi}` object GC churn.
  - Optimize `popcnt32` with `Math.imul`.
- **Benchmark Suite Fixes & Expansion**:
  - Resolve the long-running perft benchmark loop by adding real-time progress indicators and tuning depth/iterations for responsive CI and local runs.
  - Add `bench/suites/blindbase-real.mjs` profiling 4 real-world workstation flows: Repertoire tree building, master reference streaming, Chessground legal dest formatting, and UCI engine stream translation.
- **License & Metadata Alignment**:
  - Update `package.json` license from `AGPL-3.0-or-later` to `MIT`.
  - Update repository remotes and metadata to `https://github.com/itshak/turbochess`.

## Capabilities

### New Capabilities
- `turbochess-unified-api`: Defines the Unified Super `Chess` class contract, integrated tree analysis APIs, and seamless drop-in aliasing for `chess.js` and `chesstree` consumers.
- `turbochess-zobrist-and-moves2`: Defines zero-BigInt `{ lo, hi }` 64-bit Zobrist hashing and 16-bit packed move encoding (`moves2`).
- `turbochess-blindbase-benchmarks`: Defines the benchmark harness and performance gates for the 4 real-world workstation workloads in `blind-base`.

### Modified Capabilities
- `purechess-rules`: Removes the startpos perft bypass and requires 100% honest recursive calculation for all positions and depths.
- `turbochess-optimization-audit`: Expands optimization requirements to include `CheckContext` reuse in `makeSan`, single-pass FEN scanning, and bitwise attack inlining.

## Impact
- **Public API**: `import { Chess } from 'turbochess'` becomes the primary modern entrypoint. `turbochess/chessops` and `turbochess/chessjs` remain 100% compatible.
- **Footprint**: Deletes redundant facade boilerplate (~500+ LOC removed) and unifies role/character mappings across `util.ts`, `fen.ts`, and `san.ts`.
- **License**: 100% MIT permissive license, allowing proprietary integration in `blind-base`.
- **Accessibility & i18n**: Unchanged; SAN outputs, error codes, and live region announcements maintain 100% byte parity.
