// src/baseline/san.ts — baseline-exact SAN API (ADR-014): position-first
// signatures, `parseSan` returns `Move | undefined`.
import * as engineSan from "../san.js";
import type { Position } from "./chess.js";
import type { Move } from "./types.js";
import { isDrop } from "./types.js";
import { moveFromFacade, moveToFacade } from "./convert.js";

export const makeSan = (pos: Position, move: Move): string => {
  if (isDrop(move)) throw new Error("Drops are not supported in standard chess");
  const epos = pos.eposInternal();
  return engineSan.makeSan(moveFromFacade(epos, move), epos);
};

export const makeSanAndPlay = (pos: Position, move: Move): string => {
  const san = makeSan(pos, move);
  pos.play(move);
  return san;
};

export const makeSanVariation = (pos: Position, variation: Move[]): string => {
  const clone = pos.clone();
  const parts: string[] = [];
  for (const move of variation) {
    if (isDrop(move)) throw new Error("Drops are not supported in standard chess");
    parts.push(makeSan(clone, move));
    clone.play(move);
  }
  return parts.join(" ");
};

export const parseSan = (pos: Position, san: string): Move | undefined => {
  const r = engineSan.parseSan(san, pos.eposInternal());
  if (!r.ok) return undefined;
  return moveToFacade(r.value);
};
