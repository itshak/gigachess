// src/baseline/index.ts — baseline-compatible public API (ADR-014).
// Mirrors the baseline root module layout: `import { Chess, parseFen, ... }
// from "gigachess/chessops" (formerly gigachess/baseline, ADR-015)`. Backed by the immutable gigachess engine.
export * from "./types.js";
export * from "./squareSet.js";
export * from "./board.js";
export * from "./setup.js";
export * from "./chess.js";
export * from "./fen.js";
export * from "./san.js";
export * from "./util.js";
export * from "./debug.js";
// Integrated tree analysis (change gigachess-unified-api-and-perf, task 3.3):
// the workstation consumes chessops + chesstree from ONE package. Re-exports
// the clean-room chesstree layer (buildTree / pgnImport / pgnExport /
// TreeWrapper) alongside the chessops-shaped API.
export {
  buildTree,
  pgnImport,
  pgnExport,
  build,
  TreeWrapperImpl,
} from "../chesstree.js";
export type {
  TreeWrapper,
  TreeNode,
  Path,
  Comment,
  Glyph,
  Clock,
  Shape,
  Eval as TreeEval,
  Game,
  Player,
  AnalyseData,
} from "../chesstree.js";
