# purechess-board-movegen Specification

## Purpose
Defines the immutable board encoding, 64-bit SquareSet pair, leaper and Black Magic sliding attack primitives, and higher-level movegen helpers that power legal move generation for the PureChess workstation; forbids BigInt in the hot path and references ADR-012 plain fixed-shift tables for 441% speedup over hyperbola.

## Requirements

### Requirement: SquareSet SHALL be {lo,hi} pair with pure ops and no BigInt in hot path

The system SHALL define `SquareSet` as `type SquareSet = { readonly lo: number, readonly hi: number }` where `lo` bits 0–31 map to squares `A1..H4` (0..31) and `hi` bits 0–31 map to squares `A5..H8` (32..63). All ops SHALL be pure (return new `SquareSet`, never mutate input) and SHALL be implemented with inline 32-bit bitwise ops (`&| ^ ~ << >>> Math.imul Math.clz32`), **SHALL NOT use `BigInt` in `src/squareSet.ts` hot path** (CI `rg BigInt src/squareSet.ts` empty). `BigInt` is allowed only in tests/oracles.

Ops (language-neutral table, `a,b: SquareSet`):

| Op | Semantics | Notes |
|----|-----------|-------|
| `empty` | `{lo:0,hi:0}` | |
| `full` | `{lo:0xFFFFFFFF,hi:0xFFFFFFFF}` | but board only 64 squares |
| `singleton(sq)` | `1<<sq` split | `lo=1<<(sq%32)` if sq<32 else hi |
| `has(set,sq)` | test bit | |
| `and(a,b)` | `{lo:a.lo & b.lo, hi:a.hi & b.hi}` | |
| `or(a,b)` | `{lo:a.lo|b.lo, hi:a.hi|b.hi}` | |
| `xor(a,b)` | `{lo:a.lo ^ b.lo, hi:a.hi ^ b.hi}` | |
| `not(a)` | complement limited to 64 squares: `{lo:~a.lo, hi:~a.hi} & fullBoard` | `fullBoard = {lo:0xFFFFFFFF,hi:0xFFFFFFFF}>>0` but top bits beyond 64 zeroed (no square ≥64) |
| `minus(a,b)` | `and(a, not(b))` | |
| `shl(set,n)` | shift left 1..63 via `hi/lo` carry, `>>>0` | |
| `shr(set,n)` | shift right | |
| `popcnt(set)` | `popcnt32(lo)+popcnt32(hi)` via `Math.clz32` or `bitCount` | |
| `first(set)` | lowest set bit index `0..63` or `undefined` | uses `Math.clz32` + `lo/hi` |
| `moreThanOne(set)` | `popcnt>1` | |
| `isEmpty(set)` | `lo===0 && hi===0` | |
| `equals(a,b)` | `a.lo===b.lo && a.hi===b.hi` | |
| `complementWithinBoard` | same as `not` | |
| `iter(set)` | yields `Square` iterates via `first`+`minus(singleton)` — not in hot path, use indexed `for` in attacks | must not allocate iterator per call in hot loop |

`popcnt` and `first` SHALL be correct for all 64-bit patterns; reference python-chess `popcount` oracle.

#### Scenario: Basic SquareSet ops are correct and pure
- **WHEN** `a = {lo:0b101,hi:0}`, `b={lo:0b011,hi:0}` and `c=and(a,b)` is computed
- **THEN** `c.lo===0b001 && c.hi===0`, `a` and `b` unchanged (pure), `or(a,b).lo===0b111`, `xor` `0b110`, `popcnt({lo:0xFFFFFFFF,hi:0})===32`, and `has(singleton(63),63)` true with `singleton(63)={lo:0,hi:0x80000000}`

#### Scenario: BigInt not used in hot path verified by harness
- **WHEN** `rg -n "BigInt" src/squareSet.ts` and `rg -n "BigInt" src/attacks.ts` run in CI, and `bench/bench-sliding.mjs --algo bigint` reports 14.9× slower than `black-magic` (3.47 vs 51.73 MQueens/s)
- **THEN** `src/` hot files contain no `BigInt`, and spec gate "BigInt not hot-path viable" is satisfied per ADR-012

#### Scenario: Shift across lo/hi boundary correct
- **WHEN** `shl({lo:0x80000000,hi:0},1)` is computed (bit 31 should carry to hi bit 0)
- **THEN** result is `{lo:0,hi:1}`, `shr({lo:0,hi:1},1)` returns `{lo:0x80000000,hi:0}`, and TypeScript compiles with `target ES2020` without `downlevelIteration`

### Requirement: Board SHALL be immutable value of ten SquareSets with occupied/promoted invariants

The system SHALL define `Board` as `type Board = { readonly white: SquareSet, readonly black: SquareSet, readonly pawn: SquareSet, readonly knight: SquareSet, readonly bishop: SquareSet, readonly rook: SquareSet, readonly queen: SquareSet, readonly king: SquareSet, readonly occupied: SquareSet, readonly promoted: SquareSet }` where `occupied = white.or(black)` and every `occupied` bit is covered by exactly one role bit (`pawn|knight|bishop|rook|queen|king` partition `occupied`). `promoted` marks pieces that promoted (for X-FEN). `Board` is value: `play`, `setPiece` etc SHALL take `Board` and return new `Board` (clone→mutate clone), never mutate input. Construction from FEN SHALL validate via `purechess-rules` oppositeCheck etc.

#### Scenario: Board partition invariant holds
- **WHEN** `board = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").board` is built
- **THEN** `board.occupied.equals(board.white.or(board.black))` true, `board.pawn.or(board.knight).or(board.bishop).or(board.rook).or(board.queen).or(board.king).equals(board.occupied)` true, and mutating returned board does not affect original (pure)

#### Scenario: Clone→mutate clone preserves immutability
- **WHEN** `b2 = play(b1, move)` is called with `b1` startpos and `move=e2e4`
- **THEN** `b1` still has pawn on `E2`, `b2` has pawn on `E4` and `E2` empty, `b1.pawn.lo !== b2.pawn.lo` demonstrates copy, and `b1 !== b2` reference

### Requirement: Leaper attacks (knight, king, pawn) SHALL be table-driven and correct vs FIDE

The system SHALL provide `knightAttacks(sq: Square): SquareSet`, `kingAttacks(sq: Square): SquareSet`, `pawnAttacks(color: Color, sq: Square): SquareSet` as pure lookups from constant tables (64 entries each, `SquareSet` values) generated offline. Knight: L-shaped 8 offsets; King: 8 neighboring squares; Pawn: diagonal forward one (White north, Black south). Tables SHALL be language-neutral and match FIDE move definitions (knight jumps over occupancy, king one square, pawn attack only if capturing — tables are destination sets, occupancy filtered by caller). No `BigInt` in tables.

#### Scenario: Leaper tables correct at corners
- **WHEN** `knightAttacks(A1)` is queried (A1=0)
- **THEN** result is `{B3=17, C2=10}` exactly (`1<<17 | 1<<10`), `knightAttacks(H8)` is `G6=38,F7=53`, `kingAttacks(E1)` is `D1=3,E2=12,F1=5,D2=11,F2=13`, and `pawnAttacks(White,E5=36)` is `D6=43,F6=45`

#### Scenario: Leaper attacks are occupancy independent and pure
- **WHEN** `knightAttacks(D4)` is called twice with different board occupancies
- **THEN** both calls return same `SquareSet` (knight jumps regardless), and input `SquareSet` not mutated

### Requirement: Black Magic sliding SHALL use plain fixed-shift uniform 11 (Fancy per-square is allowed alternative)

The system SHALL provide `bishopAttacks(sq: Square, occupied: SquareSet): SquareSet`, `rookAttacks(sq: Square, occupied: SquareSet): SquareSet`, `queenAttacks = or(bishopAttacks, rookAttacks)` via Black Magic **plain fixed-shift uniform 11 (default, most performant for JS)**. **Fancy per-square variable shift (`shift = 64 - popcount(mask)`, 52..59) with per-square `offset` is an allowed alternative** for Stockfish-table compatibility, but default SHALL be plain uniform.

- **Plain uniform (default):** For each `sq`, `mask = relevantOccupancies(sq)` (edges excluded), `magic: uint64` (hex `magicHex` plus `magicLo/magicHi` split), `shift = 11` fixed for all squares (homogeneous), `offset = sq * 2048` uniform, `attackTable: SquareSet[]` flat `64*2048=131072` (or 8192 slice for harness). Computation `index = ((occ64 & mask64) * magic64 >>> 11) + offset` emulated without `BigInt` via `Math.imul` split of `lo/hi`. Homogeneous `>>> 11` is most JIT-friendly (stable shape, `bench/results/sliding-2026-08-30-plain-vs-fancy.md`: plain 47.86 vs Fancy 45.84 → plain +4.4% @10M, both `>330%` vs HQ 10.50). GopherCheck baseline, ADR-012.
- **Fancy per-square (alternative):** `shift = 64 - popcount(mask)` variable 52..59, `offset` cumulative, flat `attackTable` rook 102400 bishop 5248 total 107648, same `RecklessMagics` generator, same `bench/magic-tables/{rook,bishop}.json` schema (**not GPL**). Computation `index = ((occ64 & mask64) * magic64 >> perSquareShift) + perSquareOffset` via `Math.imul` split. Generates identical attacks; `bench/results/sliding-2026-08-30-plain-vs-fancy.md` shows plain vs Fancy are parity (plain +4.4% @10M, Fancy +18% @1M → noise), so either keeps the `+30%` gate (`bench/results/sliding-2026-08-30.md` Black Magic +441% vs HQ 9.35→51.73). Plain is default for `purechess` because it is leanest.

Fancy and plain generate byte-identical `bishopAttacks`/`rookAttacks` vs naive ray for all 1000 random occupancies; harness `D: bigint` at 3.47 MQueens/s proves BigInt not viable. Tables SHALL be `sideEffects:false` and tree-shakeable. `bench/magic-tables/{rook,bishop}.json` SHALL contain per-square `mask`/`magic`/`shift`/`offset` + flat `attackTable` (MIT, not GPL) — impl may use plain uniform `shift=11` subset or full Fancy; both satisfy spec if GWT below passes.

| Field | Type | Example (Rook A1) |
|-------|------|-------------------|
| `mask` | `SquareSet {lo,hi}` | `0x000101010101017E` → `{lo:16843134,hi:65793}` |
| `magic` | `uint64 hex` | `0x1080018022704002` → `{lo:577781762,hi:276824448}` |
| `shift` | `uint8 52..59` | `52` |
| `offset` | `usize` | `0` |
| `attackTable[offset + index]` | `SquareSet` | `bishopAttacks(A1,0) = {lo:...,hi:...}` |

Spec forbids `BigInt` in `src/attacks.ts`; reference harness `D: bigint` at 3.47 MQueens/s proves not viable.

#### Scenario: Rook attacks empty vs blocked are correct vs perft oracle
- **WHEN** `rookAttacks(A1=0, occupied=empty)` is computed
- **THEN** result is `A2=8,A3=16,A4=24,A5=32,A6=40,A7=48,A8=56,B1=1,C1=2,D1=3,E1=4,F1=5,G1=6,H1=7` exactly (14 bits), and `rookAttacks(A1, occupied={C1=2})` is `B1=1,C1=2` (stops inclusive at blocker) not `D1..H1`

#### Scenario: Bishop attacks via magic match naive ray for all occupancies
- **WHEN** for square `D4=27` and 1000 random `occupied` subsets of `bishopMask(D4)` the `bishopAttacks` via magic is compared to naive ray loop (step to edge, stop at blocker inclusive)
- **THEN** every result equals naive, and `queenAttacks(D4,occ).equals(or(bishopAttacks(D4,occ), rookAttacks(D4,occ)))`

#### Scenario: Black Magic index uses masked occupancy and offset
- **WHEN** `rookAttacks(H1=7, occupied=fullBoard)` is computed where `mask` excludes `H1` itself and edges
- **THEN** `occMasked = and(occupied, mask)` has bits only on relevant squares, `index = ((occMasked * magic) >> shift) + offset` is within `[offset, offset+size)` and `attackTable[index]` equals naive attacks

#### Scenario: No BigInt in hot path and bundle tree-shaking
- **WHEN** `rg BigInt src/attacks.ts` and bundle `npm run bench:bundle -- --entry core` are run
- **THEN** `BigInt` count is 0 in hot files, `purechess/core` gzipped is ≥30% smaller than `chessops` full (verified via `esbuild` with `sideEffects:false` and `exports` map), and `import { Chess } from "purechess/core"` does not include `parsePgn` bytes

### Requirement: Ray, between, and attacks helpers SHALL be pure and correct

The system SHALL provide `ray(from: Square, to: Square): SquareSet` (all squares on line between inclusive), `between(from,to): SquareSet` (exclusive, empty if not aligned), `isAttacked(pos: Position, square: Square, attacker: Color): boolean`, and `kingAttackers(pos: Position, kingColor: Color): SquareSet` (set of opponent pieces attacking king). `ray` and `between` SHALL be table-driven or computed via attacks, pure, and never allocate in hot loop beyond `SquareSet` pair.

#### Scenario: Between excludes endpoints and handles non-aligned
- **WHEN** `between(E1=4, G1=6)` is queried (king-side castling path)
- **THEN** result is `{F1=5}` only, `between(E1, C1=2)` is `{D1=3}`, `between(E1, E8=60)` is `E2=12,E3=20,E4=28,E5=36,E6=44,E7=52`, and `between(E1, F3=21)` not same rank/file/diagonal → empty `{lo:0,hi:0}`

#### Scenario: King attackers detected
- **WHEN** position `rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1` White to move king `E1` not in check, but `kingAttackers(pos, White)` after `Qh5` is empty
- **THEN** `isAttacked(pos, E1, Black)` false for startpos, and for `rnb1k2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1` where bishop `C5` attacks `F2`, `kingAttackers` includes `C5`

### Requirement: dests, isLegal, and kingAttackers SHALL be legal-move correct and keyboard/a11y parity kept

The system SHALL provide `dests(pos: Position, square: Square): SquareSet` (all legal destination squares for piece on `square`, considering check, pins via `kingAttackers` and `between`, en passant legality requiring king not in discovered check after capture), `allDests(pos): Map<Square, SquareSet>`, `isLegal(pos, move): boolean` (pseudo-legal plus king not left in check, castling truth table, en passant, promotion), `kingAttackers` as above. All SHALL be pure (clone→mutate clone, check `isAttacked` after `play`). Parity vs `chessops` `dests`/`allDests` SHALL be byte-identical for 1k random positions so `GameViewShell` `[`/`]` stepping and `Alt+` chords remain correct, and `AriaLiveAnnouncer` announcements via `makeSan` remain correct.

#### Scenario: dests respects pins
- **WHEN** White king `E1`, White bishop `E2`, Black rook `E8` on same file (pin) in `4r3/8/8/8/8/8/4B3/4K3 w - - 0 1`
- **THEN** `dests(E2)` contains only `E3--E8` file squares? Actually bishop pinned diagonally? Use rook pin: bishop on e2 pinned by rook e8 to king e1 → `dests(E2)` is empty or only moves along pin ray that still block? Bishop cannot block rook along file because bishop moves diagonal, so `dests(E2)` is empty, while `dests` for non-pinned knight elsewhere normal

#### Scenario: dests byte-identical to chessops for 1k random positions
- **WHEN** `bench/bench-fen-san.mjs` compares `allDests` via `purechess` vs `chessops` for 1000 random occupancies
- **THEN** for every pos, every `from` square's `dests` `SquareSet` equals `chessops` dests, so `GameViewShell` keyboard `[`/`]` and `BoardContainer` focus remain correct

#### Scenario: En passant illegal if exposes king
- **WHEN** White king `E5`, White pawn `D5`, Black pawn `E7` pushes to `E5`? Actually test discovered check: White king `E1`, White pawn `D5` could capture en passant `E6` but leaves E-file open for Black rook `E8` → king in check
- **THEN** `isLegal(D5×E6 en passant)` is false because after `play`, `kingAttackers(posAfter, White)` nonempty, and `dests(D5)` excludes `E6`

#### Scenario: Keyboard and screen reader parity not regressed
- **WHEN** user steps moves with `[` (back) and `]` (forward) on desktop via `GameViewShell`, and screen reader announces via `useChessMoveAnnouncer` using `makeSan`
- **THEN** `dests` and `makeSan` parity guarantees move list and announcement byte-identical to `chessops` baseline, `enableArrowMoveShortcuts` remains OFF by default (arrows reserved for screen reader), and `Alt+B`/`Alt+R` chords still work (no `Ctrl+` conflict per AGENTS.md)

### Requirement: i18n and accessibility SHALL be propagated for board/movegen errors

Any movegen error string (illegal move `purechess.move.illegal`, `purechess.castling.throughCheck`, `purechess.enPassant.illegal`) SHALL map to `en/ru/he` keys. Keyboard contracts: `enableArrowMoveShortcuts` flag OFF by default, `[`/`]` stepping always available, `Alt+` chords never `Ctrl+`.

#### Scenario: Illegal move error is localized
- **WHEN** `isLegal` returns false for `E1→E2` where king would move into check
- **THEN** error code `purechess.move.leavesKingInCheck` has translations in `en, ru, he` and `AriaLiveAnnouncer` announces short queue-safe "Illegal move: leaves king in check" (localized) without disrupting focus
