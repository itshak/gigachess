// src/index.ts — turbochess full entry (MIT): the Unified Super API
// Re-exports all turbochess modules per spec (formerly purechess, ADR-015)
// and defines the root Unified `Chess` class (design D1): the ergonomic
// chess.js-superset core class extended with native tree navigation
// (`toTree`/`loadTree`), so `turbochess/core` stays free of PGN/tree code.

export * from "./squareSet.js";
export * from "./board.js";
export * from "./types.js";
export * from "./util.js";
export * from "./fen.js";
export * from "./san.js";
export * from "./pgn.js";
export * from "./chess960.js";
export * from "./zobrist.js";
export * from "./packedMove.js";

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
  lineRay,
  LINE_RAY_LO,
  LINE_RAY_HI,
  isAttacked,
} from "./attacks.js";
export { kingAttackers } from "./attacks.js";
export {
  CASTLE_PATH_LO,
  CASTLE_PATH_HI,
  CASTLE_CLEAR_STD,
} from "./castling.js";

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
  isLegal,
  perft,
  countLegalMoves,
  legalMovesInto,
  forEachLegalMove,
  MoveCounter,
  makeMove,
  play,
  INITIAL_FEN,
} from "./chess.js";
export type { CastlingPlan, Undo } from "./chess.js";

// chesstree integration (tree shapes + analysis API, folded into the root)
export {
  pgnImport,
  buildTree,
  build,
  pgnExport,
  TreeWrapperImpl,
} from "./chesstree.js";
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
} from "./chesstree.js";
