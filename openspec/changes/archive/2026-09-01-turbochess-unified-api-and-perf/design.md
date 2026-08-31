## Context
See `proposal.md` for background and motivation. TurboChess currently maintains separate wrappers (`src/chessjs.ts`, `src/chessops/*.ts`, `src/chesstree.ts`) over a core functional engine. This design consolidates the API around a Unified Root `Chess` class that natively supports `chess.js` methods, tree operations, and bitboard move queries, while introducing zero-allocation 64-bit Zobrist hashing and 16-bit packed moves (`moves2`), optimizing hot engine execution paths, and establishing workstation-specific benchmarks.

## Goals / Non-Goals

**Goals:**
- Provide a single, intuitive `Chess` class at the root `turbochess` entrypoint that supersets `chess.js` and integrates `chesstree` analysis.
- Implement zero-BigInt 64-bit Zobrist hashing (`{ lo, hi }`) matching Polyglot and `shakmaty::zobrist::Zobrist64` standards.
- Implement 16-bit packed move encoding (`moves2` / `Uint16Array`) matching `blind-base`'s `gigabase_moves.rs`.
- Alias `turbochess/chessjs` to the root module, deleting `src/chessjs.ts` (~433 LOC).
- Implement zero-allocation `CheckContext` reuse in `makeSan` for 3x–5x faster SAN disambiguation.
- Implement single-pass index-based FEN scanning in `parseFen` (zero regex, zero string splitting).
- Inline bitwise math in `src/attacks.ts` (`isAttacked`, `kingAttackers`, `attackersTo`) to remove intermediate `{lo, hi}` allocations.
- Replace `x * 0x01010101` in `popcnt32` with `Math.imul`.
- Remove hardcoded `START_PERFT` shortcut in `src/chess.ts:788` for 100% genuine calculation.
- Add `bench/suites/blindbase-real.mjs` profiling the 4 workstation workflows with real-time progress logging.
- Update `package.json` license to `MIT`.

**Non-Goals:**
- Using `BigInt` for Zobrist keys in hot paths (avoiding V8 heap allocation penalties).
- Modifying the Black Magic table format (the base64 Uint32Array blob already delivers 34.3 MAttacks/s).

## Decisions

### D1: Unified Root `Chess` Class
- **Architecture**: The root `Chess` class (in `src/index.ts` / `src/chess.ts`) will encapsulate an internal `Position` and history log, exposing:
  - Standard `chess.js` methods: `load(fen)`, `reset()`, `fen()`, `turn()`, `move(input)`, `moves(options)`, `history(options)`, `undo()`, `isCheckmate()`, `isStalemate()`, `isDraw()`, `isInsufficientMaterial()`, `isThreefoldRepetition()`, `perft(depth)`.
  - Superset Tree methods: `toTree() -> TreeWrapper`, `loadTree(pgn) -> TreeWrapper`.
  - High-performance bitboard & packed methods: `dests(square)`, `allDests()`, `zobrist()`, `zobristHex()`, `toMoves2()`, `loadMoves2(buffer)`.
- **Alternatives Considered**: Keeping a separate `src/chessjs.ts` facade. *Rejected:* Adds 433 lines of redundant wrapper code and introduces extra translation overhead.

### D2: Zero-BigInt 64-bit Zobrist Architecture
- **Architecture**: `src/zobrist.ts` uses static `Uint32Array` tables for 12 piece types × 64 squares, 16 castling states, 8 en-passant files, and 1 side-to-move token:
  ```ts
  export type ZobristKey = { readonly lo: number; readonly hi: number; };
  ```
  `Position` tracks `zobristLo` and `zobristHi`. `makeMove` updates them in place using 32-bit bitwise `^`.
- **Standards**: Constants and legal-en-passant check logic match Polyglot and `shakmaty::zobrist::Zobrist64` exactly.

### D3: 16-bit Packed Move Format (`moves2`)
- **Architecture**: `src/packedMove.ts` defines 2-byte bit manipulation:
  $$\text{word} = (\text{from} \mathbin{\&} 0x3f) \mid ((\text{to} \mathbin{\&} 0x3f) \ll 6) \mid ((\text{promo} \mathbin{\&} 0x0f) \ll 12)$$
  Games can be represented directly as a flat `Uint16Array` for 25x–50x memory reduction.

### D4: `CheckContext` Reuse in `makeSan`
- **Architecture**: `makeSan(move, pos, ctx?)` accepts an optional `CheckContext`. When disambiguating moves across multiple candidates of the same role, `makeSan` computes `ctx = analyzeCheckContext(pos)` once and calls `destsFast(pos, sqIdx, piece, ctx)` for each candidate.

### D5: Zero-Alloc Single-Pass FEN Scanner
- **Architecture**: `parseFen` iterates through the input string using character codes (`charCodeAt(idx)`), reading rank numbers (`1`..`8`), piece letters (`p,n,b,r,q,k`), active color (`w/b`), castling rights (`K,Q,k,q`), and en-passant coordinate directly.

### D6: Blind-Base Benchmark Suite
- **Architecture**: `bench/suites/blindbase-real.mjs` defines reproducible micro-benchmarks for:
  1. `repertoire-build`: constructing 5,000 opening lines.
  2. `reference-tree`: streaming 10,000 games through `pgnImport`.
  3. `chessground-dests`: transforming `allDests()` for 10,000 positions.
  4. `uci-to-san`: streaming 100,000 engine plies to SAN.

## Risks / Trade-offs

- **[Risk]** Disambiguation optimization could produce subtly different SAN string on rare edge cases.
  - **Mitigation:** Protected by the 100% byte-parity gates in `tests/parity.mjs` and `bench/suites/fen-san-uci.mjs`.
- **[Risk]** En-passant Zobrist hashing differences on invalid EP squares.
  - **Mitigation:** Strict conformance to Polyglot/Shakmaty en-passant legality filtering verified in unit tests.
