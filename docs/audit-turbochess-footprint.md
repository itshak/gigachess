# Footprint / perf audit — turbochess `src/` vs chessops

**Date:** 2026-08-31 (change: `turbochess-adopt`, tasks 3.1–3.2)
**Method:** full re-read of every `src/*.ts` and `src/chessops/*.ts` module.

## Baseline LOC (wc -l, 2026-08-31)

| Region | LOC |
|--------|-----|
| `src/*.ts` top-level | **3,829** (proposal cited 3,380 — grew with the chessjs façade in `purechess-remaining-cleanroom`) |
| `src/chessops/*.ts` compat façade | 1,602 |
| **Total** | **5,431** vs chessops ~2.2k (≈2.5×; chessops ships variants we don't, and our façade adds ~1.6k on purpose) |

Top files: `chess.ts` 988, `attacks.ts` 453, `fen.ts` 437, `san.ts` 434, `chessjs.ts` 433, `pgn.ts` 368, `board.ts` 238, `squareSet.ts` 188.

## Candidates (ranked; LOC/bytes estimated, gate impact assessed)

### 1. Dead object-table magic modules — stale `dist/` output only (SAFE, biggest bytes)
- **Refs:** `src/rookMagicBlob.ts:12`, `src/bishopMagicBlob.ts:12` are the only magic modules left in `src/` — the old object tables `src/rookMagic.ts`/`src/bishopMagic.ts` were already deleted when the blob migration landed (`src/attacks.ts` loads blobs lazily via `ensureMagicTablesLoaded()`, see `bench/README.md` "Magic tables" section). **But** stale `dist/rookMagic.js`, `dist/bishopMagic.js` (+ `.d.ts`, `.map`) still ship from a pre-migration build — ~3,373 KB raw / ~81 KB gz of dead code in the published package (`bench/results/real-2026-08-30-gates-green.md:43`).
- **Win:** ~3,373 KB raw / ~81 KB gz off `npm pack`. **Gate impact:** none — blob path is the sole loader; the bench harness reads `bench/magic-tables` blobs, not `dist/`. Verified `rg rookMagic src/` matches only the blob + `attacks.ts` dynamic import.
- **Action:** clean rebuild (`rm -rf dist && npm run build`) so `tsc` emits exactly the current graph.

### 2. FEN codec duplication between `src/chessops/fen.ts` and the shared bridge (SAFE, small)
- **Refs:** `src/chessops/fen.ts:32-36` (`parseBoardFen`) inlines `` parseFen(`${boardPart} w - - 0 1`) `` duplicating `src/chessops/fenInternal.ts:11-16` (`engineBoardFromPlacement`). Same trick again inline in `makeBoardFen` (`src/chessops/fen.ts:75-87`), which materializes a full throw-away `Setup` (8 fields) just to take field 1 of the output.
- **Win:** ~10 LOC + one fewer Setup/Board round-trip per call; single FEN bridge for the façade (fulfils the "shared `src/fenInternal.ts`" direction). **Gate impact:** none — `tests/compat-chessops.mjs` locks parse/make outputs byte-identically.
- **Action:** route `parseBoardFen` through the bridge (implemented, task 3.2).

### 3. Role↔char tables repeated 4× (MEDIUM, ~60 LOC)
- **Refs:** `src/util.ts:35-46` (`roleToChar` numeric), `src/fen.ts:28-54` (`roleFromChar`/`charFromPiece`), `src/san.ts:12-40` (`roleToSanChar`/`sanCharToRole`/`promoCharToRole`), `src/chessjs.ts:55-62` (`ROLE_CHARS`), `src/chessops/util.ts:10-19` (facade `roleToChar`).
- **Win:** ~60 LOC and better consistency; but several sit on hot paths (SAN make/parse) and switching enum↔string roles needs care across the engine/facade boundary. **Gate impact:** risk to SAN/FEN byte-parity gates if done hastily.
- **Action:** deferred — needs its own gated change.

### 4. `src/squareSet.ts` vs `src/chessops/squareSet.ts` (188 vs 190 LOC) (MEDIUM-HIGH risk)
- **Refs:** `src/squareSet.ts:34-91` free functions vs `src/chessops/squareSet.ts` class with the same `{lo,hi}` bit math (shift/rotate/popcnt/first all duplicated).
- **Win:** ~120 LOC by making the class delegate to the free functions. **Gate impact:** HIGH — the class methods are in the compat hot path (`allDests`/perft parity, 295,185-move dests gate); delegation adds indirection on the hottest façade path. V8 likely inlines it, but the parity/perf gates make this a bad "quick win".
- **Action:** deferred until the class methods can be benchmarked in isolation.

### 5. `src/chess.ts` (988) vs `src/chessops/chess.ts` (498) façade (LOW — mostly clean already)
- **Refs:** the façade (`src/chessops/chess.ts:1-17`) delegates all rules to the engine; duplication is limited to class bookkeeping (`Castles` default/rights materialization, `Context` assembly). Not the proposed "façade duplication" of movegen — that doesn't exist (verified: no second castling path, shared `detectCastling` per `bench/README.md` D2 notes).
- **Win:** minor (±30 LOC). **Gate impact:** not worth touching the perft/dests-critical engine.
- **Action:** none.

### 6. Repeated color/role set-extraction pattern in `src/attacks.ts` (LOW, ~40 LOC, perf-relevant)
- **Refs:** `src/attacks.ts:382-405` and `src/attacks.ts:410-445` (`isAttacked`/`kingAttackers`) repeat `sq.and(board.<color>, board.<role>)` per branch; a `colorRoleSet(board,color,role)` helper removes ~12 repeats.
- **Win:** ~40 LOC; **Gate impact:** small allocation-free helper is safe, but these are the hottest attack-check paths — measure before merging.
- **Action:** deferred (bench-gated).

### 7. Duplicated FEN constants (TRIVIAL, 6 LOC)
- **Refs:** `INITIAL_FEN` at `src/chessjs.ts:33`, `src/chessops/fen.ts:13`, `src/chessops/fenInternal.ts:6`; `EMPTY_BOARD_FEN` at `src/chessops/fen.ts:14` + `src/chessops/fenInternal.ts:7`.
- **Win:** 6 LOC, zero risk; keep constants in `fenInternal.ts` and re-export. **Gate impact:** none.

## Safe wins implemented in this change (task 3.2)

1. Clean rebuild → stale `dist/rookMagic.*`/`dist/bishopMagic.*` object tables removed from the distribution (candidate 1).
2. `src/chessops/fen.ts` `parseBoardFen` routed through the shared `fenInternal.ts` bridge; `INITIAL_FEN`/`EMPTY_BOARD_FEN` single-sourced via `fenInternal.ts` re-export (candidates 2 + 7).

All 13 `bench/bench-real.mjs` gates + `tests/parity.mjs` re-verified green after these changes (see `bench/results/`).

## Explicitly out of scope (kept as follow-ups)

- `const enum` vs `object as const` sweep (ADR-012 §81): `src/types.ts` already uses `const enum` throughout — nothing to convert.
- Candidates 3, 4, 6 above — each needs its own gated change with isolated benchmarks.

