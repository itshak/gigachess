## Context

See `proposal.md` — Why for motivation. This design explains **how** to deliver the three new language-neutral capability specs (`purechess-rules`, `purechess-board-movegen`, `purechess-pgn-fen`) and the checked-in magic tables without touching workstation `src/` or reading GPL sources in the impl lane.

Current state (Phase 1 archived 2026-08-30):

- `openspec/specs/{purechess-baseline,purechess-benchmarks}` are Source of Truth. Baseline locked the clean-room wall (`refs/gpl-only/` gitignored, impl reads only `refs/mit-permissive/` + `refs/docs-refs/`) per ADR-001/010, and the harness + bake-off (`bench/results/sliding-2026-08-30.md`). Bake-off winner is **TS functional `{lo,hi}` + Black Magic plain fixed-shift** (51.73 MQueens/s, +441% vs HQ at 9.35, +48% vs honest ReScript at 34.83), BigInt ruled out at 14.9× slower. See ADR-012, `bench/README.md`, `bench/magic-tables/*.json`.
- `refs/gpl-only/` (chessops, Stockfish, pgn-chess-tree) is spec-agent only. `pgn-chess-tree` is author-owned but AGPL-tainted (imports chessops + lichess GPL) → never copy, re-spec only.
- `src/` has no `purechess` implementation yet; this change is **spec only** (no code).

Constraints for Phase 2 spec:

- SHALL be language-neutral: data types, ABNF, Given/When/Then, tables — no GPL code/docstring verbatim.
- SHALL forbid `BigInt` in hot path, SHALL use `{lo,hi}` pair per ADR-012.
- SHALL keep `purechess` tree-shakeable (`sideEffects:false`, `exports` map) and ES2020/ESNext bundle win (-25–30% vs ES5, -40.7% if downleveled).
- Accessibility and i18n invariants propagate: keyboard `[ ]` / `Alt+` chords, `AriaLiveAnnouncer`, `en/ru/he` keys for every user-facing error.

## Goals / Non-Goals

**Goals:**

- Emit three delta specs that an impl agent can build `purechess` npm from using only `refs/mit-permissive/` + `refs/docs-refs/` + checked-in JSON — never `refs/gpl-only/`.
- Pin **plain fixed-shift uniform 11** Black Magic tables as default (homogeneous, most performant for JS per `bench/results/sliding-2026-08-30-plain-vs-fancy.md`: plain 47.86 vs Fancy 45.84 → plain +4.4% @10M, both >330% vs HQ), with **Fancy per-square variable shift (`shift=64-popcnt`, offset cumulative, rook 102400 bishop 5248 total 107648) as allowed alternative** for Stockfish-table compatibility (bench shows plain vs Fancy are parity). Either keeps the same `plain fixed-shift` algorithm family that won the bake-off (51.73 vs HQ 9.35 → +441%).
- Define module split (`purechess/core`, `purechess/pgn`, `purechess/chess960`) and TS compile opts so `purechess/core` gzipped is ≥30% smaller than `chessops` full and `purechess/pgn` is not bundled when importing core.
- Preserve FIDE 2023 + Chess960 (X-FEN `HAha` / Shredder `KQkq` tolerant) semantics with perft oracle `perft(6)=119060324` as correctness gate.

**Non-Goals:**

- No `src/` implementation, no `bench/candidates/` changes, no WASM lane (`purechess/wasm` deferred per ADR-012), no `chess.js` compat shim beyond API mapping table.
- No workstation integration (`src/lib/chess.ts` migration) — follow-up impl change.
- No new runtime npm/cargo deps in this spec change; `RecklessMagics` runs offline to generate JSON (MIT, not runtime).
- No DB schema changes, no engine UCI spawning.

## Decisions

### Decision: JS-only v1, TS functional strict — no WASM, no ReScript for hot path

- **Chosen:** TypeScript (strict) functional style for the public API, imperative inside hot loops only via allowlist (`src/squareSet.ts`, `src/attacks.ts`, `src/board.ts`). ReScript proved 32.7% slower than TS on identical Black Magic tables (34.83 vs 51.73 MQueens/s @10M) and WASM adds `instantiateStreaming` + `SharedArrayBuffer` boundary tax for PGN strings.
- **Alternative:** ReScript `Int64`/`caml_int64` (function-call per `and`/`or` vs inline `&`/`|`), PureScript `Eff/ST`, AssemblyScript WASM `i64` — rejected per ADR-012 bake-off data. ReScript remains viable for PGN/tree functional layer if impl wants it, but not for `attacks`.
- **ADR refs:** ADR-012 sections 1,4,5,6,7.

### Decision: Pure at boundary, imperative in hot loop (clone→mutate clone) + allowlist

- **Chosen:** All public functions are pure: inputs are `readonly`, output is new value. `Position`/`Board` are `readonly` values; `play(pos, move): Position` clones then mutates clone, never mutates input. `parseFen: string → Result<Setup, FenError>`, `parsePgn: string → Result<GameTree>` etc. Inside `bishopAttacks`, `rookAttacks`, `queenAttacks`, `between`, `ray`, `SquareSet` ops, local `let`/`while` mutables are allowed — ESLint allowlist `src/attacks/**` + `src/squareSet/**` only. No `Array.map` per square in hot path, no `for...of` on iterables (would need `downlevelIteration`).
- **Alternative:** Strict FP (`fp-ts`, persistent `Board`, `Immutable.js`) — rejected: alloc per `or`/`and` hurts `MQueens/s`.
- **Rationale:** `chessops` is already hybrid (immutable `SquareSet`, mutable `Board` classes with `clone()`); pushing purity one level higher catches FEN/PGN branching bugs via exhaustive `switch` on `Role`/`Color`, with zero `MQueens/s` cost (pure JS parity, ADR-012 section 6).

### Decision: `{lo,hi}` SquareSet and Board value type — forbid BigInt in hot path

- **Chosen:** `type SquareSet = { readonly lo: number, readonly hi: number }` where each is `uint32` (`|0` / `>>>0`), representing bit 0–31 in `lo` and 32–63 in `hi`. Ops: `and/or/xor/not/shl/shr/minus/popcnt/first/traverse` etc. implemented with inline `&| ^ ~ << >>>` and `Math.clz32`/`Math.imul`. `type Board = { readonly white: SquareSet, readonly black: SquareSet, readonly pawn: SquareSet, readonly knight: SquareSet, readonly bishop: SquareSet, readonly rook: SquareSet, readonly queen: SquareSet, readonly king: SquareSet, readonly occupied: SquareSet, readonly promoted: SquareSet }` — same shape as `chessops` `Board` but as `readonly` value, not class. `occupied = white.or(black)` invariant. `promoted` tracks promoted pieces for Shredder/X-FEN.
- **Alternative:** `BigInt` / `BigUint64Array` / `BigInt.asUintN` — rejected: harness `D: bigint` at 3.47 MQueens/s is 14.9× slower than `B: black-magic lo/hi` (ADR-012 section 2, `tc39/proposal-bigint#117` heap object + C++ call per op). `BigInt` remains allowed in tests/oracles only, **SHALL NOT** appear in `src/squareSet.ts` or `src/attacks.ts` hot path.
- **Why pair wins:** Two `int32` stay in registers, JIT inlines `&|`, no allocation.

### Decision: Black Magic plain fixed-shift uniform 11 (default) — Fancy per-square as allowed alternative

- **Chosen (default):** **Black Magic plain fixed-shift uniform 11** (`index = ((occ & mask) * magic >>> 11) + sq*2048`) with per-square `mask` (edges excluded), `magic` (64-bit, stored as `magicHex` + `magicLo/magicHi`), `shift = 11` fixed homogeneous, `offset = sq * 2048` uniform, flat `attackTable` `64*2048=131072` (harness may use 8192 slice). Homogeneous `>>> 11` is most JIT-friendly (stable shape, `bench/results/sliding-2026-08-30-plain-vs-fancy.md`: **plain 47.86 vs Fancy 45.84 → plain +4.4% @10M**, both `>330%` vs HQ 10.50). GopherCheck baseline, ADR-012. **Fancy per-square variable (`shift = 64 - popcount(mask)` 52..59, `offset` cumulative, rook 102400 bishop 5248 total 107648) is allowed alternative** for Stockfish-table compatibility — generates identical attacks via same `RecklessMagics` crate (`refs/mit-permissive/RecklessMagics`, seed `0xFFAAB58C5833FE89`) and `magic-bits` header verified, same `bench/magic-tables/{rook,bishop}.json` schema (**no GPL copy**). Either keeps the `+441%` vs HQ gate (`bench/results/sliding-2026-08-30.md` 9.35→51.73). Default `purechess` SHALL use plain uniform; `purechess-board-movegen` spec notes Fancy as alternative.
- **Alternative (not chosen):** HQ hyperbola quintessence (`chessops` choice, `minus64` + `bswap` per ray, smaller tables but +420% slower) — rejected. Fancy per-square saves size vs naive plain 1<<12 (262k) vs plain 131k vs Fancy 107k, but plain uniform 11 is leanest for harness (8k slice) and marginally faster; Fancy is parity, not win, so treat as alternative.
- **ADR refs:** ADR-012 sections 3, 2. Bench: `bench/results/sliding-2026-08-30-plain-vs-fancy.md`.

### Decision: Module split for tree-shaking + ES2020/ESNext + const enum

- **Chosen `package.json`:** `sideEffects:false`, `exports` map:
  ```
  "exports": {
    ".": "./dist/index.js",                 // re-export all (≤110% of chessops gz)
    "./core": "./dist/core.js",             // Board, SquareSet, Chess, FEN/SAN/UCI (no PGN, no Chess960)
    "./pgn": "./dist/pgn.js",               // parsePgn/makePgn/GameTree + streaming
    "./chess960": "./dist/chess960.js"      // 960 castling tables + X-FEN helpers
  }
  ```
  Consumer `import { Chess } from "purechess/core"` SHALL NOT include `parsePgn` or Chess960 tables (verified via `esbuild --bundle --minify` and `bench/bench-bundle.mjs`).
  `tsconfig.json` for library:
  ```json
  {
    "compilerOptions": {
      "target": "ES2020", "module": "ESNext", "lib": ["ES2020"],
      "downlevelIteration": false, "useDefineForClassFields": false,
      "importHelpers": false, "removeComments": true, "sourceMap": false,
      "declaration": true, "strict": true, "verbatimModuleSyntax": true, "isolatedModules": true
    }
  }
  ```
  Use `const enum Color { White=0, Black=1 }`, `const enum Role { Pawn=0, Knight=1, Bishop=2, Rook=3, Queen=4, King=5 }`, `const enum Square { A1=0, ... H8=63 }` → 0 bytes (inlined), vs `enum` ~150 bytes IIFE, vs `object as const` ~50 bytes (kept for public API where iteration needed). No `for...of` on `Set`/`Map`/strings in hot path; use indexed `for (let i=0; i<n; i++)`.
- **Alternative:** `target ES5` + `downlevelIteration:true` (`__values` helper per iteration) — rejected: -40.7% @10M and +25–30% bundle (`sliding-2026-08-30-opt.md`). `importHelpers:true` + `tslib` — rejected for hot file (inline is fine).
- **ADR refs:** ADR-012 sections 7,8.

### Decision: PGN streaming state machine (like cm-pgn/python-chess) + GameTree re-specified

- **Chosen:** PGN ABNF (see `purechess-pgn-fen` spec) with headers `[Key "Value"]`, movetext `SAN` + `NAG $1` + `{} braces` + `; line` + `() variations` + result `*|1-0|0-1|1/2-1/2`, SAN disambiguation, `%` escape. Parser is **chunked streaming**: `Parser` holds `buffer: string`, `state` enum (`HeaderKey, HeaderValue, Movetext, CommentBrace, CommentLine, VariationDepth, StringEscape`), `offset`, `headers: Map`, `stack: GameTree[]` for variation depth. `feed(chunk: string): void` appends and advances without re-scanning whole file; `*` yields `GameTree` node `{ headers: Map<string,string>, moves: Array<{ san: string, nags: number[], comments: string[], variations: GameTree[] }> }` re-specified from `pgn-chess-tree` behavior (not source) — author-owned but AGPL-tainted, so only ABNF/state-machine described. `makePgn(tree): string` round-trips `parsePgn` via same ABNF (whitespace normalized, but `makePgn(parsePgn(pgn))` parseable and `games/s` gated).
- **Alternative:** Whole-file `split`/`regex` — rejected: `bench/bench-pgn.mjs` gates `games/s` ≥50% vs `chessops` and peak heap ≤110% require chunked, not `readFileSync`.
- **Refs:** `refs/docs-refs/cm-pgn-notes.md`, `refs/docs-refs/python-chess-notes.md`.

### Decision: Chess960 X-FEN/Shredder-FEN dual input, X-FEN output, castling truth tables

- **Chosen:** `parseFen` accepts both Shredder (`KQkq`) and X-FEN (`AHah` file letters) castling fields; `makeFen` emits **X-FEN** by default, Shredder via `options: { shredder: true }`. Castling rights stored as `SquareSet` rook origins or `Set<Square>` per color, not as string. 960 legality: king and rooks may start on any squares per Fischer shuffle 960; after `O-O`/`O-O-O` king ends on `g1/c1` (White) or `g8/c8` (Black) and rook on `f1/d1` etc., regardless of start files. Truth table enumerates all 960 starts (like `python-chess` `Board(chess960=True)`). `castling_xfen()` helper mirrors `python-chess`.
- **Alternative:** Emit Shredder always — rejected: FIDE 960 mandates X-FEN.

### Decision: Result-type errors + i18n + perft oracle

- **Chosen:** Never throw on invalid FEN/PGN/SAN/UCI. Return `Result<T, E>` where `E` is discriminated union with `code: 'fen/invalidPiecePlacement' | ...` mapping to `i18n` keys `purechess.fen.<code>` in `en, ru, he`. `perft(pos, depth): number` (JS `number` safe until depth 6, `perft(6)=119060324` from startpos) is oracle for movegen correctness; property tests `makeFen(parseFen(fen)) === fen` (normalized) and `makeSan` + `parseSan` round-trip.

## Risks / Trade-offs

- **[Risk] ReScript `RescriptLohi.res` was 32.7% slower than TS on same tables; contributor may still want ReScript for PGN/tree** → Mitigation: Keep `specs` language-neutral and `src` readable (`let`/`for`); PGN tree may be ReScript if impl proves it doesn't regress `games/s` vs `chessops`, but hot path SHALL stay TS. Gate: `bench:ci` fails if `MQueens/s` regresses.
- **[Risk] BigInt temptation for magic multiply (64-bit)** → Mitigation: Spec forbids `BigInt` in `src/squareSet.ts`/`src/attacks.ts`; CI `rg "BigInt" src/` must be empty. Correctness tests may use `BigInt` for oracle, but hot path uses `Math.imul` split.
- **[Risk] GPL contamination via docstrings or pgn-chess-tree copy** → Mitigation: Spec agent checklist — no verbatim `chessops` comments, magic JSON via MIT `RecklessMagics`/`magic-bits` only, `rg GPL src/` empty, `pgn-chess-tree` re-specified abstractly (ABNF/state machine, not source). `LICENSE` MIT + `NOTICE` lists only MIT deps.
- **[Risk] Per-square Fancy tables 107k entries larger than uniform 8192 stub → bundle grows** → Mitigation: Tables are `esbuild` bundled but `purechess/core` without PGN still ≥30% smaller than `chessops` full; table is ~400 KB uncompressed, ~100 KB gz, acceptable vs HQ's 2.1 kB gz tradeoff for +441% speed.
- **[Risk] `const enum` loses runtime iteration for public API** → Mitigation: Use `const enum` internally, `object as const` with `as const satisfies` for exported `ROLES`, `SQUARES` arrays where iteration needed.
- **[Risk] PGN variations/NAGs/comments complexity (nested, streaming)** → Mitigation: State machine with explicit `variationDepth` stack, property tests vs `python-chess` corpus (`bench/data/lichess_db.sample.pgn` 10-game tiny + 100k full) for `makePgn(parsePgn)` round-trip parity.
- **[Risk] Chess960 castling edge cases (king ends g1/c1 even when rook starts far)** → Mitigation: Truth table in `purechess-rules` spec enumerates all 960 starts, property test vs `python-chess` `chess.Board(chess960=True)`.
- **[Risk] `downlevelIteration:false` requires discipline (no `for...of` on iterables in hot path)** → Mitigation: ESLint rule `no-restricted-syntax` for `ForOfStatement` in `src/attacks/**`, use indexed `for`.

## Migration Plan

1. Land this spec change (`purechess-spec`) — no code, only `openspec/specs/*` deltas + `bench/magic-tables/*.json` (this PR). Validate via `openspec validate --changes --strict`.
2. Spawn impl change (`purechess-impl`) owned by impl agent (reads only `specs/` + `refs/mit-permissive/` + `refs/docs-refs/`, never `refs/gpl-only/`). Implements `purechess/core`, `purechess/pgn`, `purechess/chess960` per specs, with `src/squareSet.ts` `{lo,hi}`, `src/attacks.ts` Black Magic, `src/board.ts`, `src/fen.ts`, `src/san.ts`, `src/pgn.ts`, `src/chess960.ts`.
3. Gate impl via `npm run typecheck`, `cd src-tauri && cargo check` (no Rust change but verify), `npm run bench:ci` (all SHALL gates: `MQueens/s` +441%, `perft(6)` count, `games/s` +50%, FEN/SAN parity, bundle gz).
4. Future workstation migration (`src/lib/chess.ts` from `chessops` to `purechess` + `purechess/chessops` shim) — separate change, gated on keyboard `[ ]`/`Alt+` and `AriaLiveAnnouncer` parity via VoiceOver/NVDA.

Rollback: Delete `openspec/specs/purechess-*` deltas and `bench/magic-tables/*.json` — no workstation code affected, so no data migration. Bench harness falls back to uniform-11 stub.

## Open Questions

- None that block spec. WASM lane (`purechess/wasm` with `i64`) remains deferred per ADR-012 until JS ceiling proven too low — spec stays language-neutral so WASM could be added as optional `exports` entry without changing `specs`.

