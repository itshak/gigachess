# ADR-013: Castling Destination Normalization (G1/C1)

**Status:** Amended (August 2026, change `purechess-gates-green`) — canonical
representation is now **king-captures-rook** (`e1h1`/`e1a1`), decided by
measurement; see Decision 1′ below.

## Context

`purechess-rules` requires that legal-move destination sets are byte-identical
to `chessops`, but the two libraries represent castling differently:

- `chessops` models castling as king-captures-rook: the king's destination is
  the rook's square (`e1h1`, `e1a1`).
- `purechess` follows the spec: the king's destination is its landing square
  (`e1g1`, `e1c1`; for Chess960 the corresponding normalized G/C file square).

Parity testing (`tests/parity.mjs`, `samplefen1000.epd`) found all 2/1000
position mismatches were exclusively this representation difference, not a
move-generation defect.

## Decision

1. Keep the normalized G1/C1 representation as specified. Consumers comparing
   against `chessops` must canonicalize king→rook-square castling destinations
   (see `normDest`/`normDestCo` helpers in `tests/parity.mjs`).
2. SAN output remains byte-identical (`O-O`/`O-O-O`), because `makeSan` is
   called with the castling flag set by move generation.
3. During parity validation a related genuine bug was found and fixed: in
   `dests()` a missing `isKing` guard plus `||` precedence caused *any* piece
   moving to C1/G1 to be flagged as castling when castling rights existed
   (e.g. a pinned queen `d2c1` was wrongly accepted). The fix tightens the
   condition to `isKing && (white.size > 0 || black.size > 0)`.

## Consequences

- Benchmarks and integration tests must compare castling moves via the
  normalized representation or canonicalize both sides first.
- The workstation's future migration keeps `useChessMoveAnnouncer` behavior
  unchanged (SAN is identical; only programmatic `move.to` differs).

## Amendment (2026-08-30): one canonical representation, decided by bake-off

The real-world gate suite (`bench/results/real-2026-08-30.md`) proved that
keeping two coexisting castling encodings (this ADR's normalized dests from
`allDests` vs chessops-style king→rook handling inside `makeMove`/perft
movegen) produced genuine correctness defects: `makeMove` with a normalized
castling dest moved only the king, the internal perft movegen miscounted
castling-heavy positions (Kiwipete d4 = 4,085,607 vs 4,085,603), and
`makeSan` rendered castling as `Kg1`. Fix requires exactly one representation
across `dests`/`allDests`, `makeMove`/`play`, `parseSan`/`makeSan`,
`makeUci`, and the internal perft movegen.

### Decision 1′ (amends Decision 1): king-captures-rook everywhere

Measurement (`bench/castling-bakeoff.mjs`, castling-heavy subset: Kiwipete,
pos4, `r3k2r` ×2 — 121,855 nodes per perft run, median of 15 in-process
runs, Node v24.19.0, darwin/arm64):

| Workload | A: normalized (e1g1) | B: king-captures-rook (e1h1) |
|---|---|---|
| perft d3, 121,855 nodes | 11.42 / 11.65 / 11.19 ms | 11.26 / 11.12 / 10.81 / 11.35 ms |
| `allDests` ×2000 (Kiwipete) | 6.39 / 6.51 ms | 6.39 / 6.27 ms |
| `makeMove` kiwipete-walk d2 | 430 / 429 ms | 427 / 425 ms |
| `makeSan` castling ×100k | 51.5 / 51.8 ms | 50.9 / 51.3 ms |

B measured equal-or-faster on every metric (≈1%, within run-to-run noise),
and per the change's decision procedure ties break toward B. B was chosen
because it deletes the canonicalization layer entirely (`normDest`/`normDestCo`
helpers deleted), converges standard-chess and Chess960 handling (the 960
input path already is king-captures-rook), and yields byte-parity with
chessops dests/UCI with no helper.

### Consequences of the amendment

1. `dests`/`allDests` emit the rook square for castling (`e1h1`); consumers
   comparing against the old normalized form map `e1h1 → e1g1` (one line).
   SAN output is unchanged (`O-O`/`O-O-O`), so `useChessMoveAnnouncer` and
   all screen-reader announcements are unaffected.
2. **UCI engine boundary (unchanged contract):** UCI protocol castling for
   standard chess is `e1g1` regardless of internal representation. Engine
   communication must translate `makeUci`'s canonical `e1h1` to `e1g1` at the
   engine boundary (and `parseUci("e1g1")` is accepted as castling input, as
   is `e1h1`). For Chess960, `e1h1`-style (file-letter) UCI is the UCI-protocol
   form and is emitted as-is.
3. `makeMove`/`play`, `isLegal`, `parseSan`, `makeSan`, and the internal
   perft movegen all funnel through one shared `detectCastling`/`applyCastling`
   path (both input forms accepted: king→rook square and king→landing
   two-square step). There is no second castling code path.
