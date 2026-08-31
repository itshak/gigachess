// src/baseline/util.ts — baseline-exact util functions (ADR-014).
import type { CastlingSide, Color, Move, Role, RoleChar, Square, SquareName } from "./types.js";

export const defined = <A>(v: A | undefined): v is A => v !== undefined;
export const opposite = (color: Color): Color => (color === "white" ? "black" : "white");
export const squareRank = (square: Square): number => square >> 3;
export const squareFile = (square: Square): number => square & 7;
export const squareFromCoords = (file: number, rank: number): Square | undefined =>
  file >= 0 && file < 8 && rank >= 0 && rank < 8 ? rank * 8 + file : undefined;
export const roleToChar = (role: Role): RoleChar =>
  (({ pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k" }) as Record<Role, RoleChar>)[role];
export function charToRole(ch: RoleChar | Uppercase<RoleChar>): Role;
export function charToRole(ch: string): Role | undefined;
export function charToRole(ch: string): Role | undefined {
  const c = ch.toLowerCase();
  return c === "p" || c === "n" || c === "b" || c === "r" || c === "q" || c === "k"
    ? ({ p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" } as const)[c]
    : undefined;
}
export function parseSquare(str: SquareName): Square;
export function parseSquare(str: string): Square | undefined;
export function parseSquare(str: string): Square | undefined {
  if (str.length !== 2) return undefined;
  const file = str.charCodeAt(0) - 97;
  const rank = str.charCodeAt(1) - 49;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return undefined;
  return rank * 8 + file;
}
export const makeSquare = (square: Square): SquareName =>
  `${String.fromCharCode(97 + (square & 7))}${String.fromCharCode(49 + (square >> 3))}` as SquareName;

export const parseUci = (str: string): Move | undefined => {
  if (str.length === 4 || str.length === 5) {
    const from = parseSquare(str.slice(0, 2));
    const to = parseSquare(str.slice(2, 4));
    if (from !== undefined && to !== undefined) {
      if (str.length === 4) return { from, to };
      const promotion = charToRole(str[4]);
      if (promotion && promotion !== "pawn" && promotion !== "king") return { from, to, promotion };
    }
  }
  return undefined;
};

export const moveEquals = (left: Move, right: Move): boolean => {
  if ("role" in left && "role" in right) return left.role === right.role && left.to === right.to;
  if ("from" in left && "from" in right) {
    return left.from === right.from && left.to === right.to && left.promotion === right.promotion;
  }
  return false;
};

/** Converts a move to UCI notation, like `g1f3` or `a7a8q`. */
export const makeUci = (move: Move): string => {
  if ("role" in move) return `${roleToChar(move.role).toUpperCase()}@${makeSquare(move.to)}`;
  return makeSquare(move.from) + makeSquare(move.to) + (move.promotion ? roleToChar(move.promotion) : "");
};

export const kingCastlesTo = (color: Color, side: CastlingSide): Square =>
  color === "white" ? (side === "a" ? 2 : 6) : side === "a" ? 58 : 62;
export const rookCastlesTo = (color: Color, side: CastlingSide): Square =>
  color === "white" ? (side === "a" ? 3 : 5) : side === "a" ? 59 : 61;
