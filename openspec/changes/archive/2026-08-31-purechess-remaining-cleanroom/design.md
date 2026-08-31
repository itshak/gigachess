## Context

See `proposal.md` Why. This is the strict clean-room impl of the remaining `chessops` + `pgn-chess-tree` + `chess.js` surface. `purechess` core already passes 13/13 gates (`bench/results/real-2026-08-30-gates-green.md`: Black Magic `{lo,hi}` fancy via blobs, TS functional API + imperative inside per ADR-012). Remaining gaps are `src/chessops/*` (`compat`, `transform`, `debug`), the rich `GameTree` previously split as `pgn-chess-tree`, and the `chess.js` mutable façade. All must be built from `openspec/specs/*` and MIT `refs/mit-permissive/` only — never from any GPL origin (see proposal What Changes).

Current state: `openspec/specs/{purechess-rules,purechess-board-movegen,purechess-pgn-fen,purechess-benchmarks,purechess-baseline}` are Source of Truth (archived). `src/squareSet.ts`/`src/attacks.ts` are `{lo,hi}` + Black Magic blob, `src/pgn.ts` streams but lacks the full `GameTree` variations/NAGs/comments depth, `src/chessjs.ts` is a stub.

Constraints: SHALL be language-neutral specs re-spec’d from docs/ABNF, SHALL forbid `BigInt` in hot path, SHALL keep tree-shakeable `sideEffects:false` + `exports` map, SHALL keep keyboard `[ ]`/`Alt+` + `AriaLiveAnnouncer` parity.

## Goals / Non-Goals

**Goals:**
- Make `purechess/pgn` the single PGN entry point with recursive `GameTree` (headers, `moves[{san,nags[],comments[],variations: GameTree[]}]`) that replaces `pgn-chess-tree` — no `pgn-chess-tree` dep, streaming `feed(chunk)` stays.
- Make `purechess/chessops` a drop-in for `import { Chess } from "chessops"` (plus `compat`/`transform`/`debug` as thin conversions, not new movegen) and `purechess/chessjs` a drop-in for `chess.js@1.4.0` via a mutable façade over the functional core, with `+`/`#`/`O-O`/`=Q` byte-identical.
- Add `bench/suites/chessjs.mjs` lane vs `chess.js` (same corpora, parity-first) and keep all `bench/suites/*` gates green.

**Non-Goals:**
- No `src/squareSet.ts`/`src/attacks.ts` hot-path change (already +441% vs HQ), no new magic tables, no WASM lane, no `src-tauri/` Rust, no DB schema.

## Decisions

### Decision: Single PGN entry point — merge pgn-chess-tree behavior into src/pgn.ts, no dep

- **Chosen:** Extend `src/pgn.ts` to expose `parsePgn`/`makePgn` + `PgnParser.feed(chunk)` + `GameTree` as defined in `purechess-pgn-fen` spec. ABNF and state machine (`HeaderKey, HeaderValue, Movetext, CommentBrace, VariationDepth`) are the spec; implementation is a hand-written string scanner (no `split`/`regex` whole-file). `makePgn` whitespace-normalizes but re-parses to byte-identical `GameTree`.
- **Alternative:** Keep `pgn-chess-tree` as a wrapper dep — rejected: author-owned but AGPL-tainted (imports `chessops` + lichess GPL), would re-taint `purechess` MIT.
- **ADR refs:** ADR-001 (AGPL taint), ADR-012 (TS functional).

### Decision: Thin compat/transform/debug — no new movegen, just conversions

- **Chosen:** `src/chessops/compat.ts` converts `allDests` → `chessground` `Dests` (`Map<Square, Square[]>`), `src/chessops/transform.ts` mirrors `Board` via `SquareSet` ops (`mirror` = swap `white`↔`black` + flip `lo`/`hi` bits), `src/chessops/debug.ts` re-exports `perft` + `debugBoard` (ASCII). All are pure, no `BigInt`, no `node_modules/chessops` import.
- **Alternative:** Re-implement movegen inside compat — rejected: duplicates `src/chess.ts` and risks divergence.

### Decision: chess.js façade as mutable wrapper, not a fork

- **Chosen:** `src/chessjs.ts` `class Chess { #pos: Position; constructor(fen?: string) { this.#pos = parseFen(fen).unwrap() } move(san){ const m=parseSan(san,this.#pos); this.#pos=makeMove(this.#pos,m) } fen(){ return makeFen(this.#pos) } ... }` — every method delegates to `src/chess.ts`/`src/san.ts`/`src/fen.ts`. No `node_modules/chess.js` read; only `purechess-*` specs + `src/chess.ts`.
- **Alternative:** Fork `chess.js` and patch — rejected: GPL-free but would copy its MIT code and its bugs (the 0.13 `e2e4` vs `e4` SAN variance that `chessops` already fixes).

### Decision: Strict clean-room — FORBIDDEN SOURCES list is exhaustive

- **Chosen:** Proposal’s `FORBIDDEN SOURCES` list is part of the spec and is enforced by `rg -n "chessops|pgn-chess-tree|GPL" src/` in CI (empty), plus commit hook that rejects any `node_modules/chessops` read. Allowed sources only `openspec/specs/*` + `refs/mit-permissive/` + `refs/docs-refs/` + own `src/`.
- **Alternative:** Allow “view but don’t copy” — rejected: viewing GPL still taints clean-room; spec agent already distilled behaviour into language-neutral GWT.

## Risks / Trade-offs

- [Risk] `pgn-chess-tree` GameTree depth may hide `NAG`/`comment` ordering edge cases → Mitigation: property tests vs `python-chess` corpus + `bench/suites/pgn-stream.mjs` `makePgn(parsePgn)` round-trip on 100k Lichess games.
- [Risk] `chess.js` `verbose` `moves()` shape may drift → Mitigation: `bench/suites/chessjs.mjs` compares `moves({verbose:true})` byte-identical vs `chess.js` on 10k FENs before timing.
- [Risk] `compat`/`transform` may be used to bypass `purechess` tree-shaking → Mitigation: `src/chessops/*` are separate `exports` entries, not re-exported from `purechess/core`; `bench/bundle` gate checks `parsePgn` absent from `core`.

## Migration Plan

1. Land this change (no `src-tauri/` change) — `npm run typecheck` + `rg` clean-room checks + `bench/bench-real.mjs` all 13 gates + new `chessjs` lane must pass.
2. Workstation can then swap `import { Chess } from "chessops"` → `from "purechess/chessops"` and `chess.js` consumers swap one import — separate `purechess-adopt` change gated on `[`/`]`/`Alt+` + `AriaLiveAnnouncer`.

## Open Questions

- None that block this spec — WASM lane remains deferred per ADR-012 until JS ceiling proven too low.
