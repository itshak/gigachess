# purechess-gates-green Specification Delta

## MODIFIED Requirements

### Requirement: parseFen and makeFen SHALL be pure Result-typed and handle Shredder vs X-FEN per purechess-rules

The system SHALL expose `parseFen(fen: string, options?: { chess960?: boolean, strict?: boolean }): Result<Setup, FenError>` and `makeFen(setup: Setup, options?: { shredder?: boolean, chess960?: boolean }): string` where `fen` is six fields: `piecePlacement activeColor castling enPassant halfmove fullmove`. `piecePlacement` 8 ranks `/` separated, `1-8` empty, `prnbqkPRNBQK`. `activeColor` `w|b`, `castling` `-` or `KQkq` (Shredder) or `AHah` (X-FEN) tolerant input per `purechess-rules`, `enPassant` `-` or `a3..h6`, `halfmove` `0..150`, `fullmove` `≥1`. On success returns `Setup`; on error returns `Err(FenError)` with code `fen/*` mapping to `purechess.fen.<code>` in `en/ru/he`. `makeFen` emits X-FEN file letters by default when `chess960:true`, Shredder only when `shredder:true`. Functions are pure, never mutate input.

Per the `purechess-rules` delta in this change, `enPassant` validation SHALL accept structurally valid ep squares (correct rank for side to move) **even when no legal capture exists** — required so that lichess-style FENs and purechess's own `makeFen` output round-trip; `makeFen` SHALL emit the stored ep square as-is; `strict: true` MAY restore the capturable check. FEN parse→make round-trips SHALL be byte-identical to chessops for all ep-square variants, and `parseFen` SHALL NOT reject any FEN that chessops accepts (parse-agreement parity is a real-world suite gate).

#### Scenario: Startpos FEN round-trips byte-identical via makeFen
- **WHEN** `fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"` and `setup=parseFen(fen).unwrap()` then `makeFen(setup)===fen`
- **THEN** `bench/bench-fen-san.mjs` 10k random FENs report `FEN parse+make` throughput ≥20% faster than `chessops` and outputs byte-identical for legal positions

#### Scenario: Chess960 FEN with X-FEN parses and emits X-FEN
- **WHEN** `parseFen("bqknrbrn/pppppppp/8/8/8/8/PPPPPPPP/BQKNRBRN w Gg - 0 1", {chess960:true})` is called
- **THEN** `Ok` and `makeFen(setup,{chess960:true})` is `"bqknrbrn/pppppppp/8/8/8/8/PPPPPPPP/BQKNRBRN w Gg - 0 1"` (file letters, not `KQkq`)

#### Scenario: Unreachable ep square round-trips byte-identically (chessops parity)
- **WHEN** `fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPP1PPPP/RNBQKBNR b KQkq e3 0 1"` (ep set, no capture possible)
- **THEN** `parseFen(fen)` is `Ok`, `makeFen` re-emits the FEN byte-identically, and chessops `makeFen(parseFen(fen))` equals purechess output

#### Scenario: Invalid FEN error is Result not throw and localized
- **WHEN** `parseFen("8/8/8/8/8/8/8/8 w - - 0 1")` (no kings) is called
- **THEN** result is `Err` with `code "fen/kingsCount"` and `i18n` keys `purechess.fen.kingsCount` exist in `en` "Kings count must be 2", `ru` "Королей должно быть 2", `he` "חייבים להיות 2 מלכים" (exact strings per locale files)

### Requirement: parseSan/makeSan and parseUci/makeUci SHALL be pure Result-typed with SAN/UCI semantics from purechess-rules

The system SHALL expose `parseSan(san: string, pos: Position): Result<Move, SanError>`, `makeSan(move: Move, pos: Position): string`, `parseUci(uci: string): Result<Move, UciError>`, `makeUci(move: Move): string`. `parseSan` handles disambiguation, `x`, `+`, `#`, `=Q|R|B|N`, tolerant `0-0` → `O-O`; `makeSan` emits canonical `O-O`. `parseUci` lower-case promotion `e7e8q`, castling per the ADR-013 canonical representation (standard `e1g1`, 960 `e1h1`/file letters), `makeUci` lower-case and consistent with the canonical representation. **`makeSan` SHALL emit `O-O`/`O-O-O` for a castling move given in the canonical representation** (never `Kg1`/`Kxh1`), detecting castling via the shared `detectCastling` path — measured defect: `makeSan({from:e1,to:g1}, kiwipete)` returned `"Kg1"`. Errors map to `purechess.san.<code>` / `purechess.uci.<code>` in `en/ru/he`. `makeSan` SHALL be byte-identical to `chessops` for `bench/bench-fen-san.mjs` 10k FENs including `+`/`#` so `useChessMoveAnnouncer` stays correct. Keyboard `[`/`]` stepping uses `makeSan` for announcement.

#### Scenario: SAN disambiguation round-trips via makeSan
- **WHEN** position has rooks on `A1` and `H1` both can go to `E1` and move `Rae1` is parsed via `parseSan("Rae1", pos)` then `makeSan` on resulting move
- **THEN** `parseSan` succeeds to `A1→E1`, `makeSan` returns `Rae1` (minimal disambiguation file), and `parseSan("R1e1")` would be `Err san/ambiguous` if both on rank 1

#### Scenario: UCI promotion and castling
- **WHEN** `parseUci("e7e8q")` is called
- **THEN** `Ok` with `promotion=Queen`, `makeUci` returns `e7e8q`; `parseUci("e1g1")` in standard pos is `O-O`, `parseUci("e1h1")` in 960 pos also `O-O` and `makeSan` for both is `O-O`

#### Scenario: makeSan renders canonical-representation castling as O-O
- **WHEN** `makeSan` is called with the canonical castling move (per the ADR-013 bake-off representation) on `r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1`
- **THEN** output is exactly `O-O` and the `fen-san-uci` real-world suite SAN-make gate shows zero castling-rendering diffs over 3,000 positions × all legal moves

#### Scenario: SAN check suffix byte-identical
- **WHEN** move `Qh5xf7+` gives check but not mate in pos `r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1` after `Qxf7+`
- **THEN** `makeSan` returns `Qxf7+` with `+`, and `bench/bench-fen-san.mjs` reports SAN byte-identical vs `chessops` for 10k samples (so `AriaLiveAnnouncer` "Queen takes f7. Check." correct)
