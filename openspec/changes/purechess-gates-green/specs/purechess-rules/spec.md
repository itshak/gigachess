# purechess-gates-green Specification Delta

## MODIFIED Requirements

### Requirement: Position legality and FEN six-field validation SHALL be enforced

The system SHALL define `Setup` as `{ board: Board, turn: Color, castling: CastlingRights, enPassant: Square | null, halfmove: uint16, fullmove: uint16 }` and SHALL validate FEN on `parseFen` per FIDE Laws 2023. Validation SHALL reject: pawn on back rank (rank 1 or 8), king count ≠2 (one per color), kings adjacent (opposite check impossible at FEN boundary: side not to move king attacked is illegal), oppositeCheck (position where player to move is in check is allowed, but position where opponent's king is in check is illegal — FEN after a move must have side to move not giving check to own king; extra oppositeCheck means kings are in check simultaneously is illegal), `halfmove` not in 0..150, `fullmove` ≥1, piece placement field has 8 ranks of 1-8 + `prnbqk` sum 8 per rank, `enPassant` square must be rank 6 if White to move or rank 3 if Black to move.

The `enPassant` square SHALL be **accepted even when no legal capture exists** (chessops-compatible): real-world corpora (lichess PGN FENs after any double push) and purechess's own `makeFen` output contain unreachable ep squares, and rejecting them breaks round-trip for ~4.7% of real-game positions. `makeFen` SHALL emit the stored ep square as-is. A `parseFen(fen, { strict: true })` option MAY additionally require a pseudo-legal capturer (previous behavior) for callers that need FIDE-strict validation.

#### Scenario: Unreachable en-passant square is accepted and round-trips
- **WHEN** `parseFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPP1PPPP/RNBQKBNR b KQkq e3 0 1")` runs (black to move, no black pawn can capture on e3)
- **THEN** the result is `Ok`, matching chessops acceptance, and `makeFen` re-emits `... b KQkq e3 0 1` byte-identically

#### Scenario: Strict option retains capturable check
- **WHEN** `parseFen(fen, { strict: true })` runs on the same FEN
- **THEN** the result is `Err` with code `purechess.fen.enPassantNotCapturable` mapped to `en/ru/he` keys

#### Scenario: Real-game corpus round-trips at 100%
- **WHEN** the `fen-san-uci` real-world suite runs with ≥10,000 FENs replayed from lichess games
- **THEN** purechess/chessops parse agreement is 100% on ep-square FENs and the `purechess-benchmarks` fen-parity gate is ≥99% overall (no longer dominated by ep rejections)

#### Scenario: Valid standard startpos FEN parses
- **WHEN** `parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")` is called
- **THEN** result is `Ok(Setup)` with `turn=White`, `castling={whiteKing, whiteQueen, blackKing, blackQueen}`, `enPassant=null`, `halfmove=0`, `fullmove=1` and `board.king` has exactly 2 bits

#### Scenario: FEN pawn on back rank rejected with localized error
- **WHEN** `parseFen("P7/8/8/8/8/8/8/8 w - - 0 1")` is called
- **THEN** result is `Err(FenError{ code: "fen/pawnOnBackRank", message: i18n purechess.fen.pawnOnBackRank })` and Russian key `purechess.fen.pawnOnBackRank` and Hebrew key exist in `en, ru, he` bundles and no English string is hard-coded in logic

#### Scenario: FEN kings count ≠2 rejected
- **WHEN** `parseFen("8/8/8/8/8/8/8/K7 w - - 0 1")` is called
- **THEN** result is `Err(FenError{ code: "fen/kingsCount" })` mapping to `purechess.fen.kingsCount` in all three locales

#### Scenario: FEN oppositeCheck (both kings in check) rejected
- **WHEN** `parseFen("4k3/8/8/8/8/8/8/4RK2 w - - 0 1")` where White rook on e1 gives check to Black king on e8 and Black rook would give check to White king simultaneously after placement is evaluated
- **THEN** result is `Err(FenError{ code: "fen/oppositeCheck" })`

#### Scenario: FEN en passant square on wrong rank rejected
- **WHEN** `parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 1")` runs (ep square on the wrong rank for White to move)
- **THEN** result is `Err` with the ep error code — structural ep validation (rank + side to move) remains unconditional; only the capturability check moves behind `strict`

### Requirement: Castling SHALL follow FIDE standard and Chess960 truth tables with king ending on g1/c1

The system SHALL implement castling per FIDE Laws 2023 Article 3.8 and Appendix F (Chess960) with the truth tables below unchanged. **Castling SHALL use exactly ONE canonical move representation across the entire public API and internal movegen** — decided by the ADR-013 bake-off (measured on `allDests`/`makeMove`/`parseSan`/`makeSan`/`perft`) and recorded in the amended ADR-013:

- **Normalized landing square** (`e1g1`/`e1c1`, current ADR-013): `dests`/`allDests` emit the landing square, `makeMove` detects a two-square king move toward an own rook with castling right and completes the rook move, `makeUci` emits `e1g1`.
- **King-captures-rook square** (`e1h1`/`e1a1`, chessops-style): `dests`/`allDests` emit the rook square, `makeMove` plays king-and-rook directly, `makeUci` emits `e1h1` (with an ADR-specified engine-facing UCI boundary if engines require `e1g1`).

Whichever wins the bake-off: `makeMove`/`play` SHALL always complete the rook relocation and clear rights; `parseSan` SHALL resolve `O-O`/`O-O-O` to the canonical move; `makeSan` SHALL emit `O-O`/`O-O-O` (never `Kg1`/`Kxh1`) for a castling move in the canonical representation; and the internal `perft` movegen SHALL use the same representation and apply path — no second castling code path. For Chess960: input castling remains king-captures-rook (E1→H1 tolerated), normalized after `play` (king on G1/C1); the 960 output representation follows the same bake-off decision.

Castling is legal only when all truth-table conditions hold (unchanged):

| King and chosen rook have not moved (castling right present) | `castling.whiteKing` etc | `castling file letter` present and rook origin still has rook of same color |
|---|---|---|
| No pieces between king and rook (standard chess; 960 per Appendix F betweenness) | empty squares rule | — |
| King not in check, does not pass through or land on an attacked square | `kingAttackers` checks | through-check error `purechess.castling.throughCheck` |

SAN for 960 SHALL normalize `O-O`/`O-O-O` on output (letter `O`, not zero `0-0` tolerant on input), and `makeSan` for `E1→H1` rook capture in 960 SHALL produce `O-O` not `Kxh1`.

#### Scenario: makeMove completes the rook move for the canonical representation
- **WHEN** `makeMove(parseFen("r3k2r/8/8/8/8/8/8/3K4 b kq - 1 1"), canonicalBlackQueensideCastling)` runs
- **THEN** the resulting FEN is `2kr3r/8/8/8/8/8/8/3K4 w - - 2 2` (king c8 AND rook d8), not `r1k4r/…`, and kingside gives `r4rk1/…`

#### Scenario: Perft node counts match the published corpus on castling-heavy positions
- **WHEN** `bench/suites/perft.mjs` runs every FEN in `perftsuite.epd` (126) and `wac_150.epd` (150) at depth ≤4 against chessops and the published values
- **THEN** there are 0 mismatches, including Kiwipete d4 = 4,085,603, `r3k2r/8/8/8/8/8/8/4K3 w kq` d3 = 782, and `4k3/8/8/8/8/8/8/R3K2R w KQ` d4 = 17,945

#### Scenario: SAN renders castling as O-O in the canonical representation
- **WHEN** `makeSan(canonicalCastlingMove, pos)` runs for white kingside castling (`pos` = `r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1`)
- **THEN** the output is exactly `O-O` (not `Kg1` or `Kxh1`) and `parseSan("O-O", pos)` resolves to the canonical move, and `makeUci` emits the ADR-013-amended string consistently

#### Scenario: Through-check castling still rejected with i18n error
- **WHEN** `dests(E1)` is computed where E1→G1 passes through an attacked square
- **THEN** `dests(E1)` does NOT contain the castling destination and `isLegal(O-O)` is false with error code `purechess.castling.throughCheck` mapped to `en/ru/he`

#### Scenario: Standard O-O legal when path clear and not in check
- **WHEN** position is `r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1` and White plays `O-O` (via `parseSan("O-O")` or the canonical UCI form per the ADR-013 amendment)
- **THEN** `isLegal` returns true, `play` results in king on `G1`, rook on `F1`, castling rights `K` removed, and `makeFen` emits `r3k2r/8/8/8/8/8/8/R4RK1 b kq - 0 1`

#### Scenario: Chess960 X-FEN HAha input accepted and normalized to X-FEN output
- **WHEN** `parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1", { chess960:true })` is called (Shredder `KQkq` equivalent to `HAha` for standard start)
- **THEN** result is `Ok` with `castling` containing rook `H1` and `A1` origins, and `makeFen` returns `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1` not `KQkq`

#### Scenario: Chess960 king-captures-rook input normalized to O-O with king ending g1
- **WHEN** position is Chess960 start `bqknrbrn/pppppppp/8/8/8/8/PPPPPPPP/BQKNRBRN w Gg - 0 1` and UCI `e1h1` (king on e1 captures rook on h1) is played
- **THEN** `parseUci("e1h1")` in 960 mode is legal castling, `play` moves king to `G1` and rook to `F1`, and `makeSan` returns `O-O`

#### Scenario: Castling through check is illegal
- **WHEN** position `r3k2r/8/8/8/1b6/8/8/R3K2R w KQkq - 0 1` where bishop on b4 attacks `F1`
- **THEN** `dests(E1)` does NOT contain `G1` and `isLegal(O-O)` is false with error code `purechess.castling.throughCheck` mapped to `en/ru/he`
