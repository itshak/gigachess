# gigachess-chesstree-compat Specification

## Purpose
Provides a clean-room, GPL-free chesstree-compatible analysis-tree layer (`gigachess/chesstree`) so the workstation can drop the GPL-3.0 `@itshak/chesstree` dependency (the packaged lichess-tree, formerly distributed as `pgn-chess-tree`) and run entirely on gigachess, gated on output parity against the GPL baseline.

## Requirements

### Requirement: chesstree-compatible tree facade backed by the gigachess engine

The system SHALL expose `gigachess/chesstree` implementing the `@itshak/chesstree` public surface used by consumers — `pgnImport(pgn) → AnalyseData` (`treeParts` of `Tree.Node` roots carrying `id`, `ply`, `san`, `fen`, `uci`, `children`, `comments` with `pgn-comment-comment-<path>-<index>` ids), `build(root) → TreeWrapper` (path ops over 2-char node-id concatenations: `nodeAtPath`, `getNodeList`/`nodesOnPath`, `lastPly`, `addNode`, `addNodes`, `setCommentAt`, `deleteCommentAt`, `setGlyphsAt`, `setClockAt`, `pathExists`, `pathIsMainline`, `parentNode`, `export`/`pgn`), and `pgnExport.renderFullTxt/renderVariationPgn` (Seven Tag Roster + FEN/SetUp headers, move-numbered movetext with inline comments and recursive variations) — with every output byte- or structure-identical to the GPL-3.0 `@itshak/chesstree@2.0.0` dev-only baseline, castling UCI compared under the ADR-013 `e1h1`≡`e1g1` equivalence. Node ids SHALL be unique 2-char tokens; NAGs SHALL be dropped at import (baseline parity); no GPL code SHALL be read or copied (public `.d.ts` shapes only).

#### Scenario: Import parity vs GPL baseline
- **WHEN** `node tests/chesstree-parity.mjs` runs its corpus (standard start, FEN-header start, variations, comments, clocks-as-comments, promotions, castling, multi-game input) through both `gigachess/chesstree` and `@itshak/chesstree`
- **THEN** every node's `san`/`uci`(ADR-013-normalized)/`fen`/`ply`/child order, comment texts and id scheme, `game`/`player`/`opponent` fields, and `renderFullTxt` bytes match, with 0 divergences, and the facade never throws on garbage input (returns empty `treeParts` like consumers' fallback paths expect)

#### Scenario: Workstation runs chesstree-free
- **WHEN** blind-base's `@itshak/chesstree` imports are swapped to `gigachess/chesstree` and `npm run typecheck` + `npx vitest run` run there
- **THEN** typecheck exits 0, the full vitest suite passes, and `rg -n '@itshak/chesstree|from "chessops' src/` is empty in the workstation
