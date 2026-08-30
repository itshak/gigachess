# ADR-013: Castling Destination Normalization (G1/C1)

**Status:** Accepted (August 2026)

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
