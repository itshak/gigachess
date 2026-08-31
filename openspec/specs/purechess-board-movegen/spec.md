# purechess-board-movegen Specification

## Purpose
Defines the immutable board encoding, 64-bit SquareSet pair, leaper and Black Magic sliding attack primitives, and higher-level movegen helpers that power legal move generation for the PureChess workstation; forbids BigInt in the hot path and references ADR-012 plain fixed-shift tables for 441% speedup over hyperbola. Enforces the FP policy (pure/functional public API with copying only where it produces the result; hot loops use the zero-allocation `WritableBoard` scratch) and mask-trusted legal movegen (check/pin masks instead of per-move play-and-test), closing the gap vs chessops `allDests` to ≤1.2×.

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
| `forEachSquare(set, fn)` | invokes `fn(square: number)` for each set bit, allocation-free (bitmask walk, no `minus`/`singleton` per square) | the ONLY sanctioned set-iteration form inside FP-policy hot loops; `iter`/`for..of` remain fine in cold paths |

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

**FP policy (functional API as the user-facing contract, maximum performance inside):** the public API SHALL be functional because that is what users expect — every op returns fresh values, inputs never mutated, and the public types enforce it at compile time (`Setup`/`Position` fields `readonly`, `CastlingRights.white/black` typed `ReadonlySet<number>`; TS erases these, so zero runtime cost). Copying is permitted ONLY where it produces the returned value or is required for soundness (trade-off rule, ADR-012 §4: small perf cost only for large wins elsewhere). Internal hot loops SHALL use the `WritableBoard` scratch escape hatch instead of per-edit functional ops:

- `WritableBoard` (`{ [K in keyof Board]: MutableSquareSet }`) is a writable view whose ten field objects are MUTABLE bitfields; `newScratchBoard()` allocates ten fresh `{lo,hi}` objects (never shared between fields), `cloneAsWritable(board)` builds one from a `Board`, and `copyBoardInto(dst, src)` copies the twenty field numbers in place — all zero-allocation after the scratch itself.
- Leaf helpers `clearSquareInPlace(b, sqIdx)` and `putPieceInPlace(b, sqIdx, piece)` SHALL mutate bits in place with raw 32-bit ops — they SHALL NOT route through allocating `SquareSet` ops (`not`/`and`/`or`).
- Scratch rules (enforced by convention and purity tests): a `WritableBoard` must NEVER escape the function that created/borrowed it; while a borrowed scratch is live, only leaf helpers may be called (no re-entrant pure API that could share it); the public result is always a fresh immutable `Board` (clone→mutate-clone).
- Set-valued state SHALL be cloned only when it actually changes (e.g. castling-rights sets in `play`/`makeMove` are cloned lazily, only when a right is added/removed) — not eagerly per operation. Unchanged sets SHALL be shared by reference between input and output Positions (structural sharing, ADR-012 §4); this is safe because the library never mutates them and the public `ReadonlySet` typing makes caller-side mutation a type error.

#### Scenario: Board partition invariant holds
- **WHEN** `board = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").board` is built
- **THEN** `board.occupied.equals(board.white.or(board.black))` true, `board.pawn.or(board.knight).or(board.bishop).or(board.rook).or(board.queen).or(board.king).equals(board.occupied)` true, and mutating returned board does not affect original (pure)

#### Scenario: Clone→mutate clone preserves immutability
- **WHEN** `b2 = play(b1, move)` is called with `b1` startpos and `move=e2e4`
- **THEN** `b1` still has pawn on `E2`, `b2` has pawn on `E4` and `E2` empty, `b1.pawn.lo !== b2.pawn.lo` demonstrates copy, and `b1 !== b2` reference

#### Scenario: Scratch edits are zero-allocation and inputs stay pure
- **WHEN** a hot loop applies `clearSquareInPlace`/`putPieceInPlace` edits to a scratch obtained via `cloneAsWritable(board)`, and the loop is sampled under `node --expose-gc` with heap-delta measurement
- **THEN** the edit path allocates no per-edit `{lo,hi}` objects (0 incremental allocations per edit beyond the one-time scratch), and the original `Board` argument is bit-for-bit unchanged after the loop

#### Scenario: Scratch never escapes and purity holds
- **WHEN** the purity test suite (`src/*.test.ts`) runs all public `Board`/`Position` ops (play, setPiece, dests, allDests, makeMove, makeSan) asserting inputs are unchanged and results are fresh values
- **THEN** all assertions pass (inputs byte-identical, no shared mutable field objects between result and input), proving the WritableBoard scratch stays function-local per the FP policy

#### Scenario: forEachSquare replaces allocating iteration in hot loops
- **WHEN** `rg -n "forEachSquare" src/chess.ts` is run against movegen hot loops (pseudo-dest generation, check/pin mask computation)
- **THEN** hot loops iterate via allocation-free `forEachSquare`, and no hot loop creates a generator or per-square `minus`/`singleton` objects

### Requirement: Leaper attacks (knight, king, pawn) SHALL be table-driven and correct vs FIDE

The system SHALL provide `knightAttacks(sq: Square): SquareSet`, `kingAttacks(sq: Square): SquareSet`, `pawnAttacks(color: Color, sq: Square): SquareSet` as pure lookups from constant tables (64 entries each, `SquareSet` values) generated offline. Knight: L-shaped 8 offsets; King: 8 neighboring squares; Pawn: diagonal forward one (White north, Black south). Tables SHALL be language-neutral and match FIDE move definitions (knight jumps over occupancy, king one square, pawn attack only if capturing — tables are destination sets, occupancy filtered by caller). No `BigInt` in tables.

#### Scenario: Leaper tables correct at corners
- **WHEN** `knightAttacks(A1)` is queried (A1=0)
- **THEN** result is `{B3=17, C2=10}` exactly (`1<<17 | 1<<10`), `knightAttacks(H8)` is `G6=38,F7=53`, `kingAttacks(E1)` is `D1=3,E2=12,F1=5,D2=11,F2=13`, and `pawnAttacks(White,E5=36)` is `D6=43,F6=45`

#### Scenario: Leaper attacks are occupancy independent and pure
- **WHEN** `knightAttacks(D4)` is called twice with different board occupancies
- **THEN** both calls return same `SquareSet` (knight jumps regardless), and input `SquareSet` not mutated

### Requirement: Black Magic sliding SHALL ship fancy per-square tables as lazily-decoded typed-array blobs with the naive fallback serving first

The system SHALL provide `bishopAttacks(sq: Square, occupied: SquareSet): SquareSet`, `rookAttacks(sq: Square, occupied: SquareSet): SquareSet`, `queenAttacks = or(bishopAttacks, rookAttacks)` via **fancy per-square Black Magic** (measured per-square variable shifts: rook 52–54, bishop 55–59; flat attack tables rook 102,400 + bishop 5,248 = 107,648 entries — the classic fancy totals) with these mandatory properties:

- **Blob encoding, not object literals:** the generated table modules SHALL store the tables as base64-encoded `Uint8Array` blobs (or equivalent binary assets) decoded into `Uint32Array` lo/hi views at load time — measured 841 KB raw / 26 KB gz and 0.1 ms decode, vs 3,373 KB of object-literal text costing 82 ms to materialize. Stale "plain fixed-shift uniform 11" comments SHALL be corrected to document the fancy encoding (MIT `bench/magic-tables/*.json`, `RecklessMagics`-generated, not GPL).
- **Lazy loading with naive fallback:** the table modules SHALL NOT be in the static import graph of `purechess/core`; tables load via dynamic `import()` behind `ensureMagicTablesLoaded()`. Until loaded (or if loading fails), the existing naive ray-walk fallback SHALL serve — measured **1.66× chessops** (17.4 vs 10.4 MAttacks/s), so correctness and a chessops-beating guarantee hold from the first call.
- **Fresh results, no shared mutable entries:** with typed-array storage each attack call SHALL return a fresh `{lo, hi}` (measured 35.1 vs 30.0 MAttacks/s — 17% *faster* than the object-table lookup that returned shared mutable entries, an ADR-012 aliasing hazard).
- **No `BigInt` in hot path** (unchanged) and the 64-bit multiply split (`Math.imul` lo/hi emulation) SHALL be reused by both the table path and any decoder.

| Field | Type | Example (Rook A1) |
|-------|------|-------------------|
| `mask` | `SquareSet {lo,hi}` | `0x000101010101017E` → `{lo:16843134,hi:65793}` |
| `magic` | `uint64 hex` | `0x1080018022704002` → `{lo:577781762,hi:276824448}` |
| `shift` | `uint8 52..59` (per square) | `52` |
| `offset` | `usize` (cumulative) | `0` |
| `attackTable[offset + index]` | `Uint32Array` lo/hi pair | decoded from blob |

#### Scenario: Rook attacks empty vs blocked are correct vs perft oracle
- **WHEN** `rookAttacks(A1=0, occupied=empty)` is computed
- **THEN** result is `A2=8,A3=16,A4=24,A5=32,A6=40,A7=48,A8=56,B1=1,C1=2,D1=3,E1=4,F1=5,G1=6,H1=7` exactly (14 bits), and `rookAttacks(A1, occupied={C1=2})` is `B1=1,C1=2` (stops inclusive at blocker) not `D1..H1`

#### Scenario: Blob table path matches naive ray for all occupancies
- **WHEN** for square `D4=27` and all `2^popcount(mask(D4))` occupancy subsets of `bishopMask(D4)` (and a 50k-sample parity sweep of real perft-tree occupancies × 64 squares) the blob-path attacks are compared to the naive ray loop
- **THEN** every result equals naive, and `queenAttacks(D4,occ).equals(or(bishopAttacks(D4,occ), rookAttacks(D4,occ)))`

#### Scenario: Sliding speed gates hold before and after table load
- **WHEN** the sliding real-world suite benchmarks `queenAttacks` over real perft-tree occupancies with tables unloaded (naive fallback) and loaded (blob magic)
- **THEN** naive SHALL be ≥1.5× chessops MAttacks/s and blob magic SHALL be ≥2.5× chessops (measured 1.66× and 3.37×)

#### Scenario: Core bundle excludes table bytes from the static graph
- **WHEN** a consumer imports `import { Chess } from "purechess/core"` and the bundle is inspected
- **THEN** no rook/bishop attack-table bytes are present (static import graph excludes the table modules), the tables load only via dynamic `import()`, and the naive fallback is statically included

#### Scenario: No BigInt in hot path
- **WHEN** `rg BigInt src/attacks.ts src/squareSet.ts` runs
- **THEN** the count is 0 in hot files (BigInt allowed only in tests/oracles)

### Requirement: Ray, between, and attacks helpers SHALL be pure and correct

The system SHALL provide `ray(from: Square, to: Square): SquareSet` (all squares on line between inclusive), `between(from,to): SquareSet` (exclusive, empty if not aligned), `isAttacked(pos: Position, square: Square, attacker: Color): boolean`, and `kingAttackers(pos: Position, kingColor: Color): SquareSet` (set of opponent pieces attacking king). `ray` and `between` SHALL be table-driven or computed via attacks, pure, and never allocate in hot loop beyond `SquareSet` pair.

#### Scenario: Between excludes endpoints and handles non-aligned
- **WHEN** `between(E1=4, G1=6)` is queried (king-side castling path)
- **THEN** result is `{F1=5}` only, `between(E1, C1=2)` is `{D1=3}`, `between(E1, E8=60)` is `E2=12,E3=20,E4=28,E5=36,E6=44,E7=52`, and `between(E1, F3=21)` not same rank/file/diagonal → empty `{lo:0,hi:0}`

#### Scenario: King attackers detected
- **WHEN** position `rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1` White to move king `E1` not in check, but `kingAttackers(pos, White)` after `Qh5` is empty
- **THEN** `isAttacked(pos, E1, Black)` false for startpos, and for `rnb1k2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1` where bishop `C5` attacks `F2`, `kingAttackers` includes `C5`

### Requirement: dests, isLegal, and kingAttackers SHALL be legal-move correct and keyboard/a11y parity kept

The system SHALL provide `dests(pos: Position, square: Square): SquareSet` (all legal destination squares for piece on `square`, considering check, pins via `kingAttackers` and `between`, en passant legality requiring king not in discovered check after capture), `allDests(pos): Map<Square, SquareSet>`, `isLegal(pos, move): boolean` (pseudo-legal plus king not left in check, castling truth table, en passant, promotion), `kingAttackers` as above. All SHALL be pure (clone→mutate clone via the FP-policy scratch, with `isAttacked` verification for any play-and-test fallback). **Legality SHALL be computed by check/pin masks, not redundant re-testing:** `allDests`/`genLegalMoves` SHALL derive legality from the `CheckContext` masks (`checkMask`, `pinRays`, `kingSafe`) and the shared board-edit path, and SHALL NOT run a per-move play-and-then-test (`isMoveLegal`) on moves whose legality the masks already guarantee (non-promotion, non-castling moves). Play-and-test is reserved for cases the masks do not cover. Parity vs `chessops` `dests`/`allDests` SHALL be byte-identical for 1k random positions so `GameViewShell` `[`/`]` stepping and `Alt+` chords remain correct, and `AriaLiveAnnouncer` announcements via `makeSan` remain correct.

#### Scenario: dests respects pins
- **WHEN** White king `E1`, White bishop `E2`, Black rook `E8` on same file (pin) in `4r3/8/8/8/8/8/4B3/4K3 w - - 0 1`
- **THEN** `dests(E2)` contains only `E3--E8` file squares? Actually bishop pinned diagonally? Use rook pin: bishop on e2 pinned by rook e8 to king e1 → `dests(E2)` is empty or only moves along pin ray that still block? Bishop cannot block rook along file because bishop moves diagonal, so `dests(E2)` is empty, while `dests` for non-pinned knight elsewhere normal

#### Scenario: dests byte-identical to chessops for 1k random positions
- **WHEN** `bench/bench-fen-san.mjs` compares `allDests` via `purechess` vs `chessops` for 1000 random occupancies
- **THEN** for every pos, every `from` square's `dests` `SquareSet` equals `chessops` dests, so `GameViewShell` keyboard `[`/`]` and `BoardContainer` focus remain correct

#### Scenario: En passant illegal if exposes king
- **WHEN** White king `E5`, White pawn `D5`, Black pawn `E7` pushes to `E5`? Actually test discovered check: White king `E1`, White pawn `D5` could capture en passant `E6` but leaves E-file open for Black rook `E8` → king in check
- **THEN** `isLegal(D5×E6 en passant)` is false because after `play`, `kingAttackers(posAfter, White)` nonempty, and `dests(D5)` excludes `E6`

#### Scenario: Mask-trusted legality passes perft without per-move play-and-test
- **WHEN** `allDests`/`genLegalMoves` run on the perft edge-case suite (startpos d6, Kiwipete d5, positions 3–6 incl. castling-through-check and en-passant-pin positions) with the per-move `isMoveLegal` re-test removed for mask-guaranteed moves
- **THEN** every perft node count is exact (matches the published reference values), proving mask-derived legality is complete and the redundant play-and-test is safely absent; measured speedup on `pos4` (castling/ep heavy) is ≥3× over the play-and-test baseline

#### Scenario: Castling rights cloned lazily, not eagerly
- **WHEN** `makeMove` applies a move that does not touch castling rights (e.g. `e2e4` from startpos with rights `KQkq` intact)
- **THEN** the result's castling-rights `Set`s are shared with the input position (no clone allocated), while a rook-or-king move that removes a right produces a fresh `Set` — verified by reference-identity assertions in the purity tests


#### Scenario: Keyboard and screen reader parity not regressed
- **WHEN** user steps moves with `[` (back) and `]` (forward) on desktop via `GameViewShell`, and screen reader announces via `useChessMoveAnnouncer` using `makeSan`
- **THEN** `dests` and `makeSan` parity guarantees move list and announcement byte-identical to `chessops` baseline, `enableArrowMoveShortcuts` remains OFF by default (arrows reserved for screen reader), and `Alt+B`/`Alt+R` chords still work (no `Ctrl+` conflict per AGENTS.md)

### Requirement: i18n and accessibility SHALL be propagated for board/movegen errors

Any movegen error string (illegal move `purechess.move.illegal`, `purechess.castling.throughCheck`, `purechess.enPassant.illegal`) SHALL map to `en/ru/he` keys. Keyboard contracts: `enableArrowMoveShortcuts` flag OFF by default, `[`/`]` stepping always available, `Alt+` chords never `Ctrl+`.

#### Scenario: Illegal move error is localized
- **WHEN** `isLegal` returns false for `E1→E2` where king would move into check
- **THEN** error code `purechess.move.leavesKingInCheck` has translations in `en, ru, he` and `AriaLiveAnnouncer` announces short queue-safe "Illegal move: leaves king in check" (localized) without disrupting focus

### Requirement: Implementation sources for board-movegen SHALL be restricted — GPL, node_modules, and internet are forbidden

The implementation of `SquareSet`/`Board`/`attacks` SHALL be derived only from the language-neutral tables in this spec (`{lo,hi}` ops, leaper offsets, Black Magic `mask`/`magic`/`shift`/`offset` schema) and MIT `bench/magic-tables/*.json`. It SHALL NOT read, import, or copy any file from `node_modules/` (including `node_modules/chessops`), `refs/gpl-only/`, or any internet URL. `src/squareSet.ts` and `src/attacks.ts` SHALL contain no `BigInt` and no `chessops` string, and `rg -n "chessops" src/` SHALL be empty. The Black Magic tables SHALL be the MIT `bench/magic-tables/*.json` generated via `RecklessMagics`, not GPL Stockfish/chessops tables.

#### Scenario: Clean-room verification passes
- **WHEN** a maintainer runs `rg -n "chessops|BigInt" src/squareSet.ts src/attacks.ts src/board.ts` and diffs `src/` against `refs/gpl-only/` and `node_modules/chessops`
- **THEN** all three searches return empty and no identical lines (≥40 characters) exist between `src/` and any GPL or node_modules source

