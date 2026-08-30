## 1. SquareSet & Attacks Foundation

- [ ] 1.1 Implement `src/squareSet.ts` as `{lo,hi}` pair with pure ops (`empty,full,singleton,has,and,or,xor,not,minus,shl,shr,popcnt,first,moreThanOne,isEmpty,equals,iter`) with no `BigInt` in hot path and `target ES2020` — verify `rg BigInt src/squareSet.ts` empty and `popcnt({lo:0xFFFFFFFF,hi:0})===32 && has(singleton(63),63)` passes
- [ ] 1.2 Implement `src/attacks.ts` leaper tables (`knightAttacks,kingAttacks,pawnAttacks`) and Black Magic sliding (`bishopAttacks,rookAttacks,queenAttacks`) via `bench/magic-tables/{rook,bishop}.json` plain fixed-shift uniform 11 default (Fancy per-square alternative compatible), `ray,between,isAttacked,kingAttackers` — verify `rookAttacks(A1,empty)` has 14 bits and `bishopAttacks(D4,occ)` matches naive ray for 1000 random occupancies

## 2. Board & FEN

- [ ] 2.1 Implement `src/board.ts` + `src/types.ts` + `src/util.ts` — `Board` as ten `SquareSet` immutable value (`white,black,pawn,knight,bishop,rook,queen,king,occupied,promoted`) with `occupied=white|black` invariant, pure `clone→mutate clone` helpers — verify `parseFen(startpos).board.occupied.equals(white.or(black))` and `play` does not mutate input
- [ ] 2.2 Implement `src/fen.ts` `parseFen`/`makeFen` with six-field validation per `purechess-rules` (`pawnOnBackRank,kingsCount,oppositeCheck,enPassantUncapturable,halfmove/fullmove` etc) returning `Result<Setup,FenError>` with `purechess.fen.<code>` keys, X-FEN/Shredder dual handling with `chess960:true` flag — verify `parseFen(P7...)` Err `fen/pawnOnBackRank` and `parseFen(startpos)` Ok round-trips byte-identical

## 3. Chess Rules & Movegen

- [ ] 3.1 Implement `src/chess.ts` / `src/chess960.ts` core — `Position/Setup`, `dests,allDests,isLegal,kingAttackers, isCheck,isCheckmate,isStalemate,isInsufficientMaterial, isFiftyMoveDraw,isThreefoldRepetition`, castling truth tables (standard + Chess960 king-captures-rook normalized to `G1/C1`), en passant legality via discovered check, promotion — verify `dests` for startpos has 20 moves and `isCheck` false, `isCheckmate` for Fool's mate true, pin handling, and `perft(startpos,6)=119060324`
- [ ] 3.2 Implement `src/san.ts` `parseSan/makeSan, parseUci/makeUci` per `purechess-rules` SAN semantics (disambiguation minimal file→rank→both, `x,+ ,#,=Q|R|B|N`, tolerant `0-0`→`O-O`, canonical `O-O`, `+`/`#` byte-identical to chessops) — verify `Nd2` ambiguous Err `san/ambiguous`, `Nbd2` resolves to `B1→D2`, `e7e8q` and `e7e8Q` both promotion Queen with `makeUci` lower-case, and 1k random SAN byte-identical vs chessops

## 4. PGN

- [ ] 4.1 Implement `src/pgn.ts` streaming parser per `purechess-pgn-fen` ABNF (`GameTree` with `headers, moves: {san,nags,comments,variations}`, `PgnParser {feed(chunk),finish()}`, tolerant missing move numbers, NAG `$`/`!`/`?`, nested variations, `makePgn` round-trip) — verify chunked feeding `["1. e4 ","e5 (1","... c5) 2. Nf3 *"]` equals whole-string parse and `makePgn(parsePgn(pgn))` re-parses identical, `games/s` gate

## 5. Package & A11y

- [ ] 5.1 Configure `package.json` exports (`"."`, `"./core"` no PGN/Chess960, `"./pgn"`, `"./chess960"`, shims `"./chessops"` + `"./chessjs"`), `sideEffects:false`, `const enum` inlined, `target ES2020`, `.d.ts` generation, bundle gates — verify `import { Chess } from "purechess/core"` does not include `parsePgn` bytes and `purechess/core` gzipped ≥30% smaller than `chessops` full via `bench-bundle.mjs --entry core`
- [ ] 5.2 Add `src/locales/{en,ru,he}/purechess.json` i18n keys for every `FenError/SanError/PgnError/UciError` code (`purechess.fen.*`, `purechess.san.*` etc) with no English hard-coded in logic and `AriaLiveAnnouncer`/`GameViewShell` `[`/`]`/`Alt+` keyboard parity preserved — verify `npm run test:i18n` (or manual checker) finds all keys in three locales and `makeSan` byte-identical for `AriaLiveAnnouncer`
- [ ] 5.3 Verify `npm run typecheck` and `cd src-tauri && cargo check` (unchanged) and bench gates `bench-sliding/perft/pgn/fen-san/bundle` — final gate verification
