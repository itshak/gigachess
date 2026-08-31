// src/baseline/index.ts — baseline-compatible public API (ADR-014).
// Mirrors the baseline root module layout: `import { Chess, parseFen, ... }
// from "turbochess/chessops" (formerly purechess/baseline, ADR-015)`. Backed by the immutable purechess engine.
export * from "./types.js";
export * from "./squareSet.js";
export * from "./board.js";
export * from "./setup.js";
export * from "./chess.js";
export * from "./fen.js";
export * from "./san.js";
export * from "./util.js";
export * from "./debug.js";
