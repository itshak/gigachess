// src/core.ts — turbochess core entry (no PGN, no Chess960) for tree-shaking
// Exports board, squareSet, attacks, fen, san, chess (standard rules)
// Side-effect free, tree-shakeable per ADR-012

export * from "./squareSet.js";
export * from "./board.js";
export * from "./types.js";
export * from "./util.js";
export * from "./fen.js";
export * from "./san.js";
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
  kingAttackers,
} from "./attacks.js";
export {
  dests,
  allDests,
  detectCastling,
  isCheck,
  isCheckmate,
  isStalemate,
  isInsufficientMaterial,
  isFiftyMoveDraw,
  isThreefoldRepetition,
  perft,
  makeMove,
  play,
  Chess,
} from "./chess.js";
export type { CastlingPlan } from "./chess.js";
