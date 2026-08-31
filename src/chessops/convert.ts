// src/baseline/convert.ts — internal engine <-> facade converters (ADR-014).
// Not part of the public API. The facade never mutates caller-provided values;
// conversions produce fresh engine positions (the engine itself is immutable).
import * as engineBoardMod from "../board.js";
import type { Board as EngineBoard } from "../board.js";
import type { Move as EngineMove, Position as EnginePosition } from "../types.js";
import { Role as ERole, Color as EColor } from "../types.js";
import type { CastlingRights as EngineCastlingRights } from "../types.js";
import { Color as FColor, Role as FRole } from "./types.js";
import type { Move as FacadeMove, NormalMove as FacadeNormalMove, Piece } from "./types.js";
import { Board } from "./board.js";
import type { Setup } from "./setup.js";
import { SquareSet } from "./squareSet.js";

const COLORS: FColor[] = ["white", "black"];
const ROLES: FRole[] = ["pawn", "knight", "bishop", "rook", "queen", "king"];

export const toEngineColor = (c: FColor): EColor => (c === "white" ? EColor.White : EColor.Black);
export const fromEngineColor = (c: EColor): FColor => (c === EColor.White ? "white" : "black");
export const toEngineRole = (r: FRole): ERole => ROLES.indexOf(r) as unknown as ERole;
export const fromEngineRole = (r: ERole): FRole => ROLES[r];

export const pieceFromEngine = (p: { color: EColor; role: ERole }): Piece => ({
  color: fromEngineColor(p.color),
  role: fromEngineRole(p.role),
});

/** Facade Board -> engine board, normalized to unsigned bit patterns. */
export const boardToEngine = (b: Board): EngineBoard => {
  const src = b._b;
  const out: Record<string, { lo: number; hi: number }> = {};
  for (const k of Object.keys(src) as (keyof engineBoardMod.Board)[]) {
    out[k] = { lo: src[k].lo >>> 0, hi: src[k].hi >>> 0 };
  }
  return out as unknown as EngineBoard;
};
export const boardFromEngine = (b: EngineBoard): Board => {
  const facade = Board.empty();
  facade._b = b; // engine boards are already unsigned-normalized
  return facade;
};

/** castlingRights SquareSet + board -> engine per-color rook-origin sets. */
export function castlingSetsFromRights(rights: SquareSet, board: Board): { white: Set<number>; black: Set<number> } {
  const white = new Set<number>();
  const black = new Set<number>();
  for (const square of rights) {
    const piece = board.get(square);
    if (piece && piece.role === "rook") {
      (piece.color === "white" ? white : black).add(square);
    }
  }
  return { white, black };
}

export function engineCastling(sets: { white: Set<number>; black: Set<number> }): EngineCastlingRights {
  return {
    white: sets.white,
    black: sets.black,
    whiteKing: sets.white.has(7),
    whiteQueen: sets.white.has(0),
    blackKing: sets.black.has(63),
    blackQueen: sets.black.has(56),
  };
}

/** baseline Setup -> engine Position. */
export function setupToEngine(setup: Setup): EnginePosition {
  const sets = castlingSetsFromRights(setup.castlingRights, setup.board);
  return {
    board: boardToEngine(setup.board),
    turn: toEngineColor(setup.turn),
    castling: engineCastling(sets),
    epSquare: setup.epSquare === undefined ? null : setup.epSquare,
    halfmoves: setup.halfmoves,
    fullmoves: setup.fullmoves,
  };
}

/** engine Position -> baseline Setup. */
export function setupFromEngine(pos: EnginePosition): Setup {
  const board = boardFromEngine(pos.board);
  // baseline stores set bits as signed int32 — mirror that on the facade side
  const rights = new SquareSet(
    [...pos.castling.white].reduce((a, s) => a | (1 << s), 0) | 0,
    [...pos.castling.black].reduce((a, s) => a | (1 << (s - 32)), 0) | 0,
  );
  return {
    board,
    pockets: undefined,
    turn: fromEngineColor(pos.turn),
    castlingRights: rights,
    epSquare: pos.epSquare === null ? undefined : pos.epSquare,
    remainingChecks: undefined,
    halfmoves: pos.halfmoves ?? 0,
    fullmoves: pos.fullmoves ?? 1,
  };
}

/**
 * Facade move -> engine move, deriving the engine's special-move flags from
 * the position (ep: pawn capturing diagonally onto the ep square; castling
 * and legality are detected inside the engine's shared detectCastling path).
 * Callers' move objects are never mutated.
 */
export function moveFromFacade(pos: EnginePosition, move: FacadeMove): EngineMove {
  if (!("from" in move)) throw new Error("DropMove is not supported in standard chess");
  const from = move.from;
  const to = move.to;
  const piece = engineBoardMod.pieceAt(pos.board, from);
  const isEnPassant =
    !!piece &&
    piece.role === ERole.Pawn &&
    pos.epSquare !== null &&
    to === pos.epSquare &&
    (from & 7) !== (to & 7);
  const promotion = move.promotion === undefined ? null : toEngineRole(move.promotion);
  return {
    from,
    to,
    promotion,
    isPromotion: move.promotion !== undefined,
    isEnPassant,
    isCastling: false,
  };
}

export function moveToFacade(m: EngineMove): FacadeNormalMove {
  const out: FacadeNormalMove = { from: m.from, to: m.to };
  if (m.promotion !== null && m.promotion !== undefined) out.promotion = fromEngineRole(m.promotion as ERole);
  return out;
}
