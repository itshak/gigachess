# Design: purechess-impl

## Context

See `proposal.md` Why. Specs are Source of Truth in `openspec/specs/{purechess-rules,purechess-board-movegen,purechess-pgn-fen,purechess-benchmarks}`. ADR-012 locked `{lo,hi}` + Black Magic plain fixed-shift uniform 11 vs Fancy per-square (bench 441% vs HQ). This change builds `purechess` MIT npm package from those specs so workstation `src/` can migrate off GPL `chessops`.

Constraints:
- `refs/gpl-only/` never enters impl history; only `refs/mit-permissive/` + `refs/docs-refs/` + `bench/magic-tables/*.json` allowed.
- `src/squareSet.ts` and `src/attacks.ts` SHALL have zero `BigInt` (CI rg).
- `target ES2020` (no downlevelIteration), `sideEffects:false`, `exports` map for tree-shaking.

## Goals / Non-Goals

**Goals:**
- MIT `purechess` library per `purechess-{rules,board-movegen,pgn-fen}` with `src/{squareSet,attacks,board,fen,san,pgn,chess960,chess}.ts` + `src/index.ts`, `const enum` inlined, `.d.ts` via `genType`/native, `package.json` exports `.`/`.core`/`.pgn`/`.chess960` + shims `purechess/chessops`, `purechess/chessjs`.
- Black Magic via `bench/magic-tables/{rook,bishop}.json` (MIT, RecklessMagics) — default plain uniform 11 (homogeneous), Fancy alternative supported via same JSON schema (per-square shift/offset) with byte-identical attacks.
- `makeSan` byte-identical to `chessops` so `useChessMoveAnnouncer` + `AriaLiveAnnouncer` + `[`/`]`/`Alt+` unaffected; `enableArrowMoveShortcuts` OFF by default preserved.
- Gates: `MQueens/s` +441%, `perft(6)=119060324`, `games/s` +50%, FEN/SAN parity, bundle gz via `bench/*` (already wired).

**Non-Goals:**
- Workstation migration `src/lib/chess.ts` `chessops` → `purechess` (future BREAKING change, not here; but this change keeps `makeSan` byte-identical to enable it).
- Rust `src-tauri/` changes, DB schema changes, AGPL relicensing (workstation stays AGPL until `rg GPL src/` empty).
- New i18n locales beyond `en,ru,he` for `purechess.*` keys.

## Decisions

### 1. Encoding: `{lo,hi}` plain object, not class
- Chosen: `type SquareSet = { readonly lo: number, readonly hi: number }` with pure functions `and(a,b)`, `or`, `xor`, `not`, `shl`, `shr`, `popcnt`, `first`, `has`, `singleton` etc. `Board` as value of ten `SquareSet` (`white,black,pawn,knight,bishop,rook,queen,king,occupied,promoted`) where `occupied = white|black` and role partition `occupied`. `play` = clone→mutate clone (pure).
- Alt: `class SquareSet` (chessops style) — rejected per spec table (language-neutral `SquareSet` as record), and `class` adds alloc per `or` in TS hot path vs inline `{lo,hi}`.

### 2. Sliding: Black Magic plain fixed-shift uniform 11 default
- Default: `shift=11`, `offset=sq*2048`, flat `64*2048=131072` (or 8192 slice for harness), `index = ((occ & mask) * magic >>>11) + offset` via `Math.imul` split of `lo/hi` without `BigInt`. Homogeneous `>>>11` is most JIT-friendly (bench 47.86 vs Fancy 45.84 +4.4% @10M, both 441% vs HQ 9.35). GopherCheck baseline, ADR-012.
- Alt Fancy: `shift=64-popcnt(mask)` var 52..59, `offset` cumulative, 107648 total — allowed for Stockfish-table compat, generates identical attacks, verified via naive ray for 1000 random occupancies. Spec gates either, but `purechess` default is plain (leanest). JSON contains `magicHex` full 64-bit + `attackTable` of `{lo,hi}`; impl reads `bench/magic-tables/*.json` at build (bundled) not runtime FS.
- Trade: plain wastes table but wins JIT shape; Fancy saves size but adds per-square load.

### 3. Leaper tables: offline, 64-entry, no BigInt
- `knightAttacks`, `kingAttacks`, `pawnAttacks` as constant `SquareSet[64]` generated offline via `computeRange`, verified vs FIDE corners (`knightAttacks(A1)=B3|C2`).

### 4. FEN/SAN/PGN: pure Result-typed, i18n keys
- `parseFen` returns `Result<Setup,FenError>` with `code: fen/*` → `purechess.fen.<code>` in `en/ru/he`; never throw on invalid, only for programmer invariant violations. Same for `parseSan`, `parseUci`, `parsePgn`. No English hard-coded.
- SAN: disambiguation minimal file→rank→both, `+`/`#` via `isCheck`/`isCheckmate` after `play`, tolerant `0-0`→`O-O`, canonical `O-O` output. Must be byte-identical to `chessops` for 10k FENs (bench gate).
- PGN: streaming `PgnParser { feed(chunk); finish(): Result<GameTree> }` with ABNF from `refs/docs-refs/cm-pgn-notes.md` (not pgn-chess-tree source), `GameTree = { headers: Map<string,string>, moves: { san,nags,comments,variations: GameTree[] } }`.

### 5. Chess960: X-FEN default, Shredder tolerant input
- `parseFen(...,{chess960:true})` accepts `KQkq` tolerant + `HAha` X-FEN; `makeFen` emits X-FEN file letters by default, Shredder only with `{shredder:true}`. Castling is king-captures-rook on input, normalized to `G1/C1` + `F1/D1` after `play`.

### 6. Exports / bundle
- `package.json` `"sideEffects": false`, `"exports": { ".": ..., "./core": ..., "./pgn": ..., "./chess960": ... }` plus shims `"./chessops"` and `"./chessjs"`. `const enum` for `Color,Role,Square` inlined. `target ES2020` so `for..of` on `SquareSet` not downleveled (no `downlevelIteration`). Tree-shaking verified via `esbuild` bundle gates.

## Risks / Trade-offs

- [Spec drift] Chess960 960 starts tricky → Mitigation: verify vs python-chess perft for random 960 FEN depth 4.
- [SAN parity] `+`/`#` byte-identical is strict → Mitigation: use same check logic (`kingAttackers` after `play`) as chessops, property test vs chessops for 1k random pos.
- [Magic tables] plain 131k vs Fancy 107k size → Mitigation: both pass gate; plain is default but builder can swap to Fancy by reading per-square `shift/offset` without code change.
- [Purity cost] `Board` as value clones 10 SquareSets per `play` → Mitigation: hot loop keeps local `let` mutables inside pure function (allowlist `src/attacks/*`, `src/squareSet/*`), bench target +15% perft vs chessops still reachable.

## Migration Plan

- This change only adds `purechess` lib under `src/` (or `src/purechess/`), does not swap workstation imports. Next change swaps `src/lib/chess.ts: import { Chess } from "chessops"` → `"purechess"` and `purechess/chessjs` shim, verified by `rg GPL src/` empty and `npm run typecheck && cargo check`.
- Rollback: revert package.json exports addition, keep fallback `chessops` path.

## Open Questions

- None — all gates locked in specs + bench results.
