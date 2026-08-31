# ADR-014: Chessops-Exact Public API

**Status:** Accepted (August 2026, follow-up to change `purechess-gates-green`)

## Context

ADR-010 pins `chessops@0.15.1` as the migration baseline and every benchmark
gate compares purechess against chessops. During the gates-green change it
became clear that "we compare outputs with chessops" is not enough: the
workstation migration (`purechess-adopt`) requires the **public API surface
itself** to be chessops-compatible — same names, same signatures, same
argument order, same mutability semantics — so that `chessops` imports can be
swapped mechanically.

A terminology correction is part of this decision: the earlier descriptions
of purechess as a "functional API" meant **immutability of caller-provided
input** (the engine never mutates a Setup/Move/board it was given — same
observable contract as chessops), NOT a deliberately different
functional-style API surface. That misreading is retired here.

## Decision

1. **The public API SHALL be exactly chessops-shaped.** A dedicated facade
   module is exported at `purechess/chessops` (`src/chessops/`), mirroring
   chessops' module layout and type declarations:
   - `types`: `Color = 'white' | 'black'`, `Role = 'pawn' | ... | 'king'`
     (string enums, not numeric), `Piece`, `NormalMove` (`promotion?`),
     `Move`, `Square`, `SquareName`, `ByColor`/`ByRole`/`ByCastlingSide`,
     `FILE_NAMES`/`RANK_NAMES`/`ROLES`/`COLORS`/`ROLE_CHARS`/`CASTLING_SIDES`.
   - `SquareSet`: immutable class with readonly signed-int32 `lo`/`hi` (same
     bit layout as the engine; chessops stores **signed** int32 — `full()` is
     `-1/-1`, not `0xffffffff`), all chessops methods (`shr64`, `shl64`,
     `bswap64`, `rbit64`, `minus64`, `reversed()`, iterator, ...).
   - `Board`: mutable class (chessops semantics — `set`/`take`/`clear`/
     `reset` mutate the instance) delegating to the immutable engine board.
   - `Setup` interface: `castlingRights: SquareSet`, `epSquare: Square |
     undefined`, plus `Material`/`MaterialSide`/`RemainingChecks` classes
     (pockets/remainingChecks are always `undefined` — standard chess only).
   - `Position`/`Chess` classes: mutable `play(move)` (chessops mutates the
     instance — sanctioned here as *own-instance* mutation; caller-provided
     Setup/Move values are still never mutated), `dests`, `allDests` (one
     entry per own piece, empty sets included — chessops semantics),
     `isLegal`, `isCheck`/`isCheckmate`/`isStalemate`,
     `hasInsufficientMaterial(color)`, `isInsufficientMaterial()`, `outcome`,
     `toSetup` (with chessops' `legalEpSquare` filter and counter clamps),
     `clone`, `Chess.default()`, `Chess.fromSetup(setup): Result<Chess,
     PositionError>` (validated through the engine's FEN round-trip),
     `normalizeMove`, `castlingSide`, `equalsIgnoreMoves`, `pseudoDests`.
   - `fen`: `parseFen(fen): Result<Setup, FenError>`, `makeFen(setup,
     { epd? })`, `FenError`/`InvalidFen`, `parseBoardFen`/`makeBoardFen`/
     `parseCastlingFen`/`makeCastlingFen`.
   - `san`: **position-first signatures** — `parseSan(pos, san): Move |
     undefined`, `makeSan(pos, move): string`, `makeSanAndPlay`,
     `makeSanVariation`. (The engine-internal functional signatures keep the
     opposite order; the facade is the compatibility contract.)
   - `util`: `parseUci`/`makeUci` (`parseUci` returns `Move | undefined`),
     `opposite`, `squareRank`/`squareFile`/`squareFromCoords`,
     `parseSquare`/`makeSquare`, `roleToChar`/`charToRole`, `moveEquals`,
     `kingCastlesTo`/`rookCastlesTo`.
   - `debug`: `perft(pos, depth, log?)`.
   - `Result` is `@badrap/result` (MIT, version-pinned in `dependencies`) —
     the same Result type chessops exposes, so error handling matches
     (`isErr`/`unwrap`/`unwrapError`).
2. **Semantics that differ from purechess' engine internals are chessops'
   semantics at the facade**, verified by `tests/compat-chessops.mjs`, which
   uses only the facade and asserts byte-level parity with real chessops for:
   FEN parse/make (incl. `{epd}`), castling-rights bitboards, game replay via
   mutable `play()`, `allDests` maps (bit-identical), SAN make/parse from
   flagless moves (castling as king-captures-rook, ep detection without
   flags), UCI round-trips, terminal flags, `outcome`, `perft`,
   `hasInsufficientMaterial`, SquareSet operations/iteration/statics, and
   chessops' input leniency (SAN `x` is cosmetic on input; `normalizeMove`
   maps `e1g1` → `e1h1`; `isLegal` rejects the un-normalized form).
3. **Castling representation** follows ADR-013 as amended
   (king-captures-rook) — which is also chessops' representation, so the
   facade needs no conversion for castling moves.
4. The existing immutable functional engine (root exports) remains available
   as the implementation layer for benches/tests/workstation internals; the
   chessops-exact facade is the migration-facing public API.

## Remaining gaps (follow-up scope)

- `chessops/pgn` (`Game`/`Node` tree API, `startingPosition`, streaming
  `PgnParser`) — purechess has its own PGN parser; a Game/Node-compatible
  facade is future work.
- Chess variants (`Rules` beyond standard chess) are out of project scope
  (clean-room, standard chess only).
- Direct mutation of `pos.board` fields (chessops allows writing
  `board.occupied = ...`) is not tracked by the facade's engine cache; use
  `Board` methods or `play()`.

## Consequences

- The workstation migration can now swap `chessops/*` imports for
  `purechess/chessops` with mechanical changes only; behaviour parity is
  continuously enforced by `tests/compat-chessops.mjs` (part of `npm test`).
- `@badrap/result` becomes a direct (MIT) dependency.
- Performance is unchanged: the facade delegates to the same engine the
  benchmark gates measure.
