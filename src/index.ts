// src/index.ts — turbochess full entry (MIT)
// Re-exports all turbochess modules per spec (formerly purechess, ADR-015)

export * from "./squareSet.js";
export * from "./board.js";
export * from "./types.js";
export * from "./util.js";
export * from "./fen.js";
export * from "./san.js";
export * from "./pgn.js";
export * from "./chess960.js";

// attacks: explicit to avoid duplicate kingAttackers with chess
export {
  knightAttacks,
  kingAttacks,
  pawnAttacks,
  bishopAttacks,
  rookAttacks,
  queenAttacks,
  ensureMagicTablesLoaded,
  magicTablesLoaded,
  ray,
  between,
  isAttacked,
} from "./attacks.js";
export { kingAttackers } from "./attacks.js";

// chess core (avoid duplicate Position and kingAttackers)
export {
  dests,
  allDests,
  detectCastling,
  isCheck,
  isCheckmate,
  isStalemate,
  isInsufficientMaterial,
  isFiftyMoveDraw,
  isSeventyFiveMoveDraw,
  isThreefoldRepetition,
  perft,
  makeMove,
  play,
  Chess,
} from "./chess.js";
export type { CastlingPlan } from "./chess.js";
