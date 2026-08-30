// src/util.ts — pure helpers for square/file/rank/color, no G P L

import { Color } from "./types.js";

export function opposite(c: Color): Color {
  return c === Color.White ? Color.Black : Color.White;
}

export function squareFile(sq: number): number {
  return sq & 7;
}

export function squareRank(sq: number): number {
  return sq >> 3;
}

export function squareFromCoords(file: number, rank: number): number {
  return (rank << 3) | file;
}

export function squareName(sq: number): string {
  const f = String.fromCharCode(97 + (sq & 7));
  const r = String.fromCharCode(49 + (sq >> 3));
  return f + r;
}

export function parseSquare(name: string): number | undefined {
  if (name.length !== 2) return undefined;
  const f = name.charCodeAt(0) - 97;
  const r = name.charCodeAt(1) - 49;
  if (f < 0 || f > 7 || r < 0 || r > 7) return undefined;
  return (r << 3) | f;
}

export function roleToChar(role: number): string {
  // Role enum order Pawn=0 etc
  switch (role) {
    case 0: return "p";
    case 1: return "n";
    case 2: return "b";
    case 3: return "r";
    case 4: return "q";
    case 5: return "k";
    default: return "?";
  }
}

export function charToRole(ch: string): number | undefined {
  const c = ch.toLowerCase();
  if (c === "p") return 0;
  if (c === "n") return 1;
  if (c === "b") return 2;
  if (c === "r") return 3;
  if (c === "q") return 4;
  if (c === "k") return 5;
  return undefined;
}

export function colorToChar(c: Color): string {
  return c === Color.White ? "w" : "b";
}
