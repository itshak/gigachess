## 1. Clean-room verification (FORBIDDEN vs ALLOWED)

- [ ] 1.1 Verify `openspec status --change purechess-remaining-cleanroom --json` shows proposal:done specs:done design:done and `refs/README.md` wall intact, and `rg -n "from.*chessops|from.*pgn-chess-tree|GPL" src/` is empty before any edits — verification: `rg -n "chessops|pgn-chess-tree|GPL" src/` returns empty and `cat .gitignore | grep refs/gpl-only` shows gitignored and `rg -n "chessops" bench/magic-tables/` empty
- [ ] 1.2 Confirm `bench/suites/chessjs.mjs` will treat `chess.js@1.4.0` as bench baseline only (never imported in `src/`), and `node_modules/chessops` is present for bench parity only — verification: `rg -n "chess\.js" src/` empty at start and `grep -r "chessops" src/chessops/` shows only the new compat files that cite `purechess-*` specs in header

## 2. chessops compat layer (purechess/chessops)

- [ ] 2.1 Implement `src/chessops/compat.ts` as thin `allDests`→`Dests` conversion over `purechess/board-movegen` (no movegen), pure, no `BigInt`, header cites `purechess-board-movegen` spec only — verification: `rg -n "BigInt" src/chessops/compat.ts` empty, `rg -n "chessops" src/chessops/compat.ts` empty, and `node -e "import {compat} from './dist/chessops/compat.js'"` loads without `node_modules/chessops` import
- [ ] 2.2 Implement `src/chessops/transform.ts` (`mirrorBoard`, `rotateBoard`, `flipColor`) as pure `SquareSet` ops (`white`↔`black` swap, `lo`/`hi` bit mirror) — verification: `mirrorBoard` twice returns original via `board.equals` on 100 random boards and `rg -n "chessops" src/chessops/transform.ts` empty
- [ ] 2.3 Implement `src/chessops/debug.ts` re-exporting `perft`/`debugBoard` (ASCII dump) from `src/chess.ts` — verification: `perft(startpos,4)===197281` and `debugBoard` string byte-identical to `chessops/debug` modulo whitespace on sample FENs

## 3. Single PGN entry point (purechess/pgn merges pgn-chess-tree)

- [ ] 3.1 Extend `src/pgn.ts` to full `GameTree { headers: Map<string,string>, moves: [{san, nags: number[], comments: string[], variations: GameTree[]}] }` with recursive `variations` to any depth, `NAG $1..$140`, `{}`/`;` comments, Seven Tag Roster, `FEN`/`SetUp`, `%` escapes, and `makePgn` whitespace-normalized round-trip — **no `pgn-chess-tree` or `chessops/pgn` import**, only `purechess-pgn-fen` ABNF/state-machine — verification: `parsePgn("1. e4 e5 (1... c5 (1... e6) {Sicilian}) 2. Nf3 *")` yields `variations[0].moves[0].san==="c5"` depth 3, and `rg -n "pgn-chess-tree|chessops/pgn" src/pgn.ts` empty
- [ ] 3.2 Keep `PgnParser.feed(chunk)` streaming (chunked without re-scan, `bench/suites/pgn-stream.mjs` heap ≤110%) and `makePgn(parsePgn(pgn))` re-parses to byte-identical `GameTree` modulo whitespace — verification: `bench/suites/pgn-stream.mjs --quick` reports `games/s` ≥50% vs `chessops` and `peakHeap` ≤110% on 10-game tiny corpus

## 4. chess.js drop-in façade (purechess/chessjs)

- [ ] 4.1 Implement `src/chessjs.ts` as `export class Chess { #pos; constructor(fen?: string){...}; move(san:string): Move|null; moves(opts?:{square?:Square,verbose?:boolean}): string[]; fen():string; pgn():string; history():string[]; isCheckmate():boolean; ... }` as mutable wrapper over functional `src/chess.ts` (`parseSan`/`makeMove`/`makeFen`) — **no `node_modules/chess.js` import**, header cites `purechess-*` specs only — verification: `new Chess().move("e4").fen()` equals `new (require("chess.js").Chess)().move("e4")` fen after each ply on 3 game SAN streams and `rg -n "chess\.js" src/chessjs.ts` shows only spec citation
- [ ] 4.2 Verify verbose moves and `+`/`#`/`O-O`/`=Q` byte-identical to `chess.js` where overlapping, and `isCheckmate()` matches on Fool’s mate — verification: `g.moves({square:"e2",verbose:true})` shape matches `chess.js` and `makeSan` is byte-identical for `+`/`#`/`O-O` on 1k random positions

## 5. chess.js benchmark lane (parity-first)

- [ ] 5.1 Add `bench/suites/chessjs.mjs` lane (same methodology as `bench/suites/*`: 3 warmups, median of 20, `global.gc()`, `performance.now()`, pinned corpora) that is parity-first vs `chess.js@1.4.0` (bench baseline only, never in `src/`) and reports `games/s`, `FEN parse+make`, `SAN make`, `dests` vs `chess.js`, writing `bench/results/chessjs-*.md` — verification: `node bench/suites/chessjs.mjs --help` lists corpora and `rg -n "chessops" bench/suites/chessjs.mjs` empty except other suite baseline reference
- [ ] 5.2 Gate `bench/suites/chessjs.mjs` on `≥99.9%` FEN/SAN/UCI parity (fail CI on parity miss) and report speed (expected `≥1.5×` PGN, parity on FEN) — verification: `npm run bench:real -- --suite chessjs --quick` shows gate table `✓/✗` and writes `bench/results/chessjs-*.md`, and `bench/bench-real.mjs` summary includes `chessjs` lane

## 6. Validation, a11y, and bundle

- [ ] 6.1 Run `npm run typecheck` (TS strict ES2020, `verbatimModuleSyntax`/`isolatedModules`), `rg -n "chessops|pgn-chess-tree|chess\.js|GPL|BigInt" src/` empty, and `rg -n "chessops" bench/magic-tables/` empty — verification: `npm run typecheck` exits 0 and all four `rg` return empty
- [ ] 6.2 Run `bench/bench-real.mjs --quick` (all 13 + new chessjs gates) and `bench/bundle` gate: `purechess/core` gz ≤120% of `chessops` Chess-import gz (118% in `real-2026-08-30-gates-green.md`), `parsePgn`+Chess960 absent from `core` — verification: `npm run bench:real -- --quick` exits 0 and `node bench/suites/bundle.mjs` shows `parsePgn` absent from `core`
- [ ] 6.3 Flag VoiceOver/NVDA a11y testing for next workstation `purechess-adopt` change: keyboard `[`/`]`/`Alt+` chords, `AriaLiveAnnouncer` via `makeSan` byte-identical for `+`/`#`/`O-O`/`=Q`, `enableArrowMoveShortcuts` OFF by default — verification: `tasks.md` contains "VoiceOver/NVDA" and "[ ]" and "Alt+" keywords and `tests/compat-chessops.mjs` allDests parity still green
