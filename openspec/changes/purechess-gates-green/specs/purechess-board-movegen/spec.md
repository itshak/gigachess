# purechess-gates-green Specification Delta

## REMOVED Requirements

### Requirement: Black Magic sliding SHALL use plain fixed-shift uniform 11 (Fancy per-square is allowed alternative)

*Replaced by the blob-encoded, lazily-loaded fancy requirement below — the shipped tables were measured to already be fancy per-square (rook shifts 52–54, Σ 102,400 entries; bishop 55–59, Σ 5,248), the plain uniform-11 alternative was never implemented, and the object-literal encoding is the bundle-size defect this change fixes.*

## ADDED Requirements

### Requirement: Black Magic sliding SHALL ship fancy per-square tables as lazily-decoded typed-array blobs with the naive fallback serving first

The system SHALL provide `bishopAttacks(sq: Square, occupied: SquareSet): SquareSet`, `rookAttacks(sq: Square, occupied: SquareSet): SquareSet`, `queenAttacks = or(bishopAttacks, rookAttacks)` via **fancy per-square Black Magic** (measured per-square variable shifts: rook 52–54, bishop 55–59; flat attack tables rook 102,400 + bishop 5,248 = 107,648 entries — the classic fancy totals) with these mandatory properties:

- **Blob encoding, not object literals:** the generated table modules SHALL store the tables as base64-encoded `Uint8Array` blobs (or equivalent binary assets) decoded into `Uint32Array` lo/hi views at load time — measured 841 KB raw / 26 KB gz and 0.1 ms decode, vs 3,373 KB of object-literal text costing 82 ms to materialize. Stale "plain fixed-shift uniform 11" comments SHALL be corrected to document the fancy encoding (MIT `bench/magic-tables/*.json`, `RecklessMagics`-generated, not GPL).
- **Lazy loading with naive fallback:** the table modules SHALL NOT be in the static import graph of `purechess/core`; tables load via dynamic `import()` behind `ensureMagicTablesLoaded()`. Until loaded (or if loading fails), the existing naive ray-walk fallback SHALL serve — measured **1.66× chessops** (17.4 vs 10.4 MAttacks/s), so correctness and a chessops-beating guarantee hold from the first call.
- **Fresh results, no shared mutable entries:** with typed-array storage each attack call SHALL return a fresh `{lo, hi}` (measured 35.1 vs 30.0 MAttacks/s — 17% *faster* than the object-table lookup that returned shared mutable entries, an ADR-012 aliasing hazard).
- **No `BigInt` in hot path** (unchanged) and the 64-bit multiply split (`Math.imul` lo/hi emulation) SHALL be reused by both the table path and any decoder.

| Field | Type | Example (Rook A1) |
|-------|------|-------------------|
| `mask` | `SquareSet {lo,hi}` | `0x000101010101017E` → `{lo:16843134,hi:65793}` |
| `magic` | `uint64 hex` | `0x1080018022704002` → `{lo:577781762,hi:276824448}` |
| `shift` | `uint8 52..59` (per square) | `52` |
| `offset` | `usize` (cumulative) | `0` |
| `attackTable[offset + index]` | `Uint32Array` lo/hi pair | decoded from blob |

#### Scenario: Rook attacks empty vs blocked are correct vs perft oracle
- **WHEN** `rookAttacks(A1=0, occupied=empty)` is computed
- **THEN** result is `A2=8,A3=16,A4=24,A5=32,A6=40,A7=48,A8=56,B1=1,C1=2,D1=3,E1=4,F1=5,G1=6,H1=7` exactly (14 bits), and `rookAttacks(A1, occupied={C1=2})` is `B1=1,C1=2` (stops inclusive at blocker) not `D1..H1`

#### Scenario: Blob table path matches naive ray for all occupancies
- **WHEN** for square `D4=27` and all `2^popcount(mask(D4))` occupancy subsets of `bishopMask(D4)` (and a 50k-sample parity sweep of real perft-tree occupancies × 64 squares) the blob-path attacks are compared to the naive ray loop
- **THEN** every result equals naive, and `queenAttacks(D4,occ).equals(or(bishopAttacks(D4,occ), rookAttacks(D4,occ)))`

#### Scenario: Sliding speed gates hold before and after table load
- **WHEN** the sliding real-world suite benchmarks `queenAttacks` over real perft-tree occupancies with tables unloaded (naive fallback) and loaded (blob magic)
- **THEN** naive SHALL be ≥1.5× chessops MAttacks/s and blob magic SHALL be ≥2.5× chessops (measured 1.66× and 3.37×)

#### Scenario: Core bundle excludes table bytes from the static graph
- **WHEN** a consumer imports `import { Chess } from "purechess/core"` and the bundle is inspected
- **THEN** no rook/bishop attack-table bytes are present (static import graph excludes the table modules), the tables load only via dynamic `import()`, and the naive fallback is statically included

#### Scenario: No BigInt in hot path
- **WHEN** `rg BigInt src/attacks.ts src/squareSet.ts` runs
- **THEN** the count is 0 in hot files (BigInt allowed only in tests/oracles)
