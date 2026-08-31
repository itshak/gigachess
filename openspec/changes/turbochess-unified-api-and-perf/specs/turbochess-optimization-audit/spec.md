## ADDED Requirements

### Requirement: Engine Hot Paths SHALL Minimize Intermediate Object Allocations

The engine hot paths SHALL minimize garbage collector pressure and allocations through the following implementations:
1. **`makeSan` Disambiguation Context Reuse**: `makeSan` SHALL precalculate the position's `CheckContext` once per call and reuse it across candidate piece dest evaluations, eliminating \(O(N \times \text{full movegen})\) recalculations.
2. **Single-Pass FEN Scanner**: `parseFen` SHALL parse piece placements and board metadata using an index-based character scanner without regex or string splits.
3. **Inlined Bitwise Attack Testing**: `isAttacked`, `kingAttackers`, and `attackersTo` in `src/attacks.ts` SHALL inline 32-bit `{lo, hi}` bitwise math, eliminating intermediate `SquareSet` allocations.
4. **Optimized Popcount**: `popcnt32` in `src/squareSet.ts` SHALL use `Math.imul` for 32-bit hardware integer multiplication.

#### Scenario: SAN disambiguation executes with zero repeated movegen
- **WHEN** `makeSan` disambiguates moves among multiple rooks or knights on complex tactical positions
- **THEN** SAN formatting throughput increases by ≥2x without any divergence in SAN disambiguation strings

#### Scenario: Single-pass FEN scanner parses without array allocation
- **WHEN** `parseFen` processes a 6-field FEN
- **THEN** it completes with 0 intermediate string slice arrays and achieves ≥2.2x throughput vs `chessops`
