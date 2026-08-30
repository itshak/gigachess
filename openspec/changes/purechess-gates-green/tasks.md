# Tasks: purechess-gates-green

## 1. Castling correctness (perft parity + dests-terminal gates)

- [ ] 1.1 Representation bake-off (ADR-013): build `allDests`/`makeMove`/`parseSan`/`makeSan`/`perft` under both representations behind a temporary flag; benchmark on the castling-heavy corpus subset (`r3k2r/…` positions, Kiwipete, pos4); record measurements; decide normalized-dest vs king-captures-rook per design D1; amend ADR-013 (status: Amended, measurements attached)
- [ ] 1.2 Unify castling into one `detectCastling`/`applyCastling` path used by `makeMove`, `parseSan`, `makeSan`, and the internal `perft` movegen (delete the second castling code path); rook relocation + rights clearing always completed for the canonical representation
- [ ] 1.3 Add unit tests for the two minimal repros: `r3k2r/8/8/8/8/8/8/3K4 b kq` + queenside → `2kr3r/…` (rook on d8), kingside → `r4rk1/…`; `makeSan` of canonical castling = `O-O` (not `Kg1`/`Kxh1`); `PERFT_FULL=1 npm test` covers Kiwipete d4 = 4,085,603
- [ ] 1.4 `bench/suites/perft.mjs` gate green: 0 mismatches over 504 FEN/depth comparisons vs chessops AND published corpus values
- [ ] 1.5 Root-cause the replayed-position defect (`r2kQb1r … b KQ - 2 13`: bogus `59-58` dest + `isCheckmate` disagreement) per design D4; fix; `bench/suites/dests-terminal.mjs` gate green at 100% parity over 10k positions
- [ ] 1.6 Simplify `tests/parity.mjs` canonicalization helpers per the bake-off outcome (delete `normDest`/`normDestCo` if representations converged; keep one documented delta otherwise)

## 2. En-passant FEN parity (fen-san-uci gate)

- [ ] 2.1 `parseFen` accepts structurally valid ep squares even when not capturable (chessops-compatible); add `strict: true` option restoring the capturable check with error code `purechess.fen.enPassantNotCapturable` (en/ru/he keys)
- [ ] 2.2 Verify `makeFen` emits the stored ep square as-is and round-trips byte-identically to chessops on lichess-style FENs; add the results-file repro FEN as a unit test
- [ ] 2.3 `bench/suites/fen-san-uci.mjs` parity gate green: parse agreement 100% on ep FENs, ≥99% overall, SAN/UCI at current levels (SAN make ≥99.99% after 1.2 lands)

## 3. Tables as blob + lazy loading (bundle + sliding gates)

- [ ] 3.1 Extend the table generator to emit base64/`Uint8Array` blob modules (from the checked-in `bench/magic-tables/*.json`, MIT pipeline unchanged) replacing `dist/rookMagic.js`/`dist/bishopMagic.js` object literals (3,373 KB → 841 KB raw / 26 KB gz)
- [ ] 3.2 `src/attacks.ts`: decode blobs into `Uint32Array` lo/hi views; return fresh `{lo,hi}` per call (remove shared-mutable table entries); reuse the existing 64-bit multiply split
- [ ] 3.3 Lazy loading: remove table modules from the static import graph; make `ensureMagicTablesLoaded()` perform the dynamic `import()` + view construction; naive ray-walk fallback serves until loaded; fix stale "plain fixed-shift uniform 11" comments to document the fancy encoding
- [ ] 3.4 Workstation pre-warm: call `ensureMagicTablesLoaded()` at app startup (non-blocking); document the async contract
- [ ] 3.5 `bench/suites/sliding.mjs` gates green (parity 100k/100k; MAttacks/s ≥2.5× chessops loaded) and the pre-load naive path verified ≥1.5× chessops

## 4. Bundle gate re-baseline

- [ ] 4.1 `bench/suites/bundle.mjs`: assert zero magic-table bytes in the core static bundle (in addition to parsePgn/Chess960 absence); report full-bundle + lazy-table-chunk sizes for transparency
- [ ] 4.2 Bundle gate green: core ≤120% of chessops Chess-import gz (expected ≈6.0 vs 5.2 KB); record before/after (81 KB → ~30 KB gz total) in `bench/README.md`

## 5. FEN throughput (stretch gate)

- [ ] 5.1 Profile and optimize `parseFen`/`makeFen` (allocation trimming, single-pass placement field) toward the ≥+20% gate (measured 0.97–1.06× today)
- [ ] 5.2 If ≥+20% is genuinely unreachable, file the follow-up spec amendment with profile evidence — do not silently drop the gate

## 6. Validation & documentation

- [ ] 6.1 `npm test` green (typecheck, perft fast suite, parity, purity); `PERFT_FULL=1 npm test` green (kiwipete d4 regression)
- [ ] 6.2 `npm run bench:real:ci` (full corpora) exit 0 — all 12 gates pass; update `bench/results/` with the new run and update `bench/README.md` gate table
- [ ] 6.3 Update ADR-013 (amended status + measurements), `bench/README.md` pins/notes, and workstation touch-point audit notes per the D1 outcome
