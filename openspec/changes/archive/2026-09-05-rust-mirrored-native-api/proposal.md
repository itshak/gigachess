## Why

`gigachess` currently exposes `Chess` (a `chess.js` compatibility class) as its primary interface. While fast, this interface forces string-based boundaries (FEN parsing, SAN stringification, verbose move objects) in consumer hot loops, causing unnecessary garbage collection pressure in V8 and preventing consumers from directly using the zero-allocation 16-bit `moves2` move generator and incremental Polyglot Zobrist hashing. 

Additionally, while standard-chess Zobrist hashing is Polyglot-compliant, Chess960 castling rights currently fold onto 4 keys instead of the 16 rook-file keys defined by `gigachess-rs` (ADR-003). 

Introducing a first-class, Rust-mirrored `Board` native API alongside 16-key Chess960 Zobrist hashing will maximize throughput (over 600,000 moves/sec in JS), eliminate V8 GC nursery pressure, and achieve 100% bit-for-bit parity with the Rust engine, while retaining `chess.js` and `chessops` facades as lightweight, optional compatibility wrappers.

## What Changes

- **Rust-Mirrored `Board` Class**: Export a stateful, high-performance `Board` class operating on 16-bit `moves2` integers (`number` / Smi), with in-place `makeMove(moveWord: number): Undo`, `unmakeMove(undo: Undo)`, zero-allocation `legalMoves(outBuffer?: Uint16Array): Uint16Array`, `forEachLegalMove((mv: number) => void)`, and cached `inCheck(): boolean`.
- **16 Rook-File Chess960 Castling Zobrist Keys**: Update `src/zobrist.ts` to implement the 16-key castling scheme from `gigachess-rs` (ADR-003). Castling rights hash with keys indexed by `color * 8 + file`: standard files a/h pin to Polyglot keys 768..771, while files b..g (12 keys) derive via deterministic `splitmix64` seeded with `0x00C0_FFEE_DABA_D00D`.
- **Direct Zobrist Access**: Expose `zobristBigInt(): bigint`, `zobristLo: number`, `zobristHi: number`, and `zobristHex(): string` directly on `Board` with zero object allocation.
- **On-Demand Projections**: Provide lazy view projections on `Board` (`toSan(moveWord)`, `toUci(moveWord)`, `toFen()`, `parseSan(san)`, `parseUci(uci)`) that run strictly on-demand when the UI or engine requires strings.
- **Thin `chess.js` & `chessops` Compatibility Facades**: Retain `class Chess` as an ergonomic facade wrapping an internal `Board`. All existing `chess.js` and `chessops` APIs, methods, and tests remain 100% functional with zero code breakage.
- **Modular Subpath Exports**: Maintain clean exports in `package.json` (`"."`, `"./core"`, `"./chessjs"`, `"./chessops"`), allowing performance-critical apps like `blind-base` to import `{ Board }` with zero facade overhead.

## Capabilities

### New Capabilities
- `turbochess-native-board`: Defines the Rust-mirrored `Board` native API, 16-bit `moves2` execution, in-place state mutation with `Undo`, and zero-allocation legal move generation.

### Modified Capabilities
- `turbochess-zobrist-and-moves2`: Extends the 64-bit Polyglot Zobrist hashing specification to mandate 16 per-rook-file castling keys for Chess960 matching `gigachess-rs`.
- `turbochess-unified-api`: Re-anchors `class Chess` as an ergonomic facade wrapping the native `Board` core.

## Impact

- **Affected Code**: `src/board.ts`, `src/chess.ts`, `src/zobrist.ts`, `src/index.ts`, `src/core.ts`.
- **APIs**: Exposes `Board`, `Undo`, and 16-key Chess960 Zobrist hashing. `Chess` and `chessops` APIs remain intact.
- **Compatibility**: Fully backward-compatible for existing `chess.js` and `chessops` code.
- **Cross-Repository Parity**: Guarantees 100% bit-for-bit Zobrist parity between TypeScript (`gigachess`) and Rust (`gigachess-rs`) across both Standard Chess and Chess960.
