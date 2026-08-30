# Bench Data

Reference corpora for parity validation and benchmarking. Large files are
re-downloadable; pinned by SHA-256 so results stay reproducible.

| File | Source | Size | SHA-256 |
|---|---|---|---|
| `lichess_db_standard_rated_2013-01.pgn.zst` | https://database.lichess.org/standard/lichess_db_standard_rated_2013-01.pgn.zst | 17,761,302 bytes | `aa40b3671fa3cf1072eb182892cd90b0e1e003a4a5943492f64b77e7f3fd1635` |
| `lichess_db.sample.pgn` | First games of the above, checked in for smoke tests | 2,533 bytes | — |

The January 2013 chunk decompresses to ~121k games; the 100k-game streaming
benchmark (`purechess-benchmarks` suite 3) pins the **first 100,000 games** of
this file so node counts are deterministic.

Perft/FEN corpora (`perftsuite.epd`, `samplefen1000.epd`, `wac_150.epd`) live
under `refs/mit-permissive/` (MIT-licensed sources, not checked in here).
