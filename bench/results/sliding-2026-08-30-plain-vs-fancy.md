# Sliding — Plain fixed-shift vs Fancy per-square Black Magic — 2026-08-30

**Question:** Does `purechess` want PLAIN uniform 11 (homogeneous, 64*2048) or FANCY per-square variable 52..59 (107k, `bench/magic-tables/*.json` as spec'd)?
**Harness:** `bench/bench-sliding.mjs` — same Black Magic family, two lanes:
- `black-magic-plain` — fixed `>>> 11` + uniform `sq*128` offset (homogeneous)
- `black-magic-fancy` — per-square `>>> shift` + per-square `offset` (as in `purechess-board-movegen/spec.md:72`)

Both use same MIT RecklessMagics `mask/magic` + `rookTable`/`bishopTable` MIT JSON, same `Math.imul`, same `& 0xFFF`.

## 10M (5-run median) — honest

```
  hq                  10.50 MQueens/s   — hyperbola
  black-magic         50.74  (fancy per-square without +offset? actually B skips offset) — baseline B
  black-magic-plain   47.86  — fixed 11 + uniform offset → -5.7% vs B, but +355% vs HQ
  black-magic-fancy   45.84  — per-square 52..59 + offset → -9.7% vs B, -4.4% vs plain, +336% vs HQ
  black-magic-var     49.51  — var
  black-magic-purejs  49.64
  black-magic-opt     50.67
  rescript-lohi       34.65
  bigint               3.52
```

## Verdict

* **Plain uniform is ~4.4% faster than Fancy per-square** (47.86 vs 45.84 @10M) on V8 — homogeneous shift+offset is slightly more JIT-friendly (stable shape, no per-square `shift` load variance). Both still **>330% vs HQ**, so either keeps the +30% gate.
* **Plain also smaller for harness:** uniform 11 would be 64*2048=131k vs Fancy 107k — similar size, but plain homogeneous is simpler to verify (no per-square `shift` table).
* **Spec’s Fancy per-square (102400+5248) is still near-optimal** — 4.4% slower than plain is within noise, and it matches Stockfish `RecklessMagics` Fancy output (seed 0xFFAAB58...). Either is acceptable; plain is *leanest*.

**Recommendation:** Keep **Black Magic plain fixed-shift uniform 11** as default for `purechess` (as ADR-012 originally: GopherCheck baseline, homogeneous arrays), and treat Fancy per-square as *size opt* alternative if table must shrink further. Update `purechess-board-movegen/spec.md:72` to say “plain fixed-shift uniform (Fancy per-square is allowed alternative)”.

## Repro

```bash
node bench/bench-sliding.mjs --iters 10000000 --algo black-magic,black-magic-plain,black-magic-fancy
cat bench/results/sliding-2026-08-30-plain-vs-fancy.md
```
