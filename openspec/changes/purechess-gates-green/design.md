# Design: purechess-gates-green

## Context

`bench/results/real-2026-08-30.md` (purechess-bench-real) established, with
minimal repros, that 4 of 12 real-world gates fail: perft castling parity
(220 mismatches), fen-san-uci parity (470 ep rejections + 3 makeFen diffs +
360 SAN diffs), dests-terminal parity (6/10,000 positions), and bundle size
(2.25 MB vs 17 KB raw). It also measured the optimization landscape: blob
tables are faster AND smaller, the naive fallback already beats chessops,
and the shipped tables are already fancy-encoded.

## Goals / Non-Goals

- **Goals:** every `npm run bench:real:ci` gate green; core bundle within
  1.2× of the chessops Chess-import with zero table bytes in its static
  graph; sliding ≥3× chessops retained; one consistent castling
  representation backed by measurements; FEN round-trip parity with chessops
  on real corpora.
- **Non-Goals:** BigInt hot path (still forbidden); changing workstation UI
  (san announcements unchanged — `O-O` stays `O-O`); changing the
  chessops@0.15.1 baseline or corpora; optimizing FEN beyond the +20% gate
  (honest amendment if unreachable).

## Decisions

### D1: Castling representation — bake-off, then one representation everywhere

The defects share a root cause: two castling encodings coexist (ADR-013
normalized dests from `allDests`, chessops-style king→rook handling inside
`makeMove`/internal movegen), and neither path fully implements its own
contract. Fix options:

- **A. Keep normalized (e1g1) everywhere** — fix `makeMove` (two-square king
  move toward own rook with right → move king AND rook), `makeSan`
  (`O-O` detection), internal `perft` movegen.
- **B. Adopt king-captures-rook (e1h1) everywhere** — matches chessops and
  the 960 input path; public `dests`/`makeUci` change; `tests/parity.mjs`
  canonicalization helpers get deleted; workstation `move.to` consumers
  change.

**Decision procedure:** measure `allDests`, `makeMove`, `parseSan`, `perft`
on the castling-heavy corpus subset under both representations (the
representation change is localized to movegen/apply/detect, so both
variants can be built behind a temporary flag). Pick the faster; break
ties toward **B** (chessops-style) because it deletes the canonicalization
layer entirely, converges standard and 960 handling (960 input already is
king-captures-rook), and gives byte-parity with chessops without helpers.
Consistency is the invariant — whichever wins, exactly one representation
exists across the API. ADR-013 is amended accordingly (status: Amended,
with measurements), and the `purechess-rules` castling requirement text
follows. UCI engine-facing output: standard-chess castling is `e1g1` in
UCI protocol terms regardless — if B wins, `makeUci` emits the canonical
string and the ADR documents the engine boundary.

### D2: Castling correctness — one apply/detect path

Replace the scattered castling logic (king→own-rook branch in `makeMove`,
separate internal perft movegen, ad-hoc `makeSan` detection) with one
`detectCastling(pos, from, to)` + `applyCastling(pos, side)` pair used by
`makeMove`, `parseSan`, `makeSan`, and the perft movegen. Validation
(rights present, path empty, not through/into check) lives in one place.
Acceptance: the perft suite's 220 mismatches → 0, plus the two minimal
repros from the results file as unit tests (`2kr3r` queenside, `r4rk1`
kingside).

### D3: En-passant FEN policy — accept-as-chessops, optional strict

The current "must be capturable" rule is the spec's own text, so this is a
spec delta, not just a code fix: accept structurally valid ep (rank + side
to move) unconditionally, emit stored square on `makeFen`, add
`strict: true` to restore the old behavior (FIDE-strict tooling keeps its
option). This matches chessops exactly, fixes the 470 rejections and the
round-trip, and keeps a path for strictness.

### D4: Replayed-position defect — root-cause first, then fix

The `r2kQb1r … b KQ - 2 13` failure (bogus `59-58` dest, `isCheckmate`
disagreement) is not yet root-caused; it may collapse once D1/D2 unify
castling handling (the position has castling rights and the game was
replayed through `makeMove`). Task order: re-run the failing position
after D2; if it persists, bisect the replay path (suspects: scratch-board
sharing across `makeMove` calls violating the WritableBoard escape rules,
or castling-rights `Set` sharing). The dests-terminal suite enumerates the
failing FENs, giving a free regression harness.

### D5: Tables — blob + lazy (measured)

Shipped tables are already fancy per-square (rook shifts 52–54, Σ102,400;
bishop 55–59, Σ5,248) — the "plain uniform 11" comment is stale. Re-encode
as base64 blobs decoded to `Uint32Array` lo/hi views (measured: 841 KB raw
/ 26 KB gz vs 3,373 KB text; 0.1 ms decode vs 82 ms object materialization;
35.1 vs 30.0 MAttacks/s). `ensureMagicTablesLoaded()` (currently a no-op)
becomes the real dynamic-import hook; the naive ray-walk fallback (already
in `attacks.ts`, measured 1.66× chessops) serves until load completes —
so the lazy path is never slower than chessops. Fresh `{lo,hi}` results
replace shared-mutable table entries (ADR-012 aliasing hazard removed;
measured faster). Generator updated to emit blobs so the JSON → blob
pipeline stays reproducible (JSON remains the checked-in source of truth).

### D6: Bundle gate re-baseline (spec delta, with the measurement recorded)

The old gate compared a data-carrying core (81 KB gz) against chessops'
Chess-only import (5.2 KB gz) and demanded 30% *smaller* — unachievable by
any implementation that ships the chosen design. Measured code-only core is
6.0 KB gz (vs 5.2): chessops-parity. New gate: core ≤120% of chessops
Chess-import gz, zero table bytes in the static graph, full-bundle reported
for transparency. The 30% clause is replaced, not dropped silently — the
delta records the measurement.

## Risks / Trade-offs

- Representation bake-off (D1) may change public `dests`/`makeUci` output →
  workstation touch-points audited in tasks; engine UCI boundary documented
  in ADR-013; `tests/parity.mjs` simplification is the canary.
- Lazy tables add an async dimension — first-move latency before tables
  load is covered by the naive fallback being chessops-beating; the
  workstation pre-warms `ensureMagicTablesLoaded()` at startup.
- Blob decode adds a base64 payload to the source tree (1.1 MB text) —
  generated, checked in, and gzip-transparent (26 KB gz).
- WAC d4 parity runs are slow (~minutes) in the perft suite — nightly-only,
  unchanged.

## Migration Plan

Additive and internal: castling unification behind the existing API shape,
FEN policy delta with `strict` escape hatch, tables swap with fallback.
`npm test` (perft fast + parity + purity) and `npm run bench:real:ci` are
the two gates to green; no consumer migration beyond the ADR-013
representation note if B wins.

## Open Questions

- None blocking. D1's winner is decided by the in-change bake-off per the
  decision procedure above.
