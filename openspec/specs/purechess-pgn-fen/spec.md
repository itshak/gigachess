# purechess-pgn-fen Specification

## Purpose
Provides streaming PGN, FEN, SAN and UCI parsing and generation as language-neutral, pure, Result-typed APIs with PGN GameTree re-specified from pgn-chess-tree behavior (not source), FIDE/Shredder-FEN dual handling, and perft oracle for movegen correctness while preserving keyboard and screen-reader parity.

## Requirements

### Requirement: PGN SHALL follow ABNF derived from Steven Edwards PGN Standard and be tolerant of common Lichess variants

The system SHALL implement PGN text conforming to ABNF (language-neutral, no code copy), derived from `refs/docs-refs/cm-pgn-notes.md` and FIDE Laws:

```abnf
PGN           = *(Header CRLF) CRLF Movetext
Header        = "[" SPACES Key SPACES DQUOTE Value DQUOTE "]" SPACES CRLF
Key           = 1*%x30-39 / %x41-5A / %x5F / %x61-7A  ; alphanumeric plus _
Value         = *(%x20-21 / %x23-5B / %x5D-7E / %x5C.22) ; any except DQUOTE except escaped \"
DQUOTE        = %x22
Movetext      = *(Element SPACES) (Result SPACES)
Element       = MoveNumber / SAN / NAG / CommentBrace / CommentLine / Variation
MoveNumber    = 1*DIGIT "." 1*"." SPACES   ; "1." "12..." "
SAN           = PieceDest ; see purechess-rules SAN semantics
NAG           = "$" 1*DIGIT / "!" / "?" / "!!" / "!?" / "?!" / "??" ; canonical $0..$140
CommentBrace  = "{" *(%x20-7E except "}") "}"
CommentLine   = ";" *(%x20-7E) CRLF
Variation     = "(" SPACES *(Element SPACES) ")" SPACES
Result        = "*" / "1-0" / "0-1" / "1/2-1/2"
CRLF          = %x0A / %x0D.0A
SPACES        = *(%x20 / %x09 / CRLF)
PieceDest     = See SAN in purechess-rules
```

Seven Tag Roster headers (`Event`, `Site`, `Date`, `Round`, `White`, `Black`, `Result`) SHALL be accepted plus `FEN`/`SetUp` for Chess960 starting positions and any custom keys. `%` escape at start of line SHALL be treated as line comment when parser option `allowPercentEscape:true`. Headers case-sensitive, order preserved in `Map`. Movetext SHALL tolerate missing move numbers, extra whitespace, and `0-0`/`0-0-0` castle SAN tolerance per `purechess-rules`.

#### Scenario: Standard PGN with headers and result parses
- **WHEN** `parsePgn("[Event \"Test\"]\n[Result \"*\"]\n\n1. e4 e5 2. Nf3 Nc6 *\n")` is called
- **THEN** result is `Ok(GameTree)` with `headers.get("Event")==="Test"`, `moves.length===4`, `moves[0].san==="e4"`, `moves[1].san==="e5"`, `moves[2].san==="Nf3"`, `headers.get("Result")==="*"` and `makePgn(tree)` produces text containing `[Event "Test"]` and `1. e4 e5 2. Nf3 Nc6 *` that re-parses to byte-identical `Tree` (modulo whitespace normalization)

#### Scenario: PGN with comments, variations, NAGs parses and round-trips
- **WHEN** `parsePgn("1. e4 {King pawn} e5 (1... c5) 2. Nf3 $1 *")` is called
- **THEN** `tree.moves[0].san==="e4"`, `tree.moves[0].comments[0]==="King pawn"`, `tree.moves[1].san==="e5"`, `tree.moves[1].variations[0].moves[0].san==="c5"`, `tree.moves[2].san==="Nf3"`, `tree.moves[2].nags[0]===1`, and `makePgn(tree)` contains `{King pawn}` and `(1... c5)` and `$1`

#### Scenario: Lichess tolerance - missing move numbers and extra whitespace accepted
- **WHEN** `parsePgn("e4 e5 Nf3 Nc6 *")` without move numbers is called
- **THEN** parser still yields 4 moves with `san` sequence `e4,e5,Nf3,Nc6` and `Result *`, no error

### Requirement: PGN parser SHALL be streaming chunk state machine like cm-pgn/python-chess and expose GameTree shape

The system SHALL define `type GameTree = { headers: Map<string,string>, moves: Array<{ san: string, nags: number[], comments: string[], variations: GameTree[] }> }` re-specified from `pgn-chess-tree` behavior (author-owned AGPL-tainted, never copy source — only this shape and streaming invariants). Parser SHALL be incremental: `class PgnParser { feed(chunk: string): void; finish(): Result<GameTree, PgnError>; }` or functional `parsePgn(pgn: string): Result<GameTree, PgnError>` built on same state machine. State enumeration (language-neutral table):

| State | Consumes | Transitions |
|-------|----------|-------------|
| `HeaderKey` | `[` then key until SP | `HeaderValue` on `"` |
| `HeaderValue` | `"` until closing `"` handling `\"` escape | `HeaderEnd` on `]` |
| `Movetext` | SAN/NAG/MoveNumber/Result | `CommentBrace` on `{`, `CommentLine` on `;`, `VariationStart` on `(`, `VariationEnd` on `)` |
| `CommentBrace` | `{` until `}` (nested `{` not allowed, `}` ends) | `Movetext` |
| `VariationDepth` | `(` increments depth, `)` decrements | `Movetext` when depth 0 |
| `StringEscape` | `\` inside `Value` | back to `HeaderValue` |

`feed` SHALL append `chunk` to `buffer` and advance without re-scanning from start (O(n) total). `variations` are nested `GameTree` where each variation's first move may be `...` black move number ellipsis (`1... e5`). `comments` preserve order, `nags` preserve order as numbers. Errors return `Err(PgnError{ code: "pgn/unexpectedToken" | "pgn/unclosedVariation" | "pgn/unclosedComment" | "pgn/invalidHeader" | "pgn/missingResult" })` mapping to i18n `purechess.pgn.<code>`.

Performance SHALL gate: `games/s` ≥50% faster than `chessops` on pinned 100k corpus (`bench/data/lichess_db.sample.pgn`), peak heap ≤110% via `bench/bench-pgn.mjs`; `makePgn(parsePgn(pgn))` round-trip for legal games identical game counts.

#### Scenario: Chunked feeding yields same tree as whole string
- **WHEN** PGN `1. e4 e5 (1... c5 {Sicilian}) 2. Nf3 *` is fed as chunks `["1. e4 ", "e5 (1", "... c5 {Sic", "ilian}) 2. Nf3 *"]` via `parser.feed` sequentially then `finish`
- **THEN** result equals `parsePgn` of concatenated string, with one variation containing `c5` and comment `Sicilian`, no data loss

#### Scenario: Nested variations handled
- **WHEN** `parsePgn("1. e4 e5 (1... c5 (1... e6)) 2. Nf3 *")` is called
- **THEN** `moves[1].variations[0].moves[0].san==="c5"` and that move's `variations[0].moves[0].san==="e6"` depth 2 nested

#### Scenario: MakePgn normalizes but re-parses
- **WHEN** `tree = parsePgn("[Event \"A\"]\n\n1.   e4   e5 *\n")` then `pgn2 = makePgn(tree)` then `tree2 = parsePgn(pgn2)`
- **THEN** `tree.headers` equals `tree2.headers`, `tree.moves` SAN sequence equal, and `bench/bench-pgn.mjs` reports identical game counts vs `chessops` for corpus

#### Scenario: Streaming does not allocate per chunk beyond buffer
- **WHEN** 100k-game PGN streamed in 8 KB chunks vs whole-file
- **THEN** peak heap per `bench/bench-pgn.mjs` is ≤110% of `chessops` and `games/s` higher, proving chunked not whole-file alloc

### Requirement: parseFen and makeFen SHALL be pure Result-typed and handle Shredder vs X-FEN per purechess-rules

The system SHALL expose `parseFen(fen: string, options?: { chess960?: boolean }): Result<Setup, FenError>` and `makeFen(setup: Setup, options?: { shredder?: boolean, chess960?: boolean }): string` where `fen` is six fields: `piecePlacement activeColor castling enPassant halfmove fullmove`. `piecePlacement` 8 ranks `/` separated, `1-8` empty, `prnbqkPRNBQK`. `activeColor` `w|b`, `castling` `-` or `KQkq` (Shredder) or `AHah` (X-FEN) tolerant input per `purechess-rules`, `enPassant` `-` or `a3..h6`, `halfmove` `0..150`, `fullmove` `≥1`. On success returns `Setup`; on error returns `Err(FenError)` with code `fen/*` mapping to `purechess.fen.<code>` in `en/ru/he`. `makeFen` emits X-FEN file letters by default when `chess960:true`, Shredder only when `shredder:true`. Functions are pure, never mutate input.

#### Scenario: Startpos FEN round-trips byte-identical via makeFen
- **WHEN** `fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"` and `setup=parseFen(fen).unwrap()` then `makeFen(setup)===fen`
- **THEN** `bench/bench-fen-san.mjs` 10k random FENs report `FEN parse+make` throughput ≥20% faster than `chessops` and outputs byte-identical for legal positions

#### Scenario: Chess960 FEN with X-FEN parses and emits X-FEN
- **WHEN** `parseFen("bqknrbrn/pppppppp/8/8/8/8/PPPPPPPP/BQKNRBRN w Gg - 0 1", {chess960:true})` is called
- **THEN** `Ok` and `makeFen(setup,{chess960:true})` is `"bqknrbrn/pppppppp/8/8/8/8/PPPPPPPP/BQKNRBRN w Gg - 0 1"` (file letters, not `KQkq`)

#### Scenario: Invalid FEN error is Result not throw and localized
- **WHEN** `parseFen("8/8/8/8/8/8/8/8 w - - 0 1")` (no kings) is called
- **THEN** result is `Err` with `code "fen/kingsCount"` and `i18n` keys `purechess.fen.kingsCount` exist in `en` "Kings count must be 2", `ru` "Королей должно быть 2", `he` "חייבים להיות 2 מלכים" (exact strings per locale files)

### Requirement: parseSan/makeSan and parseUci/makeUci SHALL be pure Result-typed with SAN/UCI semantics from purechess-rules

The system SHALL expose `parseSan(san: string, pos: Position): Result<Move, SanError>`, `makeSan(move: Move, pos: Position): string`, `parseUci(uci: string): Result<Move, UciError>`, `makeUci(move: Move): string`. `parseSan` handles disambiguation, `x`, `+`, `#`, `=Q|R|B|N`, tolerant `0-0` → `O-O`; `makeSan` emits canonical `O-O`. `parseUci` lower-case promotion `e7e8q`, castling `e1g1` standard and `e1h1` 960, `makeUci` lower-case. Errors map to `purechess.san.<code>` / `purechess.uci.<code>` in `en/ru/he`. `makeSan` SHALL be byte-identical to `chessops` for `bench/bench-fen-san.mjs` 10k FENs including `+`/`#` so `useChessMoveAnnouncer` stays correct. Keyboard `[`/`]` stepping uses `makeSan` for announcement.

#### Scenario: SAN disambiguation round-trips via makeSan
- **WHEN** position has rooks on `A1` and `H1` both can go to `E1` and move `Rae1` is parsed via `parseSan("Rae1", pos)` then `makeSan` on resulting move
- **THEN** `parseSan` succeeds to `A1→E1`, `makeSan` returns `Rae1` (minimal disambiguation file), and `parseSan("R1e1")` would be `Err san/ambiguous` if both on rank 1

#### Scenario: UCI promotion and castling
- **WHEN** `parseUci("e7e8q")` is called
- **THEN** `Ok` with `promotion=Queen`, `makeUci` returns `e7e8q`; `parseUci("e1g1")` in standard pos is `O-O`, `parseUci("e1h1")` in 960 pos also `O-O` and `makeSan` for both is `O-O`

#### Scenario: SAN check suffix byte-identical
- **WHEN** move `Qh5xf7+` gives check but not mate in pos `r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1` after `Qxf7+`
- **THEN** `makeSan` returns `Qxf7+` with `+`, and `bench/bench-fen-san.mjs` reports SAN byte-identical vs `chessops` for 10k samples (so `AriaLiveAnnouncer` "Queen takes f7. Check." correct)

### Requirement: Result error handling SHALL be exhaustive and never throw for invalid PGN/FEN/SAN/UCI

The system SHALL use `type Result<T,E> = { ok:true, value:T } | { ok:false, error:E }` with `E` discriminated union containing `code` and `message` via i18n. No function SHALL throw on invalid input; exceptions are only for programmer errors (e.g., `Board` invariant violation). All error codes SHALL be kebab-case under `fen/`, `san/`, `uci/`, `pgn/` namespaces and map to `purechess.<ns>.<code>` keys in `en, ru, he`.

#### Scenario: Invalid PGN returns Err not throw
- **WHEN** `parsePgn("1. e4 e5 (unclosed variation *")` is called
- **THEN** result is `Err(PgnError{ code: "pgn/unclosedVariation"})` not exception, and `purechess.pgn.unclosedVariation` has translations

#### Scenario: Result chaining is pure
- **WHEN** `parseFen(...).andThen(setup => parseSan("Nf3", setup))` style (if combinators provided) or manual `if (res.ok)` is used
- **THEN** no mutation, and error codes propagate without throwing, and TypeScript strict exhaustiveness requires handling `ok` branch

### Requirement: Perft oracle SHALL be 119060324 at depth 6 from startpos and gate movegen correctness

The system SHALL expose `perft(pos: Position, depth: uint8): number` (or `bigint` for >6 but depth 6 fits JS number 119060324) that counts leaf nodes via legal move expansion (clone→mutate clone, `isLegal` check). `perft(startpos,0)=1`, `1=20`, `2=400`, `3=8902`, `4=197281`, `5=4865609`, `6=119060324` SHALL hold. Harness `bench/bench-perft.mjs --depth 6 --fen startpos` gates `nodes/s` ≥ parity vs `chessops` (target +15%) and node count exact. This oracle validates `purechess-board-movegen` Black Magic + `purechess-rules` jointly.

#### Scenario: Perft 6 node count exact
- **WHEN** `perft(parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").unwrap(), 6)` is computed
- **THEN** result equals `119060324` exactly (same as `chessops` and Stockfish perft), and `bench/bench-perft.mjs --depth 5` (faster local) equals `4865609`

#### Scenario: Perft with Chess960 start also correct via python-chess oracle
- **WHEN** `perft` for 960 random start `bqknrbrn/... w Gg - 0 1` depth 4 is computed
- **THEN** matches `python-chess` `board.perft(4)` for same FEN with `chess960=True` (property test harness)

### Requirement: i18n and accessibility SHALL be propagated for PGN/FEN/SAN/UCI flows

Every user-facing error from `parsePgn`, `parseFen`, `parseSan`, `parseUci`, `make*` validation SHALL have `en, ru, he` keys. Keyboard `[`/`]` stepping, `Home`/`End` (`Alt+Home` etc) for PGN game navigation, and `AriaLiveAnnouncer` for SAN announcements SHALL remain reachable regardless of PGN variation depth, and `enableArrowMoveShortcuts` OFF by default (arrows reserved for screen reader virtual cursor).

#### Scenario: PGN GameTree navigation via keyboard
- **WHEN** `GameTree` has mainline `1. e4 e5 2. Nf3` and variation `(1... c5)` on `e5`, and user presses `Alt+ArrowRight` or `]` to step forward
- **THEN** focus stays in `BoardContainer`, `AriaLiveAnnouncer` announces `e4`, `e5`, `Nf3` via `useChessMoveAnnouncer` (short, queue-safe), and `Alt+` chords work on Windows without `Ctrl` conflict, and arrow shortcuts disabled unless `enableArrowMoveShortcuts:true`

#### Scenario: i18n for PGN errors
- **WHEN** `parsePgn("[Event \"*\n")` with missing closing `]` is called
- **THEN** `Err` code `pgn/invalidHeader` maps to `purechess.pgn.invalidHeader` with `en` "Invalid header", `ru` "Неверный заголовок", `he` "כותרת לא תקינה"
