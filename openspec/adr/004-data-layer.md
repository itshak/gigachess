# ADR-004: Data Layer — SQLite Local, Rust Parallel Search

**Status:** Accepted (2024, reaffirmed August 2026)

## Context

BlindBase is a local-first desktop application that must handle:
- User data (repertoires, settings, training state, puzzles, drills)
- GigaBase: 10M+ chess games in `.ocgdb.db3` format (SQLite)
- Masters opening tree: pre-processed opening statistics
- Position search: find all games containing a specific board position

Performance requirements:
- Repertoire tree construction: <2ms
- Tab activation: 0ms perceived
- Position search over 10M+ games: seconds, not minutes
- All operations must work offline

## Decision

### Storage: SQLite via rusqlite
- **All local data** stored in SQLite databases
- User data in the app's data directory (Tauri app data)
- GigaBase in a separate `.ocgdb.db3` file (user-provided)
- Masters pack in a compressed SQLite file (bundled/downloaded)

### GigaBase game and index formats
- The `Games.Moves2` column stores the compact binary move representation: two bytes per ply.
- Optional original move text is retained separately as `OriginalMovesZstd` when it is needed for fidelity or diagnostics.
- A position-index sidecar uses Zstandard-compressed postings, keyed by shakmaty `Zobrist64` hashes. Its manifest records the source fingerprint and format settings, so an incompatible sidecar is rejected rather than silently reused.
- This keeps common position searches fast and storage-efficient without replacing SQLite as the application data layer.

### Position Hashing: shakmaty Zobrist64
- Every board position identified by a 64-bit Zobrist hash
- Used for: repertoire node identity, position search, opening tree lookups
- Collision-safe for practical chess positions

### Search: Rust Parallel with rayon
- GigaBase position search uses `rayon` for multi-threaded scanning
- Each game's moves replayed via shakmaty, positions compared by Zobrist hash
- Progress reported to frontend via Tauri events

### Repertoire Tree: O(N) In-Memory Construction
- Tree built from flat node/edge SQLite rows in single pass (<2ms)
- No PGN round-trip for tree operations
- `pathCloneRoot` for O(depth) editing instead of full-tree clone

## Alternatives Considered

1. **PostgreSQL** — Rejected. Requires a database server, violates local-first principle.
2. **IndexedDB (frontend)** — Rejected. Too slow for 10M+ game searches, no Rust integration.
3. **Custom binary format for GigaBase** — Rejected. SQLite with `.ocgdb.db3` is already standard in chess community.
4. **chess.js for position hashing** — Rejected. No built-in Zobrist, slower than shakmaty in Rust.

## Consequences

### Positive
- Zero infrastructure: no database server, no network, fully offline
- Excellent performance: Rust + rayon for compute, SQLite for storage
- Portable: app data directory is self-contained
- Compatible: `.ocgdb.db3` is an established format

### Negative
- SQLite single-writer limitation (mitigated by background persistence with debouncing)
- Large GigaBase files (~2-5 GB) need disk space
- Zobrist hash is probabilistic (vanishingly small collision chance in practice)
