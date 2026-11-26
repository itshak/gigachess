# Design — JS fast, safe, synchronous and wire-compatible

## Invariants
1. Canonical castling moves point to the **initial rook square**. Never switch
   standard castling to a king-landing target inside moves2. Keep the same four
   promotion codes, null sentinel and FEN square order as `gigachess-rs`.
2. Keep Polyglot's geometric en-passant hashing, including pinned EP; FIDE
   repetition uses a separate legal-EP equality/key. Polyglot hash vectors and
   the 960 custom file-key seed must remain identical across engines.
3. The Board constructor and every make/unmake that uses Zobrist AFTER async
   loading must hydrate the key **before** piece edits. No implicit zero hash
   should be mistaken for a position key by clients.
4. Standard castling rights use immutable precomputed `ReadonlySet` facades;
   `Object.freeze(new Set())` is unsafe. Chess960 state returned by Board is
   likewise wrapped against mutation. Clones may share only truly immutable
   objects, keeping standard movegen cheap.
5. Checked packed replay validates each word with the canonical `isLegal`
   rules, including Chess960 and null moves; fast trusted replay stays intact.
   `Uint8Array` odd offsets are copied/decode little-endian; aligned words keep
   the existing zero-copy path. Odd lengths are an error in checked mode.
6. The default board is synchronous and pure TypeScript. Lazy magic-table
   loading is optional and must not create a WASM dependency or startup wait.

## Performance research and remaining design work
First experiment with one buffer per depth showed no consistent improvement;
do not merge it. The V8 profile identified `destsFast`, `analyzeCheckContext`,
`genPseudoDests`, `countLegalMoves`, pawns, sliding attacks and allocations as
promising candidates. Benchmark: chess.js; chessops; drumevp; kokopu where the
API is comparable; ultrachess only as an external WASM reference, not a planned
backend. Use fixed machine/Node versions, warmups, deterministic corpora,
median/p10/p90, cold first operation and realistic one-game use. Decompose
parsing, legality, SAN, make+unmake, repetition, PGN, bundle and perft.

## Migration
- Existing API signatures and wire formats unchanged.
- `Board.fromFen(fen,{chess960:true})` is the explicit correct Chess960 path;
  document it rather than implying that any nonstandard placement auto-enables
  Chess960 from a default call.
- Encourage checked replay for public data ingress; existing fast users keep
  the same trusted method. Expose `repetitionKey` separately from Polyglot.
- Full parity and perf gates precede release; no unconditional fastest claim
  without evidence. Coordinate Rust test fixtures in both repos.
