## ADDED Requirements

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
