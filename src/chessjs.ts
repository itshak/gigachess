// src/chessjs.ts — chess.js-compatible wrapper API for GigaChess
// Optional drop-in wrapper mirroring chess.js API ergonomics over the native Board engine.

export {
  Chess,
  INITIAL_FEN,
  type ColorName,
  type PieceChar,
  type VerboseMove,
  type HistoryEntry,
} from "./chess.js";

export { Chess960 } from "./chess960.js";

export const WHITE = "w";
export const BLACK = "b";

export const PAWN = "p";
export const KNIGHT = "n";
export const BISHOP = "b";
export const ROOK = "r";
export const QUEEN = "q";
export const KING = "k";

export const DEFAULT_POSITION = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const SQUARES = [
  "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8",
  "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7",
  "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6",
  "a5", "b5", "c5", "d5", "e5", "f5", "g5", "h5",
  "a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4",
  "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3",
  "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2",
  "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1",
] as const;
