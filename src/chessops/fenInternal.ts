// src/chessops/fenInternal.ts — engine bridge shared by the chessops-compatible
// facade modules (ADR-014). Not part of the public API.
import * as engine from "../board.js";

export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const EMPTY_BOARD_FEN = "8/8/8/8/8/8/8/8";

/** Parses a board placement field into an engine Board (throws on garbage —
 * callers wrap into Result). */
export function engineBoardFromPlacement(placement: string): engine.Board {
  const parsed = engineParseFen(`${placement} w - - 0 1`);
  if (!parsed.ok) throw new Error(parsed.error?.code ?? "fen/invalidPiecePlacement");
  return parsed.value.board;
}

import { parseFen as engineParseFen } from "../fen.js";
