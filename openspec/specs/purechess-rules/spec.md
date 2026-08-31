# purechess-rules Specification

## Purpose
Implements FIDE Laws of Chess 2023 (effective 2023-01-01) plus FIDE Chess960 (Freestyle) Appendix F as a language-neutral rule engine: standard and Chess960 move legality, castling, en passant, promotion, check/stalemate/mate, and draw rules, with X-FEN/Shredder-FEN and SAN/UCI parity for PureChess workstation accessibility and i18n.

## Requirements

### Requirement: Position legality and FEN six-field validation SHALL be enforced

The system SHALL define `Setup` as `{ board: Board, turn: Color, castling: CastlingRights, enPassant: Square | null, halfmove: uint16, fullmove: uint16 }` and SHALL validate FEN on `parseFen` per FIDE Laws 2023. Validation SHALL reject: pawn on back rank (rank 1 or 8), king count ≠2 (one per color), kings adjacent (opposite check impossible at FEN boundary: side not to move king attacked is illegal), oppositeCheck (position where player to move is in check is allowed, but position where opponent's king is in check is illegal — FEN after a move must have side to move not giving check to own king; extra oppositeCheck means kings are in check simultaneously is illegal), `halfmove` not in 0..150, `fullmove` ≥1, piece placement field has 8 ranks of 1-8 + `prnbqk` sum 8 per rank, `enPassant` square must be rank 6 if White to move or rank 3 if Black to move.

The `enPassant` square SHALL be **accepted even when no legal capture exists** (chessops-compatible): real-world corpora (lichess PGN FENs after any double push) and purechess's own `makeFen` output contain unreachable ep squares, and rejecting them breaks round-trip for ~4.7% of real-game positions. `makeFen` SHALL emit the stored ep square as-is. A `parseFen(fen, { strict: true })` option MAY additionally require a pseudo-legal capturer (previous behavior) for callers that need FIDE-strict validation.

Data types are language-neutral tables, not code:

| Type | Values |
|------|--------|
| `Square` | `0..63` enumerated `A1=0, B1=1, C1=2, D1=3, E1=4, F1=5, G1=6, H1=7, A2=8, ... H8=63` |
| `Color` | `White=0, Black=1` |
| `Role` | `Pawn=0, Knight=1, Bishop=2, Rook=3, Queen=4, King=5` |
| `Piece` | `{ color: Color, role: Role }` |
| `FenError` | discriminated `code` string mapping to i18n keys `purechess.fen.<code>` |

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
- **WHEN** `parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e5 0 1")` runs (ep square `e5` is on the wrong rank for White to move — rank 6, index 5, is required)
- **THEN** the result is `Err` with the ep error code (`fen/enPassantUncapturable`) — structural ep validation (rank + side to move) remains unconditional; only the capturability check moves behind `strict`

### Requirement: Castling SHALL follow FIDE standard and Chess960 truth tables with king ending on g1/c1

The system SHALL implement castling per FIDE Laws 2023 Article 3.8 and Appendix F (Chess960) with the truth tables below unchanged. **Castling SHALL use exactly ONE canonical move representation across the entire public API and internal movegen** — decided by the ADR-013 bake-off (measured on `allDests`/`makeMove`/`parseSan`/`makeSan`/`perft`) and recorded in the amended ADR-013:

- **Normalized landing square** (`e1g1`/`e1c1`, current ADR-013): `dests`/`allDests` emit the landing square, `makeMove` detects a two-square king move toward an own rook with castling right and completes the rook move, `makeUci` emits `e1g1`.
- **King-captures-rook square** (`e1h1`/`e1a1`, chessops-style): `dests`/`allDests` emit the rook square, `makeMove` plays king-and-rook directly, `makeUci` emits `e1h1` (with an ADR-specified engine-facing UCI boundary if engines require `e1g1`).

Whichever wins the bake-off: `makeMove`/`play` SHALL always complete the rook relocation and clear rights; `parseSan` SHALL resolve `O-O`/`O-O-O` to the canonical move; `makeSan` SHALL emit `O-O`/`O-O-O` (never `Kg1`/`Kxh1`) for a castling move in the canonical representation; and the internal `perft` movegen SHALL use the same representation and apply path — no second castling code path. For Chess960: input castling remains king-captures-rook (E1→H1 tolerated), normalized after `play` (king on G1/C1); the 960 output representation follows the same bake-off decision. **Bake-off outcome (ADR-013 as amended, 2026-08-30):** the king-captures-rook square won (equal-or-faster on every measured workload; ties break toward it) — `dests`/`allDests`/`makeUci` emit the rook square, both input forms (`e1h1` and `e1g1`) are accepted everywhere, and UCI engine communication converts to `e1g1` at the engine boundary.

| Condition | Standard | Chess960 |
|-----------|----------|----------|
| King and chosen rook have not moved (castling right present) | `castling.whiteKing` etc | `castling file letter` present and rook origin still has rook of same color |
| Squares between king and rook are empty (excluding endpoints) | `B1` between for queen-side etc truth table | per 960 start squares, computed via `between(king, rook)` |
| King not in check, and squares king traverses (including destination `G1/C1` and intermediate `F1/D1`) are not attacked by opponent | per `kingAttackers` | same, but king traversal squares are `G1`/`C1` path regardless of rook start file |
| No piece attacks those traversal squares | via `isAttacked` | same |
| After move, king and rook end on fixed squares `G1/C1` and `F1/D1` (White) / `G8/C8` / `F8/D8` (Black) regardless of start files | fixed | fixed (FIDE 960 law) |

SAN for 960 SHALL normalize `O-O`/`O-O-O` on output (letter `O`, not zero `0-0` tolerant on input), and `makeSan` for `E1→H1` rook capture in 960 SHALL produce `O-O` not `Kxh1`.

#### Scenario: makeMove completes the rook move for the canonical representation
- **WHEN** `makeMove(parseFen("r3k2r/8/8/8/8/8/8/3K4 b kq - 1 1"), canonicalBlackQueensideCastling)` runs
- **THEN** the resulting FEN is `2kr3r/8/8/8/8/8/8/3K4 w - - 2 2` (king c8 AND rook d8), not `r1k4r/…`, and kingside gives `r4rk1/…`

#### Scenario: Perft node counts match the published corpus on castling-heavy positions
- **WHEN** `bench/suites/perft.mjs` runs every FEN in `perftsuite.epd` (126) and `wac_150.epd` (150) at depth ≤4 against chessops and the published values
- **THEN** there are 0 mismatches, including Kiwipete d4 = 4,085,603, `r3k2r/8/8/8/8/8/8/4K3 w kq` d3 = 782, and `4k3/8/8/8/8/8/8/R3K2R w KQ` d4 = 17,945

#### Scenario: SAN renders castling as O-O in the canonical representation
- **WHEN** `makeSan(canonicalCastlingMove, pos)` runs for white kingside castling (`pos` = `r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1`)
- **THEN** the output is exactly `O-O` (not `Kg1` or `Kxh1`) and `parseSan("O-O")` resolves to the canonical move, and `makeUci` emits the ADR-013-amended string consistently

#### Scenario: Standard O-O legal when path clear and not in check
- **WHEN** position is `r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1` and White plays `O-O` (via `parseSan("O-O")` or the canonical UCI form per the ADR-013 amendment)
- **THEN** `isLegal` returns true, `play` results in king on `G1`, rook on `F1`, castling rights `K` removed, and `makeFen` emits `r3k2r/8/8/8/8/8/8/R4RK1 b kq - 0 1`

#### Scenario: Chess960 X-FEN HAha input accepted and normalized to X-FEN output
- **WHEN** `parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1", { chess960:true })` is called (Shredder `KQkq` equivalent to `HAha` for standard start)
- **THEN** result is `Ok` with `castling` containing rook `H1` and `A1` origins, and `makeFen` returns `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1` not `KQkq`

#### Scenario: Chess960 king-captures-rook input normalized to O-O with king ending g1
- **WHEN** position is Chess960 start `bqknrbrn/pppppppp/8/8/8/8/PPPPPPPP/BQKNRBRN w Gg - 0 1` (king on C1 file? actual 960) and UCI `e1h1` (king on e1 captures rook on h1) is played
- **THEN** `parseUci("e1h1")` in 960 mode is legal castling, `play` moves king to `G1` and rook to `F1`, and `makeSan` returns `O-O`

#### Scenario: Castling through check is illegal
- **WHEN** position `r3k2r/8/8/8/1b6/8/8/R3K2R w KQkq - 0 1` where bishop on b4 attacks `F1`
- **THEN** `dests(E1)` does NOT contain `G1` and `isLegal(O-O)` is false with error code `purechess.castling.throughCheck` mapped to `en/ru/he`

### Requirement: En passant, promotion, double pawn push SHALL follow FIDE Articles 3.7 and 3.9

The system SHALL allow: pawn moves one forward if dest empty, two forward from starting rank (rank 2 White, rank 7 Black) if both squares empty and sets `enPassant` to square behind pawn (rank 3 White double, rank 6 Black); en passant capture is legal only immediately after opponent double push, capture square is diagonal to pawn and `enPassant` square, and pawn captured is on `enPassant` rank adjacent; promotion on reaching back rank (rank 8 White, rank 1 Black) SHALL require promotion role `Queen|Rook|Bishop|Knight` (underpromotion allowed) and in SAN `=Q|R|B|N`; `O-O` tolerance `0-0`/`0-0-0` on input.

#### Scenario: En passant capture is legal only on next move
- **WHEN** sequence `e2e4` (sets `enPassant=e3`), Black `d7d5`, White `e4d5` en passant? Actually White pawn on e4 captures Black pawn double from d7 to d5 via `e4xd6`? Let's use standard: White pawn `E5=36`, Black pawn `D7=51` pushes to `D5=35` sets `enPassant=D6=43`, White `E5×D6` en passant captures
- **THEN** `isLegal({from:E5,to:D6,captureEnPassant:true})` is true only when `enPassant=D6` and after any other move `enPassant` resets to null and same capture is illegal

#### Scenario: Promotion requires role and produces correct SAN and FEN
- **WHEN** position `8/4P3/8/8/8/8/8/4K2k w - - 0 1` pawn on `E7=52` pushes to `E8=60` with `promotion=Queen`
- **THEN** `play` replaces pawn with queen on `E8`, `makeSan` returns `e8=Q+` or `e8=Q#` if mate, `makeFen` shows `4Q3` on rank 8, and `parseSan("e8=Q")` re-parses to same move; `e8` without `=Q` is `Err(purechess.san.missingPromotion)`

#### Scenario: Zero castling tolerance
- **WHEN** `parseSan("0-0")` and `parseSan("0-0-0")` are called in standard position with castling rights
- **THEN** both parse as `O-O` and `O-O-O` respectively and `makeSan` outputs `O-O` (letter O)

### Requirement: Check, checkmate, stalemate, and insufficient material SHALL be detected per FIDE 5.1/5.2

The system SHALL expose `isCheck(pos): boolean` (kingAttackers of side to move king nonempty), `isCheckmate(pos): boolean` (`isCheck` and `dests` empty for side to move), `isStalemate(pos): boolean` (`!isCheck` and `dests` empty), `isInsufficientMaterial(pos): boolean` (king vs king, king+bishop vs king, king+knight vs king, king+bishop vs king+bishop with same color bishops). Draw detection helpers SHALL be pure and not mutate position.

#### Scenario: Starting position is not check or mate
- **WHEN** `isCheck(startpos)` and `isCheckmate(startpos)` and `isStalemate(startpos)` are evaluated
- **THEN** all are false and `dests` for startpos contains 20 moves

#### Scenario: Fool's mate is checkmate
- **WHEN** position after `1. f3 e5 2. g4 Qh4#` FEN `rnbqkbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3` is evaluated
- **THEN** `isCheck` is true, `isCheckmate` is true, `isStalemate` false, and `AriaLiveAnnouncer` would announce "Checkmate. Black wins." via `useChessMoveAnnouncer` contract (keyboard `[`/`]` remain reachable, announcement short and queue-safe)

#### Scenario: Stalemate detection
- **WHEN** position `7k/5Q2/6K1/8/8/8/8/8 b - - 0 1` Black to move king `H8` has no legal moves and not in check
- **THEN** `isStalemate` is true, `isCheck` false, `isCheckmate` false

#### Scenario: Insufficient material
- **WHEN** position `8/8/8/4k3/8/8/8/4K3 w - - 0 1` (only kings) is evaluated
- **THEN** `isInsufficientMaterial` is true; for `8/8/8/4k3/8/5B2/8/4K3 w - - 0 1` (White bishop) also true; for `8/8/8/4k3/8/5N2/8/4K3` (knight) true; for bishops opposite colors `8/8/8/4k3/2B5/8/5b2/4K3` with bishops same color false? Actually same color bishops insufficient, opposite color sufficient → `isInsufficientMaterial` false

### Requirement: Fifty-move, seventy-five-move, threefold and fivefold repetition draws SHALL be detectable via Setup counters

The system SHALL track `halfmove` clock (plies since pawn move or capture, reset to 0 on those events) and fullmove number. `isFiftyMoveDraw(pos): boolean` when `halfmove >=100` (claimable), `isSeventyFiveMoveDraw` when `halfmove >=150` (automatic per 2023). `isThreefoldRepetition(history: Setup[]): boolean` when same position (board, turn, castling, enPassant) occurs 3 times, `isFivefold` when 5 times. Repetition SHALL use Zobrist hashing via board `occupied` etc but spec is language-neutral: equality defined as `board` identical, `turn` identical, `castling` identical, `enPassant` identical (not halfmove).

#### Scenario: Fifty-move counter resets on pawn move and capture
- **WHEN** `halfmove=10` and White plays `e2e4` pawn double
- **THEN** next `Setup.halfmove` is 0; when `halfmove=99` and non-pawn non-capture move played, `halfmove=100` and `isFiftyMoveDraw` true

#### Scenario: Threefold repetition detected
- **WHEN** history contains `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1` as startpos, then `Ng1f3 Ng8f6` back and forth three times
- **THEN** `isThreefoldRepetition(history)` becomes true after third occurrence, and announcer would announce "Threefold repetition" via `AriaLiveAnnouncer` without disrupting `[`/`]` keyboard navigation (arrow shortcuts off by default, `enableArrowMoveShortcuts` flag)

### Requirement: SAN semantics SHALL produce byte-identical check/mate and disambiguation vs chessops/python-chess

The system SHALL implement `parseSan(san: string, pos: Position): Result<Move>` and `makeSan(move: Move, pos: Position): string` where SAN is FIDE Appendix C: `KQRBN` piece letter (pawn omitted), `x` capture, destination `a1..h8`, `+` check, `#` mate, `=Q|R|B|N` promotion, disambiguation minimal file then rank then both when two same-role pieces can reach same dest, `O-O`/`O-O-O`. `parseSan` SHALL be tolerant of `0-0`/`0-0-0` (zero) on input, `makeSan` SHALL emit `O-O` (letter). `+`/`#` suffix SHALL be byte-identical to `chessops` for `bench/bench-fen-san.mjs` parity (so `useChessMoveAnnouncer` announcements remain correct). UCI semantics `parseUci(uci: string): Result<Move>` where `uci` is `e2e4`, `e7e8q`, `e1g1` for standard castling, `e1h1` for 960 king-captures-rook — language-neutral table.

| SAN example | Meaning |
|-------------|---------|
| `Nf3` | Knight to f3 |
| `Nbd2` | Knight from b-file to d2 (disambiguation) |
| `R1a3` | Rook from rank 1 to a3 |
| `Qh4e1` | Queen from h4 to e1 (file+rank needed) |
| `exd5` | Pawn from e-file captures on d5 |
| `e8=Q+` | Pawn promotes to queen on e8 with check |
| `O-O#` | King-side castle mate |

#### Scenario: Disambiguation minimal file
- **WHEN** position has knights on `B1=1` and `G1=6` both can go to `D2=11` (knights attack d2) and SAN `Nd2` is ambiguous
- **THEN** `parseSan("Nd2", pos)` returns `Err(purechess.san.ambiguous)` with i18n keys, `parseSan("Nbd2")` resolves to `B1→D2`, `parseSan("Ngf2")` doesn't exist, and `makeSan(B1→D2)` outputs `Nbd2`

#### Scenario: Check and mate suffix byte-identical
- **WHEN** position `r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3` White plays `Bf1c4` not check, then Black `Nf6g4` not check, but `Qh5xf7#` is mate
- **THEN** `makeSan` for `Qxf7#` includes `#` exactly, and comparison vs `chessops` `makeSan` for 10k random FENs in `bench-fen-san.mjs` is byte-identical including `+`/`#`

#### Scenario: UCI promotion lower-case
- **WHEN** `parseUci("e7e8q")` and `parseUci("e7e8Q")` are called
- **THEN** both parse to promotion queen, `makeUci` emits `e7e8q` lower-case, and `parseUci("e1g1")` in standard and `parseUci("e1h1")` in 960 both resolve to king-side castling with `kingAttackers` not giving through-check

### Requirement: Chess960 X-FEN vs Shredder-FEN SHALL be round-trip correct and keyboard/a11y parity kept

The system SHALL support `chess960:true` flag for `parseFen`/`makeFen`. Input SHALL accept both `KQkq` (Shredder, only for standard rook files) and `HAha` (X-FEN file letters) case-sensitive; output SHALL be X-FEN file letters by default. `makeFen` with `shredder:true` SHALL emit `KQkq` when rooks are on `A/H` files else fallback file letters. Keyboard navigation SHALL remain `Alt+` chords on Windows (never `Ctrl+`), `[`/`]` for move stepping regardless of FEN variant, and board orientation auto by repertoire side (White at bottom for White repertoire) — FEN parsing does not affect orientation.

#### Scenario: Shredder input tolerated but X-FEN output
- **WHEN** `parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", {chess960:true})` and `makeFen(pos)` called without shredder flag
- **THEN** `makeFen` returns `... w HAha - 0 1` (file letters) not `KQkq`, and `parseFen` of that X-FEN round-trips

#### Scenario: Keyboard chords preserved for 960
- **WHEN** user on Windows presses `Alt+G` (repertoire go) while viewing Chess960 position
- **THEN** system does not conflict with NVDA/JAWS browse mode (no `Ctrl+` shortcut) and focus remains in `BoardContainer` with `AriaLiveAnnouncer` announcing "White to move, castling rights H A"

### Requirement: i18n and accessibility SHALL be covered for every user-facing string and keyboard contract

Every `FenError`, `SanError`, `PgnError`, `UciError` code SHALL map to keys `purechess.<module>.<code>` with `en`, `ru`, `he` translations present. No English string hard-coded in logic. Accessibility: board interactions reachable via keyboard (`[` back, `]` forward, `f` flip, `Home` start, `End` end, `Alt+B` board, `Alt+R` repertoire etc per AGENTS.md), `AriaLiveAnnouncer` announcements short and queue-safe, `enableArrowMoveShortcuts` OFF by default (screen readers need arrows). SAN/move announcements via `useChessMoveAnnouncer` SHALL remain byte-identical after purechess swap.

#### Scenario: i18n keys exist for all error codes
- **WHEN** auditor runs `npm run test:i18n` checking `src/locales/{en,ru,he}/purechess.json`
- **THEN** every `FenError` `code` like `fen/pawnOnBackRank`, `san/ambiguous`, `pgn/unexpectedToken` has non-empty translation in all three locales

#### Scenario: AriaLive announcement does not disrupt screen reader flow
- **WHEN** `makeSan` produces `Qxf7#` and `useChessMoveAnnouncer` announces "Queen takes f7. Checkmate."
- **THEN** announcement is via `AriaLiveAnnouncer` with `polite` live region, queued, not `assertive`, and `Alt+` navigation still works on Windows without triggering NVDA browse mode, and `autoFocus` is not used on board after move (smart focus management per AGENTS.md)

### Requirement: Implementation sources for rules SHALL be restricted — GPL, node_modules, and internet are forbidden

The implementation of FEN/SAN/UCI and check/mate/draw logic SHALL be derived only from `openspec/specs/purechess-rules/spec.md` language-neutral tables, FIDE Laws 2023 (`refs/docs-refs/FIDE-Laws-2023.notes.md`), and `refs/docs-refs/` notes. It SHALL NOT read, import, or copy any file from `node_modules/` (including `node_modules/chessops`), `refs/gpl-only/`, or any internet URL. `src/` SHALL contain no GPL text and `rg -n "chessops" src/` SHALL be empty. CI SHALL fail if any implementation commit contains GPL-derived code.

#### Scenario: GPL source rejection
- **WHEN** an implementation agent attempts to implement `parseFen` by reading `node_modules/chessops/dist/esm/fen.js`
- **THEN** the agent refuses, instead implements from the six-field FEN table in this spec and `refs/docs-refs/`, and audit finds no `chessops` string in `src/`

### Requirement: Move Generation and Perft SHALL Calculate 100% Genuine Tree Traversals Without Hardcoded Shortcuts

The system SHALL execute full legal move generation and recursive perft traversals dynamically for all positions, depths, and variants. The engine SHALL NOT short-circuit startpos or any other position via pre-computed lookup tables or hardcoded node count constants (`START_PERFT`).

#### Scenario: Full dynamic calculation for startpos perft
- **WHEN** `perft(startpos, depth)` is invoked for any depth 1 through 6
- **THEN** the engine generates every legal branch dynamically from the live bitboard state, matching the reference node counts (e.g. depth 5 = 4,865,609; depth 6 = 119,060,324) without reading from constant arrays
