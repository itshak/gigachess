// src/zobrist.ts — zero-BigInt 64-bit Zobrist hashing (design D2)
// Keys are represented as { lo, hi } 32-bit pairs (no BigInt heap overhead in
// hot paths) and maintained INCREMENTALLY (O(1)) in `makeMove`.
//
// Constants are the standard Polyglot opening-book random array (781 entries;
// interop-critical fixed numeric data), stored in src/zobristBlob.ts as base64
// of little-endian u64 bytes — the same size/load rationale as the magic-table
// blobs. The blob module is NEVER in the static import graph of gigachess/core
// (bundle gate): it loads via dynamic import() behind `ensureZobristLoaded()`.
// Until loaded — or if loading fails — hashing is unavailable (positions carry
// no zobrist fields; `makeMove` skips maintenance) and callers can probe with
// `zobristTablesLoaded()`.
//
// Key layout (Polyglot book format):
//   0..767   piece-square: index = (6*color + role) * 64 + square
//            (role order pawn, knight, bishop, rook, queen, king; a1 = 0)
//   768..771 castling: white king-side, white queen-side, black king-side,
//            black queen-side (mapped from each right's rook square relative
//            to that color's king — for standard chess this is the canonical
//            Polyglot mapping; Chess960 rights fold onto the same four keys)
//   772..779 en-passant FILE a..h — hashed ONLY when an adjacent pawn of the
//            side to move exists (pseudo-legal capture), per Polyglot/Shakmaty
//   780      side to move (XORed when WHITE is to move — python-chess
//            `hash_turn` semantics, which match the Polyglot book format)
// MIT gigachess.

import { Color, Role } from "./types.js";
import type { Position } from "./types.js";
import { squareFile } from "./util.js";

export type ZobristKey = { readonly lo: number; readonly hi: number };

const N_KEYS = 781;
const IDX_CASTLING = 768;
const IDX_EP = 772;
const IDX_SIDE = 780;

let keyLo: Uint32Array | null = null;
let keyHi: Uint32Array | null = null;
let loadPromise: Promise<void> | null = null;

/**
 * splitmix64 state seed for the 12 derived Chess960 castling keys (ADR-003).
 * Published seed: 0x00C0_FFEE_DABA_D00D.
 */
export const CASTLE_KEY_SEED = 0x00C0_FFEE_DABA_D00Dn;

const MASK64 = 0xFFFF_FFFF_FFFF_FFFFn;

function splitmix64(stateRef: { state: bigint }): bigint {
  stateRef.state = (stateRef.state + 0x9E37_79B9_7F4A_7C15n) & MASK64;
  let z = stateRef.state;
  z = ((z ^ (z >> 30n)) * 0xBF58_476D_1CE4_E5B9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94D0_49BB_1331_11EBn) & MASK64;
  return (z ^ (z >> 31n)) & MASK64;
}

let castleKeyLo: Uint32Array | null = null;
let castleKeyHi: Uint32Array | null = null;

export { castleKeyLo, castleKeyHi, keyLo, keyHi, IDX_EP, IDX_SIDE };

/**
 * Loads the Polyglot key blob (idempotent). Safe to call repeatedly; the
 * returned promise resolves once the tables are available. Failures propagate
 * to awaiting callers but never become unhandled rejections.
 */
export function ensureZobristLoaded(): Promise<void> {
  if (loadPromise === null) {
    loadPromise = import("./zobristBlob.js").then((blob) => {
      const bytes = Uint8Array.from(atob(blob.POLYGLOT_KEYS_B64), (c) => c.charCodeAt(0));
      // DataView-based u64 read: endianness-portable (unlike typed-array views).
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const lo = new Uint32Array(N_KEYS);
      const hi = new Uint32Array(N_KEYS);
      for (let i = 0; i < N_KEYS; i++) {
        lo[i] = view.getUint32(i * 8, true) >>> 0;
        hi[i] = view.getUint32(i * 8 + 4, true) >>> 0;
      }
      keyLo = lo;
      keyHi = hi;

      // Initialize the 16 rook-file castling keys (ADR-003, decision D2)
      // Indexed by `colorIdx * 8 + file` (Black = 0, White = 1, file = 0..7)
      const cLo = new Uint32Array(16);
      const cHi = new Uint32Array(16);

      const stateRef = { state: CASTLE_KEY_SEED };
      const prng = new BigUint64Array(12);
      for (let i = 0; i < 12; i++) {
        prng[i] = splitmix64(stateRef);
      }

      // Black (color index 0) files b..g (1..6)
      for (let f = 1; f <= 6; f++) {
        const val = prng[f - 1];
        cLo[f] = Number(val & 0xFFFF_FFFFn) >>> 0;
        cHi[f] = Number((val >> 32n) & 0xFFFF_FFFFn) >>> 0;
      }
      // White (color index 1) files b..g (1..6) -> indices 8+f = 9..14
      for (let f = 1; f <= 6; f++) {
        const val = prng[6 + f - 1];
        cLo[8 + f] = Number(val & 0xFFFF_FFFFn) >>> 0;
        cHi[8 + f] = Number((val >> 32n) & 0xFFFF_FFFFn) >>> 0;
      }

      // Pin the a/h keys to the Polyglot castling keys:
      // White O-O (h-file) = 1*8+7 = 15 -> Polyglot 768
      // White O-O-O (a-file) = 1*8+0 = 8 -> Polyglot 769
      // Black O-O (h-file) = 0*8+7 = 7 -> Polyglot 770
      // Black O-O-O (a-file) = 0*8+0 = 0 -> Polyglot 771
      cLo[15] = lo[768]; cHi[15] = hi[768];
      cLo[8] = lo[769]; cHi[8] = hi[769];
      cLo[7] = lo[770]; cHi[7] = hi[770];
      cLo[0] = lo[771]; cHi[0] = hi[771];

      castleKeyLo = cLo;
      castleKeyHi = cHi;
    });
    // see attacks.ts: fire-and-forget callers must not trigger an
    // unhandled-rejection warning; awaiting callers still observe the error.
    loadPromise.catch(() => {});
  }
  return loadPromise;
}

/** Whether the Zobrist tables are loaded (false ⇒ hashing is skipped). */
export function zobristTablesLoaded(): boolean {
  return keyLo !== null && keyHi !== null && castleKeyLo !== null && castleKeyHi !== null;
}

export function pieceKeyIdx(color: Color, role: Role, sqIdx: number): number {
  // Polyglot layout (python-chess ZobristHasher.hash_board): piece_index =
  // 2*role + colorPivot where role order is pawn, knight, bishop, rook,
  // queen, king and the color pivot follows python-chess's occupied_co
  // indexing (WHITE=True → pivot 1, BLACK=False → pivot 0; i.e. black pawn,
  // white pawn, black knight, white knight, …), then * 64 + square (a1 = 0).
  return (2 * role + (color === Color.White ? 1 : 0)) * 64 + sqIdx;
}

/**
 * Castling key index: `(color === White ? 1 : 0) * 8 + rookFile` (ADR-003).
 */
export function castlingKeyIdx(color: Color, rookSq: number, _kingSq?: number): number {
  const colorIdx = color === Color.White ? 1 : 0;
  const file = rookSq & 7;
  return (colorIdx << 3) | file;
}

export function castleFileKey(color: Color, file: number): ZobristKey {
  if (!zobristTablesLoaded()) throw new Error("zobrist tables not loaded — call ensureZobristLoaded() first");
  const colorIdx = color === Color.White ? 1 : 0;
  const idx = (colorIdx << 3) | (file & 7);
  return { lo: (castleKeyLo as Uint32Array)[idx], hi: (castleKeyHi as Uint32Array)[idx] };
}

function xorCastleInto(lo: number, hi: number, castleIdx: number): [number, number] {
  const t = castleKeyLo as Uint32Array;
  const h = castleKeyHi as Uint32Array;
  return [(lo ^ t[castleIdx]) >>> 0, (hi ^ h[castleIdx]) >>> 0];
}

/** True when a pawn of `side` stands adjacent to the ep square (legal capture). */
export function epIsHashable(
  target: Position | import("./board.js").BoardLike | { board: import("./board.js").BoardLike },
  epSquare: number,
  side: Color,
): boolean {
  const b = "board" in target && target.board ? target.board : (target as import("./board.js").BoardLike);
  const file = epSquare & 7;
  const pawnRank = (epSquare >> 3) + (side === Color.White ? -1 : 1);
  if (pawnRank < 0 || pawnRank > 7) return false;
  const colorOcc = side === Color.White ? b.white : b.black;
  for (let df = -1; df <= 1; df += 2) {
    const f = file + df;
    if (f < 0 || f > 7) continue;
    const sqIdx = (pawnRank << 3) | f;
    const bit = sqIdx < 32 ? (1 << sqIdx) >>> 0 : (1 << (sqIdx - 32)) >>> 0;
    const occWord = sqIdx < 32 ? colorOcc.lo : colorOcc.hi;
    const pawnWord = sqIdx < 32 ? b.pawn.lo : b.pawn.hi;
    if (((occWord & pawnWord & bit) >>> 0) !== 0) return true;
  }
  return false;
}

function kingSqOf(pos: Position, color: Color): number | undefined {
  const colorOcc = color === Color.White ? pos.board.white : pos.board.black;
  const lo = (colorOcc.lo & pos.board.king.lo) >>> 0;
  const hi = (colorOcc.hi & pos.board.king.hi) >>> 0;
  if (lo !== 0) return 31 - Math.clz32((lo & -lo) >>> 0);
  if (hi !== 0) return 32 + (31 - Math.clz32((hi & -hi) >>> 0));
  return undefined;
}

function roleAt(pos: Position, sqIdx: number): Role {
  const b = pos.board;
  const bit = sqIdx < 32 ? (1 << sqIdx) >>> 0 : (1 << (sqIdx - 32)) >>> 0;
  const word = sqIdx < 32 ? b.occupied.lo : b.occupied.hi;
  if (((word & bit) >>> 0) === 0) throw new Error(`zobrist: no piece at square ${sqIdx}`);
  const pawnW = sqIdx < 32 ? b.pawn.lo : b.pawn.hi;
  if (((pawnW & bit) >>> 0) !== 0) return Role.Pawn;
  const knightW = sqIdx < 32 ? b.knight.lo : b.knight.hi;
  if (((knightW & bit) >>> 0) !== 0) return Role.Knight;
  const bishopW = sqIdx < 32 ? b.bishop.lo : b.bishop.hi;
  if (((bishopW & bit) >>> 0) !== 0) return Role.Bishop;
  const rookW = sqIdx < 32 ? b.rook.lo : b.rook.hi;
  if (((rookW & bit) >>> 0) !== 0) return Role.Rook;
  const queenW = sqIdx < 32 ? b.queen.lo : b.queen.hi;
  if (((queenW & bit) >>> 0) !== 0) return Role.Queen;
  return Role.King;
}

function xorInto(lo: number, hi: number, keyIdx: number): [number, number] {
  // tables are loaded whenever these helpers run (checked at entry points)
  const t = keyLo as Uint32Array;
  const h = keyHi as Uint32Array;
  return [(lo ^ t[keyIdx]) >>> 0, (hi ^ h[keyIdx]) >>> 0];
}

/** Computes the Zobrist key from scratch (O(pieces)). Tables must be loaded. */
export function calculateZobrist(pos: Position): ZobristKey {
  if (!zobristTablesLoaded()) throw new Error("zobrist tables not loaded — call ensureZobristLoaded() first");
  let lo = 0, hi = 0;
  const b = pos.board;
  for (let color = 0; color <= 1; color++) {
    const colorOcc = color === Color.White ? b.white : b.black;
    const roleSets = [b.pawn, b.knight, b.bishop, b.rook, b.queen, b.king];
    for (let role = 0; role < 6; role++) {
      const set = roleSets[role];
      const halves = [((colorOcc.lo & set.lo) >>> 0), ((colorOcc.hi & set.hi) >>> 0)];
      for (let half = 0; half < 2; half++) {
        let cur = halves[half];
        const offset = half === 0 ? 0 : 32;
        while (cur !== 0) {
          const lsb = (cur & -cur) >>> 0;
          const sqIdx = offset + (31 - Math.clz32(lsb));
          [lo, hi] = xorInto(lo, hi, pieceKeyIdx(color as Color, role as Role, sqIdx));
          cur ^= lsb;
        }
      }
    }
  }
  // castling rights (indexed by (color, rook file) — ADR-003 / 16 keys)
  for (let color = 0; color <= 1; color++) {
    const rights = color === Color.White ? pos.castling.white : pos.castling.black;
    if (rights.size === 0) continue;
    for (const rs of rights) {
      [lo, hi] = xorCastleInto(lo, hi, castlingKeyIdx(color as Color, rs));
    }
  }
  // en passant (only when a legal capture exists — Polyglot semantics)
  if (pos.epSquare !== null && pos.epSquare !== undefined && epIsHashable(pos, pos.epSquare, pos.turn)) {
    [lo, hi] = xorInto(lo, hi, IDX_EP + (pos.epSquare & 7));
  }
  // side to move (Polyglot/python-chess semantics: the side key is XORed
  // when WHITE is to move)
  if (pos.turn === Color.White) {
    [lo, hi] = xorInto(lo, hi, IDX_SIDE);
  }
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

/**
 * Incremental O(1) Zobrist update for a move (design D2). Given the OLD
 * position (which must either carry a zobrist key or be hashable from
 * scratch), the move details as resolved by makeMove (castling plan,
 * en-passant flag, captured piece) and the NEW position (turn / castling /
 * ep / board already updated), returns the key for the new position.
 * Tables must be loaded.
 *
 *  - `plan` non-null => castling: king to plan.kingTo, rook rookFrom -> rookTo
 *  - `isEnPassant` => the captured pawn sits behind the ep target square
 *  - `captured` non-null => ordinary capture ON the `to` square
 */
export function zobristAfterMove(
  pos: Position,
  move: { from: number; to: number; promotion?: Role | null },
  plan: { side: "king" | "queen"; kingFrom: number; kingTo: number; rookFrom: number; rookTo: number } | null,
  isEnPassant: boolean,
  captured: { color: Color; role: Role } | undefined,
  newPos: Position,
): ZobristKey {
  if (!zobristTablesLoaded()) throw new Error("zobrist tables not loaded — call ensureZobristLoaded() first");
  // base key: inherited from the old position, or computed once from scratch
  let lo: number, hi: number;
  if (pos.zobristLo !== undefined && pos.zobristHi !== undefined) {
    lo = pos.zobristLo >>> 0;
    hi = pos.zobristHi >>> 0;
  } else {
    const base = calculateZobrist(pos);
    lo = base.lo;
    hi = base.hi;
  }
  const color = pos.turn;
  const them = color === Color.White ? Color.Black : Color.White;
  // moving piece leaves `from`
  const oldRole = roleAt(pos, move.from);
  [lo, hi] = xorInto(lo, hi, pieceKeyIdx(color, oldRole, move.from));
  if (plan !== null) {
    // castling: rook relocation + king lands on the normalized square
    [lo, hi] = xorInto(lo, hi, pieceKeyIdx(color, Role.Rook, plan.rookFrom));
    [lo, hi] = xorInto(lo, hi, pieceKeyIdx(color, Role.Rook, plan.rookTo));
    [lo, hi] = xorInto(lo, hi, pieceKeyIdx(color, Role.King, plan.kingTo));
  } else if (move.promotion !== null && move.promotion !== undefined) {
    [lo, hi] = xorInto(lo, hi, pieceKeyIdx(color, move.promotion, move.to));
  } else {
    [lo, hi] = xorInto(lo, hi, pieceKeyIdx(color, oldRole, move.to));
  }
  // captured piece leaves the board
  if (isEnPassant) {
    const capSq = color === Color.White ? move.to - 8 : move.to + 8;
    [lo, hi] = xorInto(lo, hi, pieceKeyIdx(them, Role.Pawn, capSq));
  } else if (captured !== undefined && captured !== null) {
    [lo, hi] = xorInto(lo, hi, pieceKeyIdx(captured.color, captured.role, move.to));
  }
  // castling rights: fast bitmask diff for standard chess, fallback for 960
  if (!pos.isChess960 && pos.castlingMask !== undefined && newPos.castlingMask !== undefined) {
    const diff = pos.castlingMask ^ newPos.castlingMask;
    if (diff !== 0) {
      if (diff & 1) [lo, hi] = xorCastleInto(lo, hi, 15); // WK: White h-file (768)
      if (diff & 2) [lo, hi] = xorCastleInto(lo, hi, 8);  // WQ: White a-file (769)
      if (diff & 4) [lo, hi] = xorCastleInto(lo, hi, 7);  // BK: Black h-file (770)
      if (diff & 8) [lo, hi] = xorCastleInto(lo, hi, 0);  // BQ: Black a-file (771)
    }
  } else {
    for (const rs of pos.castling.white) {
      [lo, hi] = xorCastleInto(lo, hi, castlingKeyIdx(Color.White, rs));
    }
    for (const rs of pos.castling.black) {
      [lo, hi] = xorCastleInto(lo, hi, castlingKeyIdx(Color.Black, rs));
    }
    for (const rs of newPos.castling.white) {
      [lo, hi] = xorCastleInto(lo, hi, castlingKeyIdx(Color.White, rs));
    }
    for (const rs of newPos.castling.black) {
      [lo, hi] = xorCastleInto(lo, hi, castlingKeyIdx(Color.Black, rs));
    }
  }
  // en passant state (both directions, legality-filtered)
  if (pos.epSquare !== null && pos.epSquare !== undefined && epIsHashable(pos, pos.epSquare, pos.turn)) {
    [lo, hi] = xorInto(lo, hi, IDX_EP + (pos.epSquare & 7));
  }
  if (newPos.epSquare !== null && newPos.epSquare !== undefined && epIsHashable(newPos, newPos.epSquare, newPos.turn)) {
    [lo, hi] = xorInto(lo, hi, IDX_EP + (newPos.epSquare & 7));
  }
  // side to move flipped
  [lo, hi] = xorInto(lo, hi, IDX_SIDE);
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

/** 16-hex-digit rendering of a {lo,hi} key (hi first, zero-padded). */
export function zobristHex(key: ZobristKey): string {
  return (
    (key.hi >>> 0).toString(16).padStart(8, "0") +
    (key.lo >>> 0).toString(16).padStart(8, "0")
  );
}
