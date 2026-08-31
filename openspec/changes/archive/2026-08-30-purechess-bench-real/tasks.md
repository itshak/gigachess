# Tasks: purechess-bench-real

## 1. Harness Foundation

- [x] 1.1 Add devDependency (`tinybench`, fallback hand-rolled per design D1) and `bench/suites/lib/common.mjs` — pinned-Node check, corpus sha256 verification, `global.gc()` guard, warmup/median-of-20 statistics (median + p10/p90), chunked PGN reader taking first N games — verify harness fails fast when run without `--expose-gc` or with wrong Node version or wrong corpus hash
  - Done. Design D1 fallback used (tinybench's Task hooks cannot provide per-iteration forced GC); rationale recorded in bench/README.md. Fail-fast verified: no `--expose-gc` → exit 2 with instructions; corpus sha256 mismatches abort; non-pinned Node aborts (`BENCH_ALLOW_NODE=1` override).
- [x] 1.2 Add `bench/README.md` with pinned Node version, `chessops@0.15.1`, corpus hashes (`bench/data/README.md`), reproduction commands, and gate table — verify a fresh contributor can run `npm run bench:real -- --quick` from README alone
  - Done. Real-world suite section added with suite/gate table, reproduction commands, methodology, and all five corpus sha256 pins.

## 2. Suites (each: parity check BEFORE timing; parity failure aborts the suite)

- [x] 2.1 `bench/suites/sliding.mjs` — perft(4) over 6 standard perft positions, sample 10M unique real occupancies, benchmark `queenAttacks` (`MAttacks/s`) purechess Black Magic vs chessops HQ — verify parity: attack sets bit-identical on first 100k samples (castling-free, no normalization needed)
  - Done. perft(4) corpus exhausts at 2,745,326 unique occupancies (design D3 exhaustion path, reported honestly); 100k/100k attack-set parity ✓; MAttacks/s reported (20-run median, p10/p90).
- [x] 2.2 `bench/suites/perft.mjs` — run every FEN in `refs/mit-permissive/**/perftsuite.epd` (126) + `wac_150.epd` at min(depth,4) — verify node counts equal chessops for every FEN/depth before reporting `nodes/s` comparison (gate: ≥parity, target +15%)
  - Done. Suite works as specified: parity is checked for every FEN/depth against chessops AND the corpus before any speed reporting, and mismatches abort the suite with the failing FENs. **The gate FAILS: purechess perft is wrong on castling-heavy positions** (kiwipete d4 4,085,607 vs canonical 4,085,603; `r3k2r/8/8/8/8/8/8/4K3 w kq` d3 790 vs 782; minimal repro: `makeMove` given the ADR-013 normalized dest e8→c8 moves only the king, leaving the rook). Speed numbers correctly withheld. This blocks `purechess-adopt`.
- [x] 2.3 `bench/suites/pgn-stream.mjs` — decompress pinned `.zst`, take first 100,000 games, stream-parse with chunk sizes 4k/16k/64k for both libs — verify identical game counts + `makePgn(parsePgn(g))` round-trip on every legal game before timing; report `games/s`, `MB/s`, peak heap (gate: ≥+50% games/s, ≤110% heap)
  - Done. Note: the Lichess `.zst` interleaves zstd frames with skippable metadata frames that Node's zstd rejects — the harness demuxes them (`decompressLichessZst`). Parity 100% before timing; ≥+50% games/s gate met (≈2.8×); heap gate measured via adaptive post-GC checkpoints.
- [x] 2.4 `bench/suites/fen-san-uci.mjs` — 10k+ FENs from real games + Chess960/X-FEN samples: parse→make round-trip byte-identical; SAN make/parse incl. `+`/`#`/`=Q` disambiguation byte-identical; `makeUci` identical modulo ADR-013 castling normalization — verify parity ≥99% with failures enumerated, then report throughput (gate: ≥+20% FEN, SAN parity)
  - Done. SAN make/parse and UCI parity 100% ✓. FEN parse-agreement <99% honestly reported: purechess `parseFen` rejects FENs with unreachable en-passant squares (as emitted by lichess PGNs and purechess's own `makeFen`) that chessops accepts. FEN throughput at parity (−3%), below the +20% gate — reported honestly.
- [x] 2.5 `bench/suites/dests-terminal.mjs` — 10k positions replayed from real games: `allDests` (castling normalized), `isLegal`, `isCheck/isCheckmate/isStalemate/isInsufficientMaterial` vs chessops — verify byte-identical (gate: 100% parity required, then measure dests throughput)
  - Done. Failures enumerated with FEN + differing move/predicate (e.g. a replayed position with a bogus `59-58` dest and an `isCheckmate` disagreement); speed numbers only reported at 100% parity per spec — currently withheld.
- [x] 2.6 `bench/suites/bundle.mjs` — esbuild bundle `import { Chess } from "purechess/core"` (and `purechess` full) vs `import { Chess } from "chessops"`; report gzipped bytes and verify `parsePgn`/Chess960 tables absent from core bundle — verify gate: core ≥30% smaller than chessops, full ≤110%
  - Done. Dead-code gate passes (parsePgn/Chess960 absent from core) ✓. Size gates FAIL honestly: `purechess/core` ≈83 KB gz vs chessops ≈5.3 KB gz — the Black Magic tables (`rookMagic.js` ≈3.2 MB raw) are statically imported; lazy loading/code-splitting needed before migration.

## 3. Orchestration & CI

- [x] 3.1 `bench/bench-real.mjs` orchestrator with `--suite`, `--quick`, `--json` flags; `npm run bench:real` and `bench:real:ci` (fails on unmet gate) — verify exit code 1 when any gate fails and 0 when all pass
  - Done. Verified: unmet gate → exit 1; all-pass/help → exit 0; crash → exit 1 (suite crash counted as failure in the summary).
- [x] 3.2 CI wiring: `bench:real:ci --quick` on PR, full suite nightly job — verify CI config lint passes
  - Done. `.github/workflows/bench-real.yml` (PR quick job with Node 22.5.0 pin; nightly full job downloads + sha256-verifies the corpus; workflow_dispatch for manual runs). YAML validated.

**Outcome:** the harness is complete and validated, but the gates correctly
block the chessops→purechess migration: perft castling parity, en-passant FEN
round-trip, dests/terminal parity on replayed games, and the bundle size gate
are all red with minimal reproductions recorded in `bench/README.md` and
`bench/results/real-2026-08-30.md`.

