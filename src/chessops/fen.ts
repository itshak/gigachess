// src/baseline/fen.ts — baseline-exact FEN API (ADR-014), backed by the
// immutable engine parser (which additionally accepts unreachable ep squares
// and 4-field FENs per the purechess-rules spec — baseline-compatible).
import { Result } from "@badrap/result";
import * as engineFen from "../fen.js";
import { Board } from "./board.js";
import { SquareSet } from "./squareSet.js";
import type { Setup } from "./setup.js";
import { boardFromEngine, setupFromEngine, setupToEngine } from "./convert.js";

export const INITIAL_BOARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
export const INITIAL_EPD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const EMPTY_BOARD_FEN = "8/8/8/8/8/8/8/8";
export const EMPTY_EPD = "8/8/8/8/8/8/8/8 w - -";
export const EMPTY_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";

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
  const r = engineFen.parseFen(`${boardPart} w - - 0 1`);
  if (!r.ok) return Result.err(new FenError(r.error?.code ?? InvalidFen.Board));
  return Result.ok(boardFromEngine(r.value.board));
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
  const full = engineFen.makeFen(setupToEngine({
    board,
    pockets: undefined,
    turn: "white",
    castlingRights: SquareSet.empty(),
    epSquare: undefined,
    remainingChecks: undefined,
    halfmoves: 0,
    fullmoves: 1,
  }));
  return full.split(" ")[0];
};
