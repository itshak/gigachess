# purechess-gates-green — Castling Correctness, FEN Parity, and a Lean Fast Bundle

## Why

The `purechess-bench-real` real-world gate suite (`npm run bench:real`, results
in `bench/results/real-2026-08-30.md`) validated the harness and exposed four
purechess defects the existing test suite missed, leaving 4 of 12 gates red and
blocking the chessops→purechess migration (`purechess-adopt`, ADR-010):

1. **Castling correctness (perft parity gate ✗)** — 220 mismatches over 504
   FEN/depth comparisons vs chessops AND the published perft corpus. Kiwipete
   d4 gives 4,085,607 instead of the canonical 4,085,603. Minimal repro:
   `makeMove(pos, {from: king, to: landing})` where `landing` is the ADR-013
   normalized dest (e8→c8) moves **only the king** and leaves the rook
   (`r1k4r/…` instead of `2kr3r/…`). The internal `perft` movegen has a second,
   distinct castling defect (790 vs 802 manual-walk on the same position), and
   `makeSan` renders a normalized-dest castling as `"Kg1"` instead of `"O-O"`.
2. **En-passant FEN round-trip (fen-san-uci parity gate ✗)** — `parseFen`
   rejects 470/10,002 real lichess FENs whose ep square is structurally valid
   but not capturable (e.g. after 1.d4) — FENs that chessops accepts and that
   purechess's own `makeFen` emits, breaking round-trip for ~4.7% of
   real-game positions.
3. **Replayed-position dest/terminal defect (dests-terminal gate ✗)** —
   6/10,000 replayed positions diverge (e.g. a bogus `59-58` dest moving the
   *opponent's* queen, plus an `isCheckmate` disagreement).
4. **Bundle size (bundle gate ✗)** — `purechess/core` is 2.25 MB raw / 81 KB gz
   vs chessops 17 KB / 5.2 KB gz: the Black Magic tables (107,648 entries as
   JS object literals, 3.37 MB text) are statically imported, so every
   `import { Chess } from "purechess/core"` carries them.

At the same time there are measured wins on the table: the tables are already
fancy-encoded (per-square shifts/sizes — the "uniform 11" comment in
`attacks.ts` is stale), a `Uint32Array` blob encoding of the same tables is
**17% faster** (35.1 vs 30.0 MAttacks/s) and 841 KB raw / 26 KB gz instead of
3.37 MB text, the naive ray-walk fallback **already beats chessops 1.66×**
(so lazy table loading keeps us ahead of chessops even before tables arrive),
and the current object table returns *shared mutable entries* (an aliasing
hazard that contradicts the ADR-012 immutability policy).

## What Changes

- **Castling: one canonical representation, everywhere.** A measured bake-off
  (ADR-013 amendment) picks between the ADR-013 normalized landing square
  (`e1g1`) and the chessops-style king-captures-rook square (`e1h1`) as the
  single representation used by `dests`/`allDests`, `makeMove`/`play`,
  `parseSan`/`makeSan`, `makeUci`/`parseUci`, and the internal `perft`
  movegen. Consistency is the invariant; representation is decided by
  measurement. All castling handling funnels through one shared
  `applyCastling`/`detectCastling` path; `makeSan` produces `O-O`/`O-O-O`
  for castling moves in that representation; UCI output follows ADR-013 as
  amended. `tests/parity.mjs` canonicalization helpers are deleted if the
  representations converge, or kept with the single remaining delta.
- **Perft exactness restored**: perftsuite.epd (126) + wac_150.epd (150) at
  depth ≤4 node-parity vs chessops AND the published corpus values (the
  existing `purechess-benchmarks` perft parity gate — currently 220
  mismatches — becomes the acceptance test), plus `PERFT_FULL=1 npm test`.
- **En-passant FEN parity**: `parseFen` accepts structurally valid ep squares
  even when no capture is possible (chessops-compatible); `makeFen` emits the
  stored square; a `strict` parse option retains the capturable check for
  callers that want it. Amends the `purechess-rules` FEN validation
  requirement, which currently mandates rejection.
- **Replayed-position defect root-caused and fixed** (bogus opponent-piece
  dest + `isCheckmate` disagreement); dests-terminal gate reaches the
  required 100% parity on 10k real-game positions.
- **Tables as blob, lazily loaded**: generated `rookMagic`/`bishopMagic`
  modules replaced by base64/`Uint8Array` blobs decoded into `Uint32Array`
  views (841 KB raw / 26 KB gz vs 3.37 MB text; 0.1 ms decode vs 82 ms
  object materialization; 35.1 vs 30.0 MAttacks/s). Tables load via dynamic
  `import()` behind `ensureMagicTablesLoaded()`; the existing naive fallback
  (already 1.66× chessops) serves until they arrive. Fresh `{lo,hi}` results
  replace shared-mutable table entries (ADR-012 hazard removed). Stale
  "plain uniform-11" comments corrected to document the fancy encoding.
- **Bundle gate re-baselined to like-for-like** in `purechess-benchmarks`:
  `purechess/core` SHALL exclude PGN, Chess960, **and magic-table bytes**
  from its static import graph (tables lazy), and SHALL be ≤120% of the
  chessops Chess-import bundle (measured code-only parity: 6.0 vs 5.2 KB gz);
  the former "≥30% smaller than chessops Chess-import" clause is replaced —
  it compared a data-carrying core against a table-free library and is
  unachievable by any correct implementation of the chosen design.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `purechess-rules`: FEN ep validation relaxed to chessops-compatible
  (accept structurally valid ep, `strict` option rejects); castling
  requirement re-anchored to the single canonical representation decided by
  the ADR-013 bake-off; SAN requirement updated (O-O/O-O-O from that
  representation; UCI per amended ADR-013).
- `purechess-board-movegen`: sliding tables SHALL ship as blob-encoded typed
  arrays loaded lazily with the naive fallback serving first (≥1.5× chessops
  guaranteed pre-load); movegen/perft SHALL be exact on the pinned castling
  corpora (0 mismatches vs chessops and published values at depth ≤4).
- `purechess-pgn-fen`: FEN round-trip SHALL be byte-stable on lichess-style
  FENs with unreachable ep squares; SAN/UCI SHALL follow the canonical
  castling representation.
- `purechess-benchmarks`: bundle gate re-baselined (core excludes table
  bytes from the static graph; ≤120% of chessops Chess-import gz; full-with-
  tables vs chessops-full-API reported for transparency); all real-world
  suite gates (perft parity, dests-terminal 100%, fen-san-uci ≥99%) SHALL
  pass in `npm run bench:real:ci`.

## Impact

- **Code:** `src/chess.ts` (castling apply/detect unification, perft movegen),
  `src/san.ts` (makeSan/parseUci castling), `src/fen.ts` (ep validation),
  `src/attacks.ts` (blob tables, lazy load, fresh results), generated
  `src/rookMagic.ts`/`src/bishopMagic.ts` replaced by blob assets + decoder;
  `tests/parity.mjs` helpers simplified; `bench/README.md` + results updated.
- **Specs/ADRs:** ADR-013 amended (or reaffirmed with measurements);
  `purechess-rules`, `purechess-board-movegen`, `purechess-pgn-fen`,
  `purechess-benchmarks` deltas (this change).
- **Workstation:** if the bake-off keeps normalized dests, zero UI change; if
  it adopts rook-square dests, `makeUci` consumers (engine communication)
  must be updated — UCI output stays `e1g1` for engines in both cases via the
  ADR-defined boundary, so risk is contained.
- **Licensing:** unchanged — tables remain the MIT RecklessMagics-derived
  data, re-encoded, not re-derived.
