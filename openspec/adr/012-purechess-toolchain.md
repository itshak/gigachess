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

### 1. Language: TS functional (strict) — not PureScript, not ReScript for hot path

- **Chosen:** **TypeScript (strict) functional style** for `purechess` hot path (`src/squareSet.ts`, `src/attacks.ts`). ReScript honest Black Magic (`RescriptLohi.res` → `RescriptLohi.bs.js`) was **32% slower than TS** on identical tables (34.83 vs 51.73 MQueens/s @10M, `sliding-2026-08-30.md:10M`). PureScript was rejected earlier (heavier `Eff`/`ST`, larger output). ReScript stays viable for PGN/tree (functional) but not for `attacks`.
- **Alternative:** ReScript `{lo,hi}` manual (no `Int64` runtime, no Belt) — same `{lo,hi}` layout as TS, but compiled JS added wrapper + `Belt.Array.getExn` overhead. PureScript `purescript-js-bigints` / `purescript-int64` (WASM or `long.js`) — not measured, heavier.
- **Rationale:** TS gives best `MQueens/s`, zero toolchain, smallest `lib/bs` cache (now `.gitignore`d), largest hiring pool, and `.d.ts` natively. See `bench/results/sliding-2026-08-30.md:10M`.

### 2. Board encoding: `{lo,hi}` pair (two `int32`) — not `BigInt`

- **Chosen:** **`{lo: number, hi: number}` pair** (each `| 0` / `>>>0`). Same as `chessops` `SquareSet` (`squareSet.ts:14`).
- **Measured:** `BigInt` at 3.41–3.51 MQueens/s is **14.4–14.9× slower than Black Magic lo/hi** (`sliding-2026-08-30.md`). `BigInt` is a heap object (`{sign, digits}`) + C++ call per op (`tc39/proposal-bigint#117`), not a register. Rejected for hot path (kept for correctness tests only).
- **Alternative:** `BigInt` / `BigUint64Array` — correct but not hot-path viable until V8 ships `BigInt-int64` fast path (not in `v24`).

### 3. Slider: Black Magic plain fixed-shift (lo/hi) — not HQ

- **Chosen:** **Black Magic plain fixed-shift** (`mask & occ → Math.imul(masked, magic) >>> shift → table[idx & 0xFFF]`) with per-square `mask/magic/shift` + `bench/magic-tables/*.json` generated offline via MIT `RecklessMagics`/`magic-bits`.
- **Measured:** Real `chessops` HQ (hyperbola: `minus64` + `bswap` per ray, `SquareSet` alloc) at **9.35–10.09 MQueens/s** vs TS Black Magic at **48.96–51.73** → **+420–441%** (>30% gate) (`sliding-2026-08-30.md:10M`). Synthetic HQ stub at 148 was 15.8× too fast — replaced by honest `bench/candidates/hq.mjs` wrapping `chessops`.
- **Alternative:** HQ hyperbola quintessence (`chessops` choice: smaller tables, 2.1 → 2.3 kB gz, but more ops) — wins table size but loses `MQueens/s`. Fancy magic / `PEXT` — `PEXT` not in JS (requires BMI2/WASM), fancy variable-shift saves table but adds branching, per Gigantua `MQueens/s` harness Black Magic fixed-shift is best for JS (homogeneous arrays, GopherCheck baseline).

### 4. Functional style: pure API, imperative hot loop (allowlist)

- **Chosen:** **Pure at the boundary, imperative inside.** API is pure: `parseFen: string → Result<Setup>`, `play: (pos, move) → pos` (clone + mutate clone, never mutate input), `Board` as `readonly` value (`type Board = { readonly white: SquareSet, ... }`). Hot loop (`bishopAttacks`, `queenAttacks`, `between`) may use local `let`/`while` mutables inside a pure function — enforced by ESLint allowlist `src/attacks/*` + `src/squareSet/*` only. No `Immutable.js`, no `Array.map` per square in hot path.
- **Rationale:** `chessops` is already hybrid (`SquareSet` immutable, `Board`/`Position` mutable classes with `clone()`). Pushing purity one level higher (Board as value) catches `FEN`/`PGN` bugs (exhaustiveness) while keeping `MQueens/s`. Tests are property-based: `makeFen(parseFen(fen)) == fen`, `perft(6) == 119060324`.
- **Alternative:** Strict FP (`fp-ts`, persistent `Board`) — measurably slower due to alloc per `or`/`and`.

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
