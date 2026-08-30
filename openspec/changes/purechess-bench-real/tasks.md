# Tasks: purechess-bench-real

## 1. Harness Foundation

- [ ] 1.1 Add devDependency (`tinybench`, fallback hand-rolled per design D1) and `bench/suites/lib/common.mjs` — pinned-Node check, corpus sha256 verification, `global.gc()` guard, warmup/median-of-20 statistics (median + p10/p90), chunked PGN reader taking first N games — verify harness fails fast when run without `--expose-gc` or with wrong Node version or wrong corpus hash
- [ ] 1.2 Add `bench/README.md` with pinned Node version, `chessops@0.15.1`, corpus hashes (`bench/data/README.md`), reproduction commands, and gate table — verify a fresh contributor can run `npm run bench:real -- --quick` from README alone

## 2. Suites (each: parity check BEFORE timing; parity failure aborts the suite)

- [ ] 2.1 `bench/suites/sliding.mjs` — perft(4) over 6 standard perft positions, sample 10M unique real occupancies, benchmark `queenAttacks` (`MAttacks/s`) purechess Black Magic vs chessops HQ — verify parity: attack sets bit-identical on first 100k samples (castling-free, no normalization needed)
- [ ] 2.2 `bench/suites/perft.mjs` — run every FEN in `refs/mit-permissive/**/perftsuite.epd` (126) + `wac_150.epd` at min(depth,4) — verify node counts equal chessops for every FEN/depth before reporting `nodes/s` comparison (gate: ≥parity, target +15%)
- [ ] 2.3 `bench/suites/pgn-stream.mjs` — decompress pinned `.zst`, take first 100,000 games, stream-parse with chunk sizes 4k/16k/64k for both libs — verify identical game counts + `makePgn(parsePgn(g))` round-trip on every legal game before timing; report `games/s`, `MB/s`, peak heap (gate: ≥+50% games/s, ≤110% heap)
- [ ] 2.4 `bench/suites/fen-san-uci.mjs` — 10k+ FENs from real games + Chess960/X-FEN samples: parse→make round-trip byte-identical; SAN make/parse incl. `+`/`#`/`=Q` disambiguation byte-identical; `makeUci` identical modulo ADR-013 castling normalization — verify parity ≥99% with failures enumerated, then report throughput (gate: ≥+20% FEN, SAN parity)
- [ ] 2.5 `bench/suites/dests-terminal.mjs` — 10k positions replayed from real games: `allDests` (castling normalized), `isLegal`, `isCheck/isCheckmate/isStalemate/isInsufficientMaterial` vs chessops — verify byte-identical (gate: 100% parity required, then measure dests throughput)
- [ ] 2.6 `bench/suites/bundle.mjs` — esbuild bundle `import { Chess } from "purechess/core"` (and `purechess` full) vs `import { Chess } from "chessops"`; report gzipped bytes and verify `parsePgn`/Chess960 tables absent from core bundle — verify gate: core ≥30% smaller than chessops, full ≤110%

## 3. Orchestration & CI

- [ ] 3.1 `bench/bench-real.mjs` orchestrator with `--suite`, `--quick`, `--json` flags; `npm run bench:real` and `bench:real:ci` (fails on unmet gate) — verify exit code 1 when any gate fails and 0 when all pass
- [ ] 3.2 CI wiring: `bench:real:ci --quick` on PR, full suite nightly job — verify CI config lint passes
