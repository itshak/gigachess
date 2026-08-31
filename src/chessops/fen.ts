// src/baseline/fen.ts — baseline-exact FEN API (ADR-014), backed by the
// immutable engine parser (which additionally accepts unreachable ep squares
// and 4-field FENs per the purechess-rules spec — baseline-compatible).
import { Result } from "@badrap/result";
import * as engineFen from "../fen.js";
import { Board } from "./board.js";
import { SquareSet } from "./squareSet.js";
import type { Setup } from "./setup.js";
import { boardFromEngine, boardToEngine, setupFromEngine, setupToEngine } from "./convert.js";
import {
  EMPTY_BOARD_FEN,
  EMPTY_EPD,
  EMPTY_FEN,
  INITIAL_BOARD_FEN,
  INITIAL_EPD,
  INITIAL_FEN,
  engineBoardFromPlacement,
  engineMakePlacement,
} from "./fenInternal.js";

// FEN constants are single-sourced in the shared engine bridge (task 3.2).
export {
  EMPTY_BOARD_FEN,
  EMPTY_EPD,
  EMPTY_FEN,
  INITIAL_BOARD_FEN,
  INITIAL_EPD,
  INITIAL_FEN,
};

export enum InvalidFen {
  Fen = "ERR_FEN",
  Board = "ERR_BOARD",
  Pockets = "ERR_POCKETS",
  Turn = "ERR_TURN",
  Castling = "ERR_CASTLING",
  EpSquare = "ERR_EP_SQUARE",
  RemainingChecks = "ERR_REMAINING_CHECKS",
  Halfmoves = "ERR_HALFMOVES",
  Fullmoves = "ERR_FULLMOVES",
}

export class FenError extends Error {}

export const parseBoardFen = (boardPart: string): Result<Board, FenError> => {
  try {
    return Result.ok(boardFromEngine(engineBoardFromPlacement(boardPart)));
  } catch (e) {
    return Result.err(new FenError(e instanceof Error ? e.message : InvalidFen.Board));
  }
};

export const parseCastlingFen = (board: Board, castlingPart: string): Result<SquareSet, FenError> => {
  let rights = SquareSet.empty();
  for (const ch of castlingPart) {
    if (ch === "-") continue;
    let square: number | undefined;
    if (ch === "K") square = 7;
    else if (ch === "Q") square = 0;
    else if (ch === "k") square = 63;
    else if (ch === "q") square = 56;
    else if (ch >= "A" && ch <= "H") square = ch.charCodeAt(0) - 65; // white backrank file
    else if (ch >= "a" && ch <= "h") square = 56 + (ch.charCodeAt(0) - 97); // black backrank file
    else return Result.err(new FenError(InvalidFen.Castling));
    const piece = board.get(square);
    const expectedColor = ch === ch.toUpperCase() ? "white" : "black";
    if (!piece || piece.role !== "rook" || piece.color !== expectedColor) {
      return Result.err(new FenError(InvalidFen.Castling));
    }
    rights = rights.with(square);
  }
  return Result.ok(rights);
};

export const parseFen = (fen: string): Result<Setup, FenError> => {
  const r = engineFen.parseFen(fen);
  if (!r.ok) return Result.err(new FenError(r.error?.code ?? InvalidFen.Fen));
  return Result.ok(setupFromEngine(r.value));
};

export interface FenOpts {
  epd?: boolean;
}

export const makeFen = (setup: Setup, opts?: FenOpts): string => {
  const full = engineFen.makeFen(setupToEngine(setup));
  return opts?.epd ? full.split(" ").slice(0, 4).join(" ") : full;
};

export const makeBoardFen = (board: Board): string => {
  return engineMakePlacement(boardToEngine(board));
};
