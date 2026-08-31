## 1. Rename distribution purechess → turbochess with purechess alias

- [ ] 1.1 Check `npm view turbochess` is 404 (free) via `npm-name-cli`, reserve `turbochess` and `turbo-chess` fallback, verify no conflict with `chess`, `chess.js`, `chess.ts`, `chessops` via `packages.ecosyste.ms` — verification: `npm view turbochess` prints 404 and `naming-report.md` lists `turbochess` + `turbo-chess` as free with conflict notes
- [ ] 1.2 Rename `package.json` `name` `purechess` → `turbochess`, keep `purechess` as one-release alias re-export (re-export `turbochess` or `purechess` package depends on `turbochess`), update `README.md` + `openspec/` + `docs/` + `bench/` strings `purechess` → `turbochess` with alias note, add `openspec/adr/013-turbochess-rename.md` — verification: `cat package.json | grep '"name": "turbochess"'` and `rg -n "turbochess" README.md` and `ls openspec/adr/013*.md` exist and `npm run typecheck` still passes

## 2. One-line workstation import swap

- [ ] 2.1 Change exactly one import line per file: `src/lib/chess.ts` `from "chessops"` → `from "turbochess/chessops"` and `pgn-chess-tree` → `turbochess/pgn` where used, no logic change — verification: `git diff HEAD -- src/lib/chess.ts` is exactly `from "chessops"` → `from "turbochess/chessops"` and `rg -n "from.*chessops" src/` is empty after
- [ ] 2.2 Run `npm run typecheck` + `npm run test` (`perft`, `castling`, `parity`, `purity`, `compat-chessops`, `chessjs-parity`) and `bench/bench-real.mjs --quick` (13/13 gates) and `bench/suites/chessjs.mjs` (100% parity) — verification: all `51+22` tests pass and `bench/bench-real.mjs --quick` exits 0 with `sliding 3.36×`, `perft +19%`, `pgn 2.1×`, `fen 2×`

## 3. Holistic footprint/perf audit (why 3,380 vs ~2.2k lines, 1.5×)

- [ ] 3.1 Re-read **all** `src/*.ts` (3380 LOC: `src/chess.ts:988`, `src/fen.ts:437`, `src/san.ts:434`, `src/pgn.ts:347`, `src/attacks.ts:453`, `src/board.ts:238`, `src/squareSet.ts:188`, `src/chessops/*`) and write `docs/audit-turbochess-footprint.md` listing the top ≥5 deduplication/dead-code win candidates with `src/*.ts:line` refs, estimated LOC/bytes saved, and gate impact (e.g. `src/rookMagic.ts`/`src/bishopMagic.ts` object tables 3,373 KB raw / 81KB gz behind blobs, `src/fen.ts` + `src/chessops/fen.ts` FEN codec duplication, `src/squareSet.ts` vs `src/chessops/squareSet.ts`, `src/san.ts` vs `src/chessops/san.ts`, `src/chess.ts` vs `src/chessops/chess.ts` façade) — verification: `cat docs/audit-turbochess-footprint.md` lists ≥5 candidates with `:` line refs and `wc -l src/*.ts` baseline 3380 noted
- [ ] 3.2 Implement the **safe wins** from the audit that keep all gates green (e.g. delete dead `src/rookMagic.ts`/`src/bishopMagic.ts` object tables after blob migration, deduplicate `fen.ts` codecs via shared `src/fenInternal.ts`, unify `squareSet` ops) and re-run `npm run bench:real -- --quick` — verification: `bench/bench-real.mjs --quick` still 13/13 green and `tests/parity.mjs` 0 mismatches, so audit wins are safe
- [ ] 3.3 Verify `en`/`ru`/`he` keys renamed `purechess.*` → `turbochess.*` still exist and keyboard `[`/`]`/`Alt+` + `AriaLiveAnnouncer` via `makeSan` + `enableArrowMoveShortcuts` OFF still hold — verification: `rg -n "turbochess\." src/locales/en/purechess.json` (or `turbochess.json`) and manual VoiceOver/NVDA check `[`/`]` stepping with `turbochess/chessops` `Chess`

## 4. Validation

- [ ] 4.1 Run `npm run typecheck`, `rg -n "GPL" src/` empty, `rg -n "from.*chessops|node_modules/chessops" src/` empty (clean-room, only `turbochess` imports), and `openspec validate --changes --json` valid — verification: `npm run typecheck` exits 0, both `rg` return empty (exit 1), `openspec validate --changes --json | jq .summary.totals.failed` is 0
