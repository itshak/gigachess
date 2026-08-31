// src/packedMove.ts — 16-bit packed move encoding ("moves2", design D3)
// 2-byte format matching blind-base's gigabase_moves.rs:
//   bits 0..5   (6 bits) from square index (0..63, a1 = 0)
//   bits 6..11  (6 bits) to square index (0..63)
//   bits 12..15 (4 bits) promotion code (0 = none, 1 = N, 2 = B, 3 = R, 4 = Q)
// Games pack into a flat Uint16Array (160 bytes per 80-ply game) for 25x–50x
// memory reduction over object moves, with ultra-fast binary replay and a
// direct Tauri IPC bridge (little-endian Uint8Array form).
// MIT turbochess.

import { Role } from "./types.js";
import type { Move } from "./types.js";

export type PackedMove = {
  from: number;
  to: number;
  /** promotion code (0 = none, 1 = N, 2 = B, 3 = R, 4 = Q) */
  promo: number;
};

/** moves2 promotion codes (NOT the Role enum — spec-mandated encoding). */
export const PROMO_NONE = 0;
export const PROMO_KNIGHT = 1;
export const PROMO_BISHOP = 2;
export const PROMO_ROOK = 3;
export const PROMO_QUEEN = 4;

/** Packs from/to/promo into one 16-bit word. */
export function packMove(from: number, to: number, promo: number = PROMO_NONE): number {
  return ((from & 0x3f) | ((to & 0x3f) << 6) | ((promo & 0x0f) << 12)) & 0xffff;
}

/** Unpacks a 16-bit word into its from/to/promo fields. */
export function unpackMove(word: number): PackedMove {
  const w = word & 0xffff;
  return {
    from: w & 0x3f,
    to: (w >>> 6) & 0x3f,
    promo: (w >>> 12) & 0x0f,
  };
}

/** Role enum → moves2 promotion code. */
export function roleToPromoCode(role: Role): number {
  switch (role) {
    case Role.Knight: return PROMO_KNIGHT;
    case Role.Bishop: return PROMO_BISHOP;
    case Role.Rook: return PROMO_ROOK;
    case Role.Queen: return PROMO_QUEEN;
    default: return PROMO_NONE;
  }
}

/** moves2 promotion code → Role enum (undefined for PROMO_NONE). */
export function promoCodeToRole(code: number): Role | undefined {
  switch (code & 0x0f) {
    case PROMO_KNIGHT: return Role.Knight;
    case PROMO_BISHOP: return Role.Bishop;
    case PROMO_ROOK: return Role.Rook;
    case PROMO_QUEEN: return Role.Queen;
    default: return undefined;
  }
}

/** Packs a Move into its 16-bit word (promotion flags are honored). */
export function packOf(move: Move): number {
  const promo = move.promotion !== null && move.promotion !== undefined ? roleToPromoCode(move.promotion) : PROMO_NONE;
  return packMove(move.from, move.to, promo);
}

/** Expands a 16-bit word into an engine Move (no legality interpretation). */
export function unpackToMove(word: number): Move {
  const { from, to, promo } = unpackMove(word);
  const role = promoCodeToRole(promo);
  return {
    from,
    to,
    promotion: role ?? null,
    isPromotion: role !== undefined,
    isEnPassant: false,
    isCastling: false,
  };
}

/** Packs a move list into a flat Uint16Array (moves2 stream). */
export function movesToPacked(moves: readonly Move[]): Uint16Array {
  const out = new Uint16Array(moves.length);
  for (let i = 0; i < moves.length; i++) out[i] = packOf(moves[i]);
  return out;
}

/** Expands a moves2 stream (Uint16Array, or little-endian Uint8Array) into engine Moves. */
export function packedToMoves(buffer: Uint16Array | Uint8Array): Move[] {
  const words =
    buffer instanceof Uint16Array
      ? buffer
      : // little-endian byte pairs (Tauri IPC / gigabase_moves.rs wire form)
        new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength >> 1);
  const out: Move[] = [];
  for (let i = 0; i < words.length; i++) {
    // normalize byte order for the Uint8Array form (host is little-endian;
    // the wire format is little-endian, so native Uint16Array reads match)
    out.push(unpackToMove(words[i] & 0xffff));
  }
  return out;
}
