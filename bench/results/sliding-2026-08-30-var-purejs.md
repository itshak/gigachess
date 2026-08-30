# Sliding — var vs let/const vs pure JS (extended bake-off) — 2026-08-30

**Harness:** `bench/bench-sliding.mjs` — same as main sliding, plus two new lanes  
**Node:** `v24.19.0`  
**Candidates added:**
- `black-magic-var` — identical Black Magic but every binding is `var` (no `let`/`const`)
- `black-magic-purejs` — vanilla JS (no TS, pure functions, plain objects) — honest hand-written JS

**Question:** Does compiling TS `let`/`const` → `var` give a 4× mythical win? Does pure JS beat TS?

## 1M iters (5-run median)

```
bench-sliding — 1000000 iters, 5 runs, Node v24.19.0
  hq                   9.70 MQueens/s   103.1 ms  [106.4, 104.2, 103.1, 102.0, 101.2]
  black-magic         48.43 MQueens/s    20.6 ms  [22.8, 20.9, 20.2, 20.6, 20.6]  (let/const)
  black-magic-var     50.64 MQueens/s    19.7 ms  [20.0, 19.8, 19.7, 19.6, 19.7]  (+4.6% vs let)
  black-magic-purejs  49.75 MQueens/s    20.1 ms  [20.1, 20.1, 19.8, 20.1, 19.8]  (+2.7% vs let)
  rescript-lohi       33.51 MQueens/s    29.8 ms  [30.0, 30.2, 29.8, 29.4, 29.8]
  bigint               3.45 MQueens/s   289.8 ms
```

## 10M iters (5-run median) — full

```
bench-sliding — 10000000 iters, 5 runs, Node v24.19.0
  hq                   9.71 MQueens/s  1030.3 ms  [1034.6, 1031.5, 1028.6, 1030.3, 1003.7]
  black-magic         51.73 MQueens/s   193.3 ms  [193.3, 196.9, 196.5, 190.7, 191.5]  (let/const)
  black-magic-var     52.53 MQueens/s   190.4 ms  [194.1, 190.5, 189.2, 190.4, 188.9]  (+1.5% vs let)
  black-magic-purejs  51.71 MQueens/s   193.4 ms  [194.9, 193.4, 193.7, 192.4, 192.6]  (-0.0% vs let)
  rescript-lohi       34.92 MQueens/s   286.4 ms  [289.7, 286.4, 286.1, 286.1, 287.0]
  bigint               3.51 MQueens/s  2851.5 ms
```

## Verdict

* **`var` vs `let`/`const` is noise in 2026 V8** — `var` is **+1.5% @10M**, **+4.6% @1M**, not 4×. TurboFan/Maglev + TDZ elision (v8.dev/holiday-2023) killed the myth. The 4×/3× stories were bogus global-vs-local tests (jmrk comment on StackOverflow).
* **Pure JS == TS (`let`) on this hot loop** — `purejs` 51.71 vs `let` 51.73 @10M is **parity** (±0.0%). TS types erase; `const rMag = ...` compiles to same `let`/`const` that V8 optimizes identically to hand-written `const`.
* **Winner stays TS Black Magic** — 51.73 (TS) vs 52.53 (var) is within run variance; picking `var` for 1.5% is not worth losing `let` scoping + readability. Keep `let`/`const` in `src/attacks.ts`.
* ReScript honest 34.92 is **32% slower than TS/var/purejs** on same Black Magic — confirms language bake-off winner is **TS**.

## Repro

```bash
node bench/bench-sliding.mjs --iters 1000000 --algo all
node bench/bench-sliding.mjs --iters 10000000 --algo all
cat bench/results/sliding-2026-08-30-var-purejs.md
```
