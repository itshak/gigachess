## Why

Phase 1 locked the toolchain (TS functional `{lo,hi}` wins, Black Magic 441% vs HQ, ADR-012) and the wall (`refs/gpl-only/`). Phase 2 must now produce the *language-neutral* chess specs that the impl agent will build `purechess` from — without the impl agent ever reading GPL code. This is the clean-room spec step: derive FIDE 2023 + Chess960 + PGN/FEN behavior from `chessops`, Stockfish, and `pgn-chess-tree` (author-owned but AGPL-tainted) + canonical docs (FIDE Laws, python-chess/cm-pgn), and emit per-square Black Magic tables via MIT `RecklessMagics`.

## What Changes

- **New specs (all language-neutral, no GPL text copied):**
  - `purechess-rules` — FIDE Laws 2023 (Jan 1 2023) + Chess960 (X-FEN/Shredder-FEN, king ends `g1/c1`) legality: castling, en passant, promotion, check/checkmate/stalemate, 50-move/repetition/insufficient material (GWT).
  - `purechess-board-movegen` — `Bitboard` as `{lo,hi}` ops, leavers (knight/king/pawn), Black Magic plain fixed-shift sliding (`mask`/`magic`/`shift` per square, offset tables), `SquareSet` API, perft oracle.
  - `purechess-pgn-fen` — PGN ABNF (headers, `*`, `1-0`, comments `{}`, variations `()`, NAG `$1`, SAN disambiguation) + FEN 6-field + Shredder-FEN castling `HAha`, streaming chunk parser state machine (like `cm-pgn`/`python-chess`), `GameTree` node shape re-specified from `pgn-chess-tree` behavior (not source).
- Generates **`bench/magic-tables/{rook,bishop}.json`** (per-square `mask/magic/shift/offset`, flat `table` 8192) via MIT `RecklessMagics`/`magic-bits` crate — checked in JSON, **not copied from chessops/Stockfish**.
- **BREAKING (future impl):** No code change in this spec change, but these specs define the drop-in `purechess` API that will later replace `chessops` (`import { Chess } from "purechess"` + `purechess/chessjs` shim). No workstation `src/` touched here.
- **Out of scope:** `purechess` implementation (`src/`), WASM lane (`purechess/wasm`), `chess.js` compat shim beyond API mapping.

## Capabilities

### New Capabilities
- `purechess-rules`: FIDE 2023 standard + Chess960 move legality, castling truth tables, check/stalemate, FEN legality (Kings=2, pawns not on backrank, oppositeCheck), SAN/UCI semantics.
- `purechess-board-movegen`: Board representation (`Bitboard {lo,hi}`, `SquareSet` ops, `Board` `{white,black,pawn,knight,bishop,rook,queen,king,occupied,promoted}`), Black Magic sliding (per-square tables, `attacks`/`ray`/`between`), `dests`/`isLegal`/`kingAttackers`.
- `purechess-pgn-fen`: PGN streaming parser + `GameTree` + `parsePgn`/`makePgn`, FEN `parseFen`/`makeFen` (Shredder-FEN), SAN `parseSan`/`makeSan`, UCI `parseUci`/`makeUci`, `Result` error handling.

### Modified Capabilities
- None — `openspec/specs/{purechess-baseline,purechess-benchmarks}` remain Source of Truth from Phase 1 archive; Phase 2 adds new caps only.

## Impact

- **Code:** No `src/` or `src-tauri/` changes. Adds `openspec/specs/purechess-{rules,board-movegen,pgn-fen}/spec.md` (promoted on archive) + `bench/magic-tables/*.json` (MIT-generated, pinned). `refs/gpl-only/` stays gitignored, spec agent only.
- **Dependencies:** No new npm/cargo deps in this spec change; `RecklessMagics` (MIT, Rust) runs offline to generate JSON (not a runtime dep). Impl change will use `typescript@ES2020/ESNext` per ADR-012 (target ES2020, module ESNext, downlevelIteration:false, const enum).
- **Licensing:** Specs are CC0/MIT; JSON tables are MIT-generated, not GPL. No GPL text in `src/` (CI `rg GPL src/` empty). `pgn-chess-tree` optimizations re-specified abstractly.
- **Accessibility:** No UI change, but specs reserve SAN/`AriaLiveAnnouncer` parity: `makeSan` must produce byte-identical `+`/`#`/`=`/`0-0` so `useChessMoveAnnouncer` and `[`/`]`/`Alt+` keyboard in `GameViewShell` are unaffected. Future integration tests will verify.
- **ADR:** Implements ADR-012 (TS functional, Black Magic, `{lo,hi}`, ESNext) and ADR-001/010 (GPL taint). Detailed castling and perft tables align with ADR-011 board primitives.
