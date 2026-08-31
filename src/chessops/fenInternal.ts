// src/baseline/fenInternal.ts — engine bridge shared by the baseline-compatible
// facade modules (ADR-014). Not part of the public API. Single-sourced FEN
// constants + placement codecs (turbochess-adopt task 3.2; formerly
// `purechess`, ADR-015).
import { parseFen as engineParseFen, makeFen as engineMakeFen } from "../fen.js";
import type { Board as EngineBoard } from "../board.js";
import type { Setup as EngineSetup } from "../types.js";
import { Color } from "../types.js";

export const INITIAL_BOARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
export const INITIAL_EPD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const EMPTY_BOARD_FEN = "8/8/8/8/8/8/8/8";
export const EMPTY_EPD = "8/8/8/8/8/8/8/8 w - -";
export const EMPTY_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";

/** Parses a board placement field into an engine Board (throws on garbage —
 * callers wrap into Result). */
export function engineBoardFromPlacement(placement: string): EngineBoard {
  const parsed = engineParseFen(`${placement} w - - 0 1`);
  if (!parsed.ok) throw new Error(parsed.error?.code ?? "fen/invalidPiecePlacement");
  return parsed.value.board;
}

const EMPTY_CASTLING = {
  white: new Set<number>(),
  black: new Set<number>(),
  whiteKing: false,
  whiteQueen: false,
  blackKing: false,
  blackQueen: false,
};

/** Renders just the piece-placement field of an engine Board (no castling/ep
 * counters — those need a real Setup, which callers with one should use
 * engineMakeFen for directly). */
export function engineMakePlacement(board: EngineBoard): string {
  const setup: EngineSetup = {
    board,
    turn: Color.White,
    castling: EMPTY_CASTLING,
    epSquare: null,
    halfmoves: 0,
    fullmoves: 1,
  };
  return engineMakeFen(setup).split(" ")[0];
}

