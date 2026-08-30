# Sliding — TS compile optimizations (ESNext vs ES5) — 2026-08-30

**Question:** Which `tsconfig` wins for `purechess` hot loop?  
**Harness:** `bench/bench-sliding.mjs` + two new lanes:

- `black-magic-opt` — Optimized TS: `target ES2020` + `module ESNext` + `downlevelIteration:false` + `const enum` inlined + `/* @__PURE__ */` + `removeComments:true` + `importHelpers:false` (inline)
- `black-magic-es5` — Downleveled TS: `target ES5` + `module CommonJS` + `downlevelIteration:true` + `__values` helper per `for...of` (per mariusschulz, xjavascript)

Also re-measures `var` vs `let` and `purejs` vs `TS` for reference.

## 1M (5-run median)

```
  hq                   9.61 MQueens/s
  black-magic         50.27 (let/const baseline)
  black-magic-var     51.47 (+2.4% vs let)
  black-magic-purejs  50.73 (+0.9%)
  black-magic-opt     51.71 (+2.8%)  — optimized TS
  black-magic-es5     28.95 (-42.4% vs let) — ES5 + __values
  rescript-lohi       34.10 (-32% vs let)
  bigint               3.44 (14.6× slower)
```

## 10M (5-run median) — full

```
  hq                  10.09
  black-magic         50.88  (baseline)
  black-magic-var     51.73  (+1.7% vs baseline)  — var
  black-magic-purejs  50.61  (-0.5% vs baseline)  — pure JS parity
  black-magic-opt     50.98  (+0.2% vs baseline)  — optimized TS parity
  black-magic-es5     30.17  (-40.7% vs baseline) — ES5 slow
  rescript-lohi       34.61  (-32% vs baseline)
  bigint               3.50  (14.5× slower)
```

## Verdict — tsconfig for purechess

* **Modern target wins big:** `ES2020/ESNext` + `module ESNext` + `downlevelIteration:false` is **40% faster than ES5** (50.88 → 30.17). The `__values` iterator helper allocates an object + `next()` per square — exactly the tax mariusschulz warned about for `for...of` on `Set`/`Map`/strings. For `purechess` we keep `downlevelIteration:false` and write plain `for (let i=0;...)` loops (never `for...of` on iterables in hot path).
* **Optimized TS (const enum + @__PURE__ + ESNext) is parity with baseline let/const** — 50.98 vs 50.88 (+0.2%). `const enum` inlining (e.g., `Role.Pawn` → `0`) saves an object lookup, but queenAttacks itself is already just numbers, so no measurable MQueens/s win here. It *does* win on bundle size: `const enum` → 0 bytes, `enum` → ~150 bytes per enum; `object as const` → ~50 bytes [dev.to/maximlogunov]. For `purechess` we use `const enum` for internal constants (Role, File, Rank, Square) and `object as const` for public API where iteration needed.
* **`var` vs `let` is still noise** — +1.7% @10M, +2.4% @1M, within variance (see `sliding-2026-08-30-var-purejs.md` — var worst 194.1 > let best 190.7). Keep `let`/`const`.
* **Pure JS parity** — `purejs` 50.61 vs `let` 50.88 is noise; TS types erase.

### Recommended tsconfig for purechess (from blog.overctrl, TS handbook)

```json
{
  "compilerOptions": {
    "target": "ES2020",           // keep native `let`/`const`/`>>>`/`Math.imul` — not ES5
    "module": "ESNext",           // keep `import` for tree-shaking (Rollup/esbuild)
    "lib": ["ES2020"],
    "downlevelIteration": false,  // NO __values helper — use indexed `for` in hot path
    "useDefineForClassFields": false, // if we add classes later, faster field init
    "importHelpers": false,       // inline small helpers, or true+tslib for larger bundle saving
    "removeComments": true,
    "sourceMap": false,
    "declaration": true,
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  }
}
```
Front-end bundler then does `esbuild --bundle --minify --tree-shaking` (ESBuild was ~20% smaller than Webpack in blog.overctrl Config C vs A).

## Repro

```bash
node bench/bench-sliding.mjs --iters 1000000 --algo all
node bench/bench-sliding.mjs --iters 10000000 --algo all
cat bench/results/sliding-2026-08-30-opt.md
```
