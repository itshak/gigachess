## Why

`purechess` now passes all 13 real-world gates (`bench/results/real-2026-08-30-gates-green.md`: sliding 3.36×, perft +19%, PGN 2.1×, FEN 2×, bundle 47KB gz) and is byte-identical to `chessops` on `perft`/`dests`/`FEN`/`SAN`/`UCI`, but does **not yet cover the full `chessops` API** (`src/chessops` is a thin re-export, `src/pgn.ts` lacks the rich `pgn-chess-tree` tree, `src/chessjs.ts` is a stub). To let the workstation drop GPL `chessops` and to replace `chess.js` (271k dl/mo) for adoption, the remaining surface must be built — and it must be built in a **strict clean-room that prohibits *any* GPL source, from *any* origin**.

## What Changes

- **Implements the remaining `chessops` + `pgn-chess-tree` + `chess.js` surface on top of the already-shipped `purechess` core, without ever reading GPL:**
  - `purechess/chessops` compat: `compat.ts` (chessground `Dests`/`Board` conversion), `transform.ts` (mirroring/rotating), `debug.ts` (perft helpers), `variant.ts` shims where spec’d, and the full `index.ts` re-export — all from `openspec/specs/{purechess-rules,purechess-board-movegen,purechess-pgn-fen}` only.
  - `pgn-chess-tree` in one place: merges `src/pgn.ts` streaming parser with the rich `GameTree` (`headers`, `moves[{san,nags,comments,variations: GameTree[]}]`, recursive variations, `makePgn` whitespace-normalized round-trip) so consumers import only `purechess/pgn` — no `pgn-chess-tree` dep. Behaviour re-specified from docs/ABNF/state-machine, never from GPL source.
  - `purechess/chessjs` drop-in: mutable `class Chess` façade over the functional core (`new Chess(fen)`, `.move(san)`, `.moves()`, `.fen()`, `.pgn()`, `.history()`, `.isCheckmate()`) that mutates an internal `Position` via `makeMove` — byte-identical SAN/FEN/UCI to `chess.js@1.4.0` where overlapping, with `+`/`#`/`=Q`/`O-O` parity.
- **Strict clean-room (prohibits GPL from *any* source):**
  - **FORBIDDEN SOURCES (no reading, no copying, no viewing, no `grep`, no `diff`):** `refs/gpl-only/` (chessops/Stockfish/pgn-chess-tree clones), `node_modules/chessops`, `node_modules/pgn-chess-tree`, any `chessops`/`chess.js`/`pgn-chess-tree` file on GitHub/npm/CDN/internet, any StackOverflow paste of their code, any GPL-licensed snippet, any LLM output that reproduces their code.
  - **ALLOWED SOURCES ONLY:** `openspec/specs/{purechess-rules,purechess-board-movegen,purechess-pgn-fen,purechess-benchmarks,purechess-baseline}` (Source of Truth) + `openspec/adr/012-purechess-toolchain.md` (TS `{lo,hi}`, fancy per-square magic via `bench/magic-tables/*.json`, ES2020) + `refs/mit-permissive/` (GopherCheck, NuclearChess, Chess4j, magic-bits, RecklessMagics, Chess_Movegen) + `refs/docs-refs/` (FIDE 2023, Chess960 X-FEN, python-chess/cm-pgn docs) + this repo’s own `src/` (already MIT) + FIDE PDFs.
  - **Enforcement:** `bench/magic-tables` stays MIT-generated, `rg -n "chessops" src/` and `rg -n "GPL" src/` remain empty in CI, `rg -n "chessops" bench/magic-tables/` empty, and commits are checked for `node_modules/chessops` reads.
- No `src-tauri/` Rust change, no DB schema change, no WASM lane.

## Capabilities

### New Capabilities
- `purechess-remaining-apis`: Remaining `chessops`/`pgn-chess-tree`/`chess.js` API surface that `purechess` does not yet cover — `compat`/`transform`/`debug`, rich `GameTree` with nested variations + `makePgn` as single PGN entry point, and `chessjs` mutable façade. Becomes `specs/purechess-remaining-apis/spec.md`.
- `purechess-bench-chessjs`: Benchmark lane vs `chess.js@1.4.0` (same corpora as `bench/suites/*`, parity-first) to prove the drop-in is faster on the same FEN/SAN/PGN/perft workloads.

### Modified Capabilities
- `purechess-board-movegen`: Clarify that `SquareSet`/`Board`/`attacks` SHALL remain `{lo,hi}` + fancy per-square magic via blobs (no GPL) and that the `chessops` compat layer (`compat.ts`/`transform.ts`) is a thin conversion, not a new movegen.
- `purechess-pgn-fen`: Clarify that `parsePgn`/`makePgn`/`GameTree` is the *single* PGN entry point (merges current `src/pgn.ts` streaming parser with the rich tree previously split as `pgn-chess-tree`) — no `pgn-chess-tree` dep, streaming `feed(chunk)` stays, `GameTree` shape stays.

## Impact

- **Code:** Adds `src/chessops/{compat,transform,debug}.ts`, extends `src/pgn.ts` to full `GameTree` (single `purechess/pgn`), implements `src/chessjs.ts` façade, adds `bench/suites/chessjs.mjs` + `bench/results/chessjs-*.md`. No `src/squareSet.ts`/`src/attacks.ts` hot-path change (already `+441%` vs HQ). `src/` stays MIT, `rg GPL src/` empty.
- **Dependencies:** No new runtime GPL deps; `chessops@0.15.1` and `chess.js@1.4.0` stay as **bench baselines only** (dev, never imported in `src/`). `rescript` stays dev-only (hot path is TS per ADR-012).
- **Licensing:** `purechess` stays MIT; workstation stays AGPL until `src/lib/chess.ts` can swap `import { Chess } from "chessops"` → `import { Chess } from "purechess/chessops"` and `chess.js` consumers can swap one import. No GPL text in `src/`.
- **Accessibility:** No UI change, but `purechess/chessjs` `makeSan` must stay byte-identical to `chess.js` `+`/`#`/`O-O` so `useChessMoveAnnouncer` + `AriaLiveAnnouncer` + `[`/`]`/`Alt+` chords remain correct (VoiceOver/NVDA next-impl verification).
