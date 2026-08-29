## 1. Clean-room wall & reference layout

- [ ] 1.1 Create `refs/README.md`, `.gitignore`, and directories `refs/gpl-only/`, `refs/mit-permissive/`, `refs/docs-refs/` and verify `ls refs/` and `cat refs/README.md` show the license split, pinning policy (commit hash per clone), and the rule that impl agent reads only `mit-permissive/` + `docs-refs/` (never `gpl-only/`)
- [ ] 1.2 Populate `refs/mit-permissive/` with MIT clones (GopherCheck, NuclearChess, Chess4j, `magic-bits`, RecklessMagics, `Chess_Movegen`/Gigantua), verify each `LICENSE` is MIT and record commit hashes in `refs/README.md`
- [ ] 1.3 Document `refs/gpl-only/` contents and taint: `chessops` (GPL-3.0-or-later), Stockfish (GPL-3.0), `pgn-chess-tree` (AGPL-3.0) — note that `pgn-chess-tree` is owned by the author but remains GPL-tainted due to `chessops` + lichess GPL code and therefore SHALL NOT be copied into `src/`; it is spec-reference only and verify `.gitignore` blocks `refs/gpl-only/` from impl agent mounts
- [ ] 1.4 Populate `refs/docs-refs/` with FIDE Laws 2023 PDF, Chess960 X-FEN/Shredder-FEN notes, and python-chess/cm-pgn doc snapshots (or URLs + hashes) and verify `refs/docs-refs/README.md` lists sources

## 2. NPM naming & registry

- [ ] 2.1 Run `npx npm-name-cli purechess pure-chess rescript-chess ocachess chess-pure` and `npm view <name>` for each, capture 404/available output, and write results to `openspec/changes/purechess-library/naming-report.md` and verify file exists
- [ ] 2.2 Reserve defensive names (`pure-chess`, `rescript-chess`, `ocachess`) on npm/GitHub org (dry-run `npm publish --dry-run` or reserve via npm web) and verify `npm view` still shows owned/unpublished status

## 3. Benchmark harness scaffolding

- [ ] 3.1 Scaffold `bench/` with `bench/README.md`, `bench/data/.gitkeep`, `bench/bench-sliding.mjs`, `bench/bench-perft.mjs`, `bench/bench-pgn.mjs`, `bench/bench-fen-san.mjs`, `bench/bench-bundle.mjs` and verify `ls bench/*.mjs` lists all five
- [ ] 3.2 Pin `chessops@0.15.1` baseline and Node version in `bench/README.md` (e.g., Node `v22.5.0`), add `bench/data/lichess_db.sample.pgn` (100k-game sample or URL + `sha256` hash) and verify `shasum -a 256 bench/data/lichess_db.sample.pgn` matches recorded hash
- [ ] 3.3 Implement `bench/bench-sliding.mjs` micro-harness: 10M random occupancies, measures `MQueens/s` for each candidate, 5-run median, warmup excluded, and verify `node bench/bench-sliding.mjs --help` prints usage and `--algo` list

## 4. Bake-off: board encoding + slider algorithm

- [ ] 4.1 Implement candidate `A: chessops HQ` baseline adapter (thin wrapper over `chessops` `bishopAttacks`/`rookAttacks`) and verify `node bench/bench-sliding.mjs --algo hq` reports `MQueens/s` and exits 0
- [ ] 4.2 Implement candidate `B: Black Magic (plain, fixed shift) lo/hi` — hand-rolled `{lo:number, hi:number}` pair, mask + `Math.imul` + `>>> shift` + table lookup, tables generated offline via MIT `RecklessMagics`/`magic-bits` and checked into `bench/magic-tables/*.json` (no GPL table copy) — and verify `node bench/bench-sliding.mjs --algo black-magic` runs and prints `MQueens/s`
- [ ] 4.3 Implement candidate `C: ReScript {lo,hi} manual` (if ReScript toolchain added) or stub as `TS` variant with `Belt` avoided; compile to `bench/candidates/rescript-lohi.bs.js` and verify `node bench/bench-sliding.mjs --algo rescript-lohi` runs; if ReScript not yet installed, record as `skipped` with rationale in `bench/README.md`
- [ ] 4.4 Implement candidate `D: BigInt` (`JS.BigInt` / `BigInt.asUintN`) and verify `node bench/bench-sliding.mjs --algo bigint` runs and is measurably slower (expected 10–60× vs `B`), proving it is not hot-path viable
- [ ] 4.5 Run full bake-off `npm run bench:sliding -- --iters 10000000` across all candidates, collect 5-run medians, decide winner per `specs/purechess-benchmarks` gates (B must beat A by ≥30% to win, else HQ fallback), and write `bench/results/sliding-YYYY-MM-DD.md` with table and decision and verify file exists

## 5. Integrated benches & bundle gates

- [ ] 5.1 Implement `bench/bench-perft.mjs` (perft 6 startpos = 119060324 nodes) and `bench/bench-pgn.mjs` (chunked streaming, `games/s`, `MB/s`, peak heap) and `bench/bench-fen-san.mjs` (10k FEN round-trips, SAN parity) and verify each prints metrics and exits 0 on the pinned corpus
- [ ] 5.2 Implement `bench/bench-bundle.mjs` (`esbuild` + `sideEffects:false` + `exports` map check) and verify `npm run bench:bundle -- --entry core` proves `purechess/core` gzipped will target ≥30% smaller than `chessops` full import (gate checked, even if `src/` is still stubbed)
- [ ] 5.3 Wire `npm run bench` (all benches) and `npm run bench:ci` (gated, fails on any `SHALL` in `specs/purechess-benchmarks/spec.md`) and verify `npm run bench:ci` runs locally (may warn on stubbed purechess, but harness itself passes)

## 6. Verification & handoff to Phase 2

- [ ] 6.1 Run `openspec validate --change purechess-library --strict` and verify zero errors (2 specs present, purpose ≥50 chars, each requirement has `#### Scenario`)
- [ ] 6.2 Run `npm run typecheck` (or `npx tsc --noEmit` if `src` stub) and `cd src-tauri && cargo check` (if present) and verify both pass with no new deps violating GPL/MIT license checks
- [ ] 6.3 Flag for future Phase 2 integration: add `NOTE` in `design.md` appendix recording bake-off winner, `pgn-chess-tree` ownership-but-GPL-taint nuance, and that Phase 2 spec agent (separate change, GPL-read allowed) will produce `purechess-rules`, `purechess-board-movegen`, `purechess-pgn-fen` delta specs — no implementation in this baseline and verify `openspec status --change purechess-library --json` shows `proposal:done`, `specs:done`, `design:done`, `tasks:done`
