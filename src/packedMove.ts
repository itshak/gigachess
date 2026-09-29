// src/packedMove.ts — 16-bit packed move encoding ("moves2", design D3)
// 2-byte format matching gigachess 16-bit moves2 wire format:
//   bits 0..5   (6 bits) from square index (0..63, a1 = 0)
//   bits 6..11  (6 bits) to square index (0..63)
//   bits 12..15 (4 bits) promotion code (0 = none, 1 = N, 2 = B, 3 = R, 4 = Q)
// Games pack into a flat Uint16Array (160 bytes per 80-ply game) for 25x–50x
// memory reduction over object moves, with ultra-fast binary replay and a
// direct Tauri IPC bridge (little-endian Uint8Array form).
// MIT gigachess.

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

// ---------- null move (pass) — the first-class `0xffff` sentinel ----------
//
// The null move is NOT a from/to/promo triple: it is the single u16 sentinel
// `0xffff`, matching gigachess-rs `Move(0xffff)` (board.rs make_null_move).
// The sentinel is reserved — no legal move packs to it (the widest legal word
// is 0x4fff: from=63, to=63, promo=4), so the value is unambiguous in a
// moves2 stream.

/** The null-move (pass) sentinel word. */
export const NULL_MOVE_WORD = 0xffff;

/** Canonical SAN rendering of a pass — never suffixed with `+` or `#`. */
export const NULL_MOVE_SAN = "--";

/** Canonical UCI rendering of a pass. */
export const NULL_MOVE_UCI = "0000";

/** True when `word` is the null-move sentinel (a pass, not a board move). */
export function isNull(word: number): boolean {
  return (word & 0xffff) === NULL_MOVE_WORD;
}

/**
 * A fresh null-move value (never share one instance across callers).
 *
 * `from`/`to` mirror the sentinel's own field decode (both 63) so the value
 * round-trips through the wire format unchanged; `isNull` is what identifies
 * it as a pass, never the squares.
 */
export function nullMove(): Move {
  return {
    from: 63,
    to: 63,
    promotion: null,
    isPromotion: false,
    isEnPassant: false,
    isCastling: false,
    isNull: true,
  };
}

/** True when `move` is the null move (pass). */
export function isNullMove(move: Move): boolean {
  return move.isNull === true;
}

/**
 * Unpacks a 16-bit word into its from/to/promo fields.
 *
 * The null-move sentinel `0xffff` is a pass, not a from/to/promo triple; the
 * caller must test `isNull(word)` first (see `unpackToMove`, which does).
 */
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
  // A pass is the reserved sentinel, not a from/to/promo triple.
  if (isNullMove(move)) return NULL_MOVE_WORD;
  const promo = move.promotion !== null && move.promotion !== undefined ? roleToPromoCode(move.promotion) : PROMO_NONE;
  return packMove(move.from, move.to, promo);
}

/**
 * Expands a 16-bit word into an engine Move (no legality interpretation).
 *
 * The null-move sentinel decodes to a first-class pass — it must NOT be masked
 * through as the bogus normal word `from=63, to=63, promo=15`.
 */
export function unpackToMove(word: number): Move {
  if (isNull(word)) return nullMove();
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
