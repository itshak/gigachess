# Technical design and fairness controls

## Input sets and reference oracles

- Reuse the exact existing perftsuite.epd and wac_150.epd input files;
  normalize 4-field EPD to six-field FEN and discard bm/id annotations.
- Compare 2,600 legal positions including deterministic seeded games, all
  276 EPD reference positions and five canonical CPW perft positions.
- Compare sorted legal UCI moves to independent chess.js. Promotion,
  castling and en-passant must be exercised. Standard UCI castling is
  king-to-final-square, whereas GigaChess moves2 uses king-to-rook-square:
  normalize at the UCI protocol boundary, NEVER alter GigaChess encoding.
- Compare replay over 24 seeded 100-ply games including full undo, and
  compare all resulting board, side, castling, and clock state. Record
  pseudo/non-pseudo en-passant FEN display differences separately.
- Compare reference node counts (20 depth/position combinations) and 276
  corpus perft counts with chessops before displaying perft timings.
- Test malformed FEN and illegal move rejection independently; a library
  passing perft can still have unsafe parser validation.
- Recheck the published npm bundle independently from source, with its
  postinstall disabled to avoid NNUE model download.

## Timing axes

- Raw uncached legal moves from stable preconstructed positions and direct
  movegen APIs: GigaChess, drumevp. Report chessops allDests and
  chess.js SAN moves but flag the different work they perform.
- Cached repeated moves (drumevp ChessEngine cache) is a DIFFERENT lane from
  regenerating legal moves. Never rank a cached getter as move generation.
- Parse+write FEN including initialization.
- Stateful validated UCI replay. Do not compare against unchecked packed
  gigachess replay or a perft-only move-making shortcut.
- Perft: published optimized no-hash, source no-hash, source forced-hash,
  GigaChess Board perft, independent chessops.
- Cold Node startup: fresh processes, report import+first legal move,
  process time and heap, with scope difference (GigaChess core vs drumevp
  search+NNUE engine) clearly stated.

## Statistical controls

Use Node.js 24 with exact versions; two untimed warmups, seven or more
runs, rotate candidate order in each round, record median/p10/p90 and raw
times. Use a fixed process, corpus and random seed; no concurrent benchmark
jobs on the shared aiserver. Include CPU model, memory and architecture.
Variation across full runs is not proof of a library-speed ranking; a
release-level claim requires independent repetitions and confidence bounds.
A full benchmark must be local on aiserver, not GitHub Actions.

## Compatibility and explicit non-goals

Bench:real only gains an opt-in suite; default test/CI lanes unchanged.
No source imported into src/; only optional tsx dev tooling is installed.
No WASM, NNUE downloads, startup initialization gate or altered castling.
Results apply only to standard chess where competitor feature sets overlap.
