# ADR-012: PureChess Library Toolchain — TS, Functional Style, Black Magic, and TS Compile Opts

**Status:** Accepted (August 2026)
**Deciders:** Phase 1 baseline bake-off (Task 1), `bench/results/sliding-2026-08-30.md` + `sliding-2026-08-30-var-purejs.md` + `sliding-2026-08-30-opt.md`
**Related:** ADR-001 (AGPL taint), ADR-010 (chessops migration), `purechess-library` proposal/design/specs, `bench/README.md`

## Context

Phase 1 had to lock three choices before Phase 2 could write language-neutral specs:

1. **Board encoding** for 64-bit bitboards in JS — `BigInt`, `{lo,hi}` pair, `BigUint64Array`?
2. **Slider algorithm** — Hyperbola Quintessence (HQ, what `chessops` uses) vs Black Magic (plain fixed-shift) vs fancy magic vs HQ vs `PEXT`?
3. **Language + style** — PureScript vs ReScript vs TS functional vs TS `var` vs vanilla JS? And which `tsconfig` actually wins for hot loops vs bundle?

All had to be *measured*, not guessed, on the same harness (`bench/bench-sliding.mjs`, 10M random occupancies, 5-run median, `MQueens/s`, Node `v24.19.0` pinned to `v22.5.0` spec) vs `chessops@0.15.1` baseline.

## Decision

### 1. Language: TS, functional API only (non-mutable userdata) — inside imperative for max perf

- **Chosen:** **TypeScript (strict) — functional *only* at the public API boundary (non-mutable userdata), imperative *inside* for max perf.** Public types are `readonly` (`Board`, `Position`, `Setup` fields `readonly`, `CastlingRights` as `ReadonlySet`); every public op returns a fresh value and never mutates its input (`parseFen: string → Result<Setup>`, `makeMove(pos, move) → Position`). Inside the boundary (hot loops `src/attacks.ts`, `src/squareSet.ts`, `src/board.ts`) the code is imperative for speed: `WritableBoard` scratch, `clearSquareInPlace`/`putPieceInPlace`, `forEachSquare`, `let`/`while` mutables. ReScript honest Black Magic (`RescriptLohi.res` → `RescriptLohi.bs.js`) was **32% slower than TS** on identical tables (34.83 vs 51.73 MQueens/s @10M, `sliding-2026-08-30.md:10M`). PureScript was rejected earlier (heavier `Eff`/`ST`, larger output). ReScript stays viable for PGN/tree (functional) but not for `attacks`.
- **Alternative:** ReScript `{lo,hi}` manual (no `Int64` runtime, no Belt) — same `{lo,hi}` layout as TS, but compiled JS added wrapper + `Belt.Array.getExn` overhead. PureScript `purescript-js-bigints` / `purescript-int64` (WASM or `long.js`) — not measured, heavier.
- **Rationale:** TS gives best `MQueens/s`, zero toolchain, smallest `lib/bs` cache (now `.gitignore`d), largest hiring pool, and `.d.ts` natively. See `bench/results/sliding-2026-08-30.md:10M`.

### 2. Board encoding: `{lo,hi}` pair (two `int32`) — not `BigInt`

- **Chosen:** **`{lo: number, hi: number}` pair** (each `| 0` / `>>>0`). Same as `chessops` `SquareSet` (`squareSet.ts:14`).
- **Measured:** `BigInt` at 3.41–3.51 MQueens/s is **14.4–14.9× slower than Black Magic lo/hi** (`sliding-2026-08-30.md`). `BigInt` is a heap object (`{sign, digits}`) + C++ call per op (`tc39/proposal-bigint#117`), not a register. Rejected for hot path (kept for correctness tests only).
- **Alternative:** `BigInt` / `BigUint64Array` — correct but not hot-path viable until V8 ships `BigInt-int64` fast path (not in `v24`).

### 3. Slider: Black Magic fancy per-square (lo/hi) — not HQ, not plain uniform 11

- **Chosen:** **Black Magic fancy per-square variable shift** (`mask & occ → Math.imul(masked, magic) >>> perSquareShift + perSquareOffset → table[idx]`) with per-square `mask/magic/shift/offset` + `bench/magic-tables/*.json` (rook 102400 + bishop 5248 = 107648 entries, gzip+base64 blobs) generated offline via MIT `RecklessMagics`/`magic-bits`. **Fancy chosen as default because it minimizes table footprint** (plain uniform 11 would be `64*2048=131072` per piece → 262k total, larger than Fancy 107k; bench `sliding-2026-08-30-plain-vs-fancy.md`: plain 47.86 vs Fancy 45.84 → plain +4.4% @10M, both `>330%` vs HQ, i.e. parity — so we pick the smaller table). `bench/magic-tables/*.json` now stores Fancy per-square `maskLo/maskHi`, `magicHex/magicLo/magicHi`, `shift`, `offset`, `attackTable` as blobs.
- **Measured:** Real `chessops` HQ (hyperbola: `minus64` + `bswap` per ray, `SquareSet` alloc) at **9.35–10.09 MQueens/s** vs TS Black Magic fancy at **45.84–51.73** → **+420–441%** (>30% gate) (`sliding-2026-08-30.md:10M`). Synthetic HQ stub at 148 was 15.8× too fast — replaced by honest `bench/candidates/hq.mjs` wrapping `chessops`.
- **Alternative:** HQ hyperbola quintessence (`chessops` choice: smaller tables, 2.1 → 2.3 kB gz, but more ops) — wins table size but loses `MQueens/s`. Plain fixed-shift uniform 11 (homogeneous `>>>11`, `bench/results/sliding-2026-08-30-plain-vs-fancy.md`) — allowed alternative, generates identical attacks and is `+4.4%` faster than Fancy at 10M in one run but larger table; either is correct, Fancy is default for footprint. `PEXT` not in JS (requires BMI2/WASM).

### 4. Functional style: the public API MUST be functional (users expect it), the inside MUST be fast (allowlist + type-enforced boundary)

- **Chosen:** **Functional API as a product contract, imperative performance inside.** The public API is functional *because that is what users of a chess library expect*: pure functions with `string → Result<Setup>`-style signatures, every op returning a new value and never mutating its input (`parseFen: string → Result<Setup>`, `makeMove(pos, move) → Position`, `Board` as `readonly` value). This is not stylistic FP advocacy — it is the user-facing contract, and it is **runtime-enforced**: `tests/purity.mjs` deep-freezes inputs (accidental in-place writes throw in strict-mode ESM) and snapshot-compares them before/after every op.
- **Inside the boundary, the goal is maximum performance, not paradigm purity.** Hot loops use the zero-alloc primitives (`WritableBoard` scratch with `clearSquareInPlace`/`putPieceInPlace` raw bit ops, `forEachSquare`, mask-trusted legality, lazy Set cloning); local `let`/`while` mutables inside pure functions are sanctioned in `src/attacks/*` + `src/squareSet/*` (ESLint allowlist). No `Immutable.js`, no `Array.map` per square in hot path.
- **Trade-off rule:** accept a performance cost only when a *small* cost buys a *large* win in another axis. Applied examples — taken: type-level `readonly` on `Setup`/`Position` fields and `ReadonlySet<number>` on `CastlingRights` (zero runtime cost, TS erases it; makes caller mutation of shared sub-objects a compile error); structural sharing of unchanged sub-objects between input and output Positions (zero cost, big GC win). Rejected: defensive deep-copies of returned positions (large runtime cost, no user-visible win); strict FP (`fp-ts`, persistent `Board`) (measurably slower, alloc per `or`/`and`).
- **Structural-sharing contract:** `makeMove` may return a Position that *shares* unchanged sub-objects with its input (e.g. `castling.white` when rights are unchanged). The library never mutates shared sub-objects (purity suite verifies), and the public types (`ReadonlySet`, `readonly` fields) make user-side mutation a type error, so sharing is safe by construction.
- **Rationale:** `chessops` is already hybrid (`SquareSet` immutable, `Board`/`Position` mutable classes with `clone()`). Pushing purity one level higher (Board as value) catches `FEN`/`PGN` bugs (exhaustiveness) while keeping `MQueens/s`. Tests are property-based: `makeFen(parseFen(fen)) == fen`, `perft(6) == 119060324`.
- **Alternative:** Mutable OO core API (chess.js style) — rejected: mutability is what users must defensively clone around; the compatibility shims (`src/chessops.ts`, `src/chessjs.ts`) provide those shapes for migration only, layered *on top of* the functional core, never beside it.

### 5. `var` vs `let`/`const` — keep `let`/`const`

- **Chosen:** Keep **`let`/`const`** project-wide (ES2020).
- **Measured:** `black-magic-var` (every binding `var`) at 52.53 vs `let/const` at 51.73 → **+1.7% @10M** (+4.6% @1M), within 5-run jitter (`var` worst 194.1 > `let` best 190.7, `sliding-2026-08-30-var-purejs.md`). V8 2023+ elided TDZ checks (`v8.dev/holiday-2023`, jmrk comment on StackOverflow), so the old 4× myth is dead. `var`’s function scope buys bugs (hoisting, closure `for(var i)`) for noise. Allow `var` only via `/* eslint-disable */` in `src/attacks.ts` if a future 20-run median on pin `v22.5.0` proves >5% stable win.
- **Alternative:** `var` everywhere via `target: ES5` — rejected.

### 6. Vanilla JS vs TS — parity

- **Measured:** `black-magic-purejs` (hand-written vanilla JS, no `readonly`, no `Result`) at 50.61 vs TS `let` at 50.88 → **-0.5% @10M** (parity, `sliding-2026-08-30-var-purejs.md`). TS types erase to same JS; `const rMag = ...` emits same `let`/`const`. No runtime cost.
- **Decision:** Stay TS (strict) for exhaustiveness (`switch(role)` must handle 6 cases, `Square | undefined` → `Option`), `.d.ts` generation, and `genType`-free ESM.

### 7. TS compile opts — modern target wins bundle, not hot loop

- **Chosen `tsconfig` for `purechess` (library):**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "downlevelIteration": false,
    "useDefineForClassFields": false,
    "importHelpers": false,
    "removeComments": true,
    "sourceMap": false,
    "declaration": true,
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  }
}
```

- **Measured:** `black-magic-opt` (this config, `const enum` inlined, `/* @__PURE__ */`) at 50.98 vs baseline `let` at 50.88 → **+0.2% @10M** (parity) but **bundle -25–30%** vs `ES5/CommonJS` (blog.overctrl Config B→C: 2.8→2.1 kB gz). `black-magic-es5` (`target ES5` + `downlevelIteration:true` + `__values` helper) at 30.17 vs 50.88 → **-40.7%** (`sliding-2026-08-30-opt.md:10M`). `__values` allocates an iterator per square (per mariusschulz 2017, xjavascript 2026). For `purechess` we keep `downlevelIteration:false` and write indexed `for (let i=0; ...)` in hot path, never `for...of` on iterables.
- **Enum:** `const enum Role { Pawn=0, ... }` → **0 bytes** (inlined `0`), `enum` → ~150 bytes IIFE, `object as const` → ~50 bytes (`dev.to/maximlogunov`). Use `const enum` internally, `object as const` for public API where iteration needed.
- **Alternative:** `target ES5` — rejected (bloat + 40% slower on `__values` path). `importHelpers:true` + `tslib` — saves ~500 bytes if many helpers, but for this hot file inline is fine.

### 8. Module split for tree-shaking

- **Chosen:** `purechess/core` (Board, SquareSet, `Chess`, FEN/SAN/UCI), `purechess/pgn` (streaming parser + `GameTree`), `purechess/chess960` (960 castling tables). `package.json` `sideEffects:false`, `exports` map, `esbuild --bundle --minify` (ESBuild ~20% smaller than Webpack per blog.overctrl).
- **Measured:** `purechess/core` gz 11.5% smaller than `chessops` full in stub (`bench-bundle.mjs`); target **≥30% smaller** after tree-shake (spec gate, `bench-results/sliding-2026-08-30-opt.md` bundle).

## Consequences

### Positive
- Fastest JS hot path measured: Black Magic TS `{lo,hi}` beats HQ by 4× and ReScript by 1.5×, BigInt ruled out with data.
- `let`/`const` + TS strict catches `FEN`/`PGN`/`Chess960` branching bugs (exhaustive `switch`, `Option`) with zero `MQueens/s` cost (pure JS parity).
- Modern `tsconfig` gives 25–30% bundle win and future-proofs `ESNext` tree-shaking without hot-loop regression.

### Negative
- `const enum` inlines lose runtime iteration (must use `object as const` for public API).
- `downlevelIteration:false` requires discipline: no `for...of` on `Set`/`Map`/strings in hot path.
- ReScript toolchain added (`rescript@12.3.1`, `RescriptLohi.res`) but not used for hot path — kept for PGN/tree if needed; adds `lib/bs` cache (now `.gitignore`d).

## Alternatives Considered

- PureScript `purescript-js-bigints` / `purescript-int64` (WASM or `long.js`) — heavier output, `Eff` wrapping cost, not benched.
- ReScript `Int64 (caml_int64)` — function-call per `and`/`or` vs inline `&`/`|`, not benched.
- WASM `i64` (`AssemblyScript`/`wasm-bindgen`, Stockfish.wasm precedent) — deferred to optional `purechess/wasm` entry; JS `lo/hi` already beats HQ, and WASM adds `SharedArrayBuffer` + `instantiateStreaming` boundary tax for PGN strings.
