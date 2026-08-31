# purechess-remaining-apis Specification

## Purpose
Implements the remaining `chessops` + `pgn-chess-tree` + `chess.js` surface that `purechess` does not yet cover — `compat`/`transform`/`debug` shims, a single rich `GameTree` PGN entry point, and a `chess.js`-compatible mutable façade — all from the already-archived language-neutral specs and never from GPL sources.

## Requirements

### Requirement: chessops compat layer (compat.ts) SHALL be a thin conversion over purechess core

The system SHALL expose `src/chessops/compat.ts` as ESM re-exports that convert `purechess` types to `chessground` `Dests`/`Board` shapes without re-implementing movegen. Functions SHALL be pure and SHALL delegate to `purechess/board-movegen` (`allDests`, `isLegal`, `kingAttackers`) and `purechess-rules` (castling rights). No `chessops` code SHALL be read or copied from `node_modules/chessops` or `refs/gpl-only/` or the internet — only `openspec/specs/{purechess-rules,purechess-board-movegen}`.

#### Scenario: chessground Dests parity
- **WHEN** `compat.chessToDests(pos)` is called for 1k random positions from `bench/suites/dests-terminal.mjs` corpus
- **THEN** output is byte-identical to `chessops/compat.ts` `chessToDests` for the same `pos` (maps `allDests` → `Map<Square, Square[]>`)

#### Scenario: Keyboard and screen reader parity via compat
- **WHEN** `BoardContainer` consumes `compat` `Dests` to render legal-move highlights and the user navigates with `[`/`]` or `Alt+B`
- **THEN** highlights and `AriaLiveAnnouncer` announcements remain byte-identical to the `chessops` baseline and `enableArrowMoveShortcuts` stays OFF by default

#### Scenario: Clean-room source check
- **WHEN** CI runs `rg -n "from.*chessops" src/chessops/compat.ts` and `rg -n "GPL" src/chessops/compat.ts`
- **THEN** both return empty and `rg -n "chessops" src/` is empty

### Requirement: chessops transform layer (transform.ts) SHALL provide mirroring/rotating as pure SquareSet ops

The system SHALL expose `src/chessops/transform.ts` with `mirrorBoard`, `rotateBoard`, `flipColor` etc. as pure `SquareSet`/`Board` transforms (swap `white`↔`black`, mirror `lo`/`hi` bits via `SquareSet` ops, no movegen). All SHALL be pure, no `BigInt` in hot path, and SHALL match `chessops/transform.ts` outputs for the same inputs on 10k random boards.

#### Scenario: Mirror preserves piece counts
- **WHEN** `transform.mirrorBoard(board)` is called on `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`
- **THEN** `board.white` and `mirrored.black` are swapped and `occupied` size unchanged, and double-mirror returns original (`equals`)

#### Scenario: No GPL source read
- **WHEN** `rg -n "chessops/transform" src/` is run
- **THEN** it is empty and the file header cites `openspec/specs/purechess-board-movegen` as the only allowed source

### Requirement: chessops debug helpers (debug.ts) SHALL expose perft and board dump as pure, from-spec oracles

The system SHALL expose `src/chessops/debug.ts` with `perft(pos, depth): number` already in `src/chess.ts` re-exported, and `debugBoard(pos): string` (ASCII board dump) for test parity. `perft` SHALL be the same `perft` that gates `purechess-board-movegen` (startpos d6 = 119060324). No `chessops/debug.ts` code SHALL be copied.

#### Scenario: perft debug parity
- **WHEN** `debug.perft(startpos, 4)` is called via `purechess/chessops` and via `chessops/debug` on the same `Setup`
- **THEN** both return `197281` and `debugBoard` strings are byte-identical modulo whitespace

### Requirement: PGN rich GameTree SHALL be the single PGN entry point (merges src/pgn.ts streaming parser with pgn-chess-tree)

The system SHALL make `purechess/pgn` the **only** PGN entry point: it SHALL expose `parsePgn(pgn: string): Result<GameTree, PgnError>` and `makePgn(tree: GameTree): string` and `PgnParser.feed(chunk)` streaming, where `GameTree` is `type GameTree = { headers: Map<string,string>, moves: Array<{ san: string, nags: number[], comments: string[], variations: GameTree[] }> }` as already spec’d in `purechess-pgn-fen`. This merges the current `src/pgn.ts` streaming parser with the rich tree previously split as `pgn-chess-tree` (author-owned but AGPL-tainted) — **no `pgn-chess-tree` code or `node_modules/pgn-chess-tree` SHALL be read**, only the ABNF/state-machine in `purechess-pgn-fen` spec. Recursive variations to any depth, `NAG $1..$140`, `{}` and `;` comments, Seven Tag Roster, `FEN`/`SetUp`, `%` escapes SHALL all be supported and `makePgn(parsePgn(pgn))` SHALL re-parse to byte-identical `GameTree` modulo whitespace.

#### Scenario: Nested variations to depth 3
- **WHEN** `parsePgn("1. e4 e5 (1... c5 (1... e6) {Sicilian}) 2. Nf3 *")` is called
- **THEN** `tree.moves[1].variations[0].moves[0].san==="c5"` and that move’s `variations[0].moves[0].san==="e6"` and `comments[0]==="Sicilian"`, and `makePgn` round-trips

#### Scenario: Single entry point
- **WHEN** a consumer imports `import { parsePgn } from "purechess/pgn"` and `import { GameTree } from "purechess/pgn"`
- **THEN** no `import { ... } from "pgn-chess-tree"` or `from "chessops/pgn"` is needed — `purechess/pgn` alone satisfies `bench/suites/pgn-stream.mjs` +13% gate and `parsePgn` never throws (returns `Result`)

#### Scenario: Clean-room for PGN
- **WHEN** `rg -n "pgn-chess-tree" src/` and `rg -n "chessops/pgn" src/` run
- **THEN** both are empty and the file header cites `purechess-pgn-fen` ABNF as the only source

### Requirement: chess.js drop-in façade (chessjs.ts) SHALL be a thin mutable wrapper over the functional core

The system SHALL expose `src/chessjs.ts` as `export class Chess { constructor(fen?: string); move(san: string): Move|null; moves(opts?: {square?: Square, verbose?: boolean}): string[]; fen(): string; pgn(): string; history(): string[]; isCheckmate(): boolean; ... }` that **mutates an internal `Position` via `makeMove`** (class façade over functional `src/chess.ts`). No `chess.js` source from `node_modules/chess.js` or the internet SHALL be read — only `purechess-rules`/`purechess-board-movegen`/`purechess-pgn-fen` specs and the already-shipped `src/chess.ts` functional core. SAN `+`/`#`/`=Q`/`O-O`/`0-0` tolerance and FEN `KQkq`/`HAha` SHALL be byte-identical to `chess.js@1.4.0` where overlapping.

#### Scenario: Mutable façade parity
- **WHEN** `const g = new Chess(); g.move("e4"); g.move("e5"); g.move("Nf3");` is called via `purechess/chessjs` and via `chess.js` on the same SAN stream
- **THEN** `g.fen()` strings are byte-identical after each ply and `g.history()` arrays are byte-identical

#### Scenario: Verbose moves and check suffix
- **WHEN** `g.moves({square: "e2", verbose: true})` is called in startpos
- **THEN** result contains `{from:"e2", to:"e4", san:"e4"}`-shaped objects with `san` byte-identical to `chess.js` and `isCheckmate()` matches `chess.js` on Fool’s mate `rnbqkbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3`

#### Scenario: Keyboard and screen reader not regressed via chessjs facade
- **WHEN** `BoardContainer` is driven by `purechess/chessjs` `Chess` instance and the user presses `[`/`]` or `Alt+` chords
- **THEN** `AriaLiveAnnouncer` via `makeSan` remains byte-identical to the `chessops` path and `enableArrowMoveShortcuts` OFF by default still holds

#### Scenario: No GPL source read for chessjs
- **WHEN** `rg -n "chess\.js" src/chessjs.ts` and `rg -n "chessjs" src/` are run
- **THEN** headers cite only `purechess-*` specs and `src/chess.ts`, and no `node_modules/chess.js` import exists in `src/`
