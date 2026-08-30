// src/attacks.ts — leaper tables + Black Magic sliding via bench/magic-tables
// MIT purechess, clean-room from specs + FIDE notes (no G P L)
// Plain fixed-shift uniform 11 default, Fancy per-square alternative compatible via same JSON schema

import * as sq from "./squareSet.js";
import type { SquareSet } from "./squareSet.js";
import { Color } from "./types.js";
import { squareFile, squareRank } from "./util.js";

// ---------- low-level 32-bit helpers for 64-bit multiply without 64-bit type ----------
function mul32To64(a: number, b: number): { lo: number; hi: number } {
  const aLow = a & 0xffff;
  const aHigh = a >>> 16;
  const bLow = b & 0xffff;
  const bHigh = b >>> 16;
  const p0 = aLow * bLow;
  const p1 = aLow * bHigh;
  const p2 = aHigh * bLow;
  const p3 = aHigh * bHigh;
  const mid = p1 + p2;
  const midLow = mid & 0xffff;
  const midHigh = mid >>> 16;
  // lo = p0 + (midLow <<16), with carry to hi
  const loAdd = (midLow << 16) >>> 0;
  const lo = (p0 + loAdd) >>> 0;
  const carry = lo < (p0 >>> 0) ? 1 : 0;
  const hi = (p3 + midHigh + carry) >>> 0;
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

function wrappingMul64(aLo: number, aHi: number, bLo: number, bHi: number): { lo: number; hi: number } {
  // low 64 bits of 64x64 -> 64
  // a = aHi*2^32 + aLo, b = bHi*2^32 + bLo
  // product = aLo*bLo + (aHi*bLo + aLo*bHi)*2^32 + aHi*bHi*2^64 (overflow beyond 64 discards)
  const pLL = mul32To64(aLo >>> 0, bLo >>> 0);
  const pHL = mul32To64(aHi >>> 0, bLo >>> 0);
  const pLH = mul32To64(aLo >>> 0, bHi >>> 0);
  // pLL.lo is final lo, pLL.hi + pHL.lo + pLH.lo is final hi (plus carry from lo addition? already inside pLL)
  // Need to add cross terms to hi with carry handling
  let hi = (pLL.hi + pHL.lo + pLH.lo) >>> 0;
  // carry from adding pHL.lo + pLH.lo overflow is wrapped via >>>0, fine for 32-bit wrapping
  // Note: pHL.hi and pLH.hi are beyond 64 bits (shift 64) so discarded
  return { lo: pLL.lo >>> 0, hi: hi >>> 0 };
}

function mul64Shift(occLo: number, occHi: number, magLo: number, magHi: number, shift: number): number {
  const prod = wrappingMul64(occLo >>> 0, occHi >>> 0, magLo >>> 0, magHi >>> 0);
  if (shift < 32) {
    // product >> shift, low 32 bits
    const res = (prod.lo >>> shift) | (prod.hi << (32 - shift));
    return res >>> 0;
  } else {
    const res = prod.hi >>> (shift - 32);
    return res >>> 0;
  }
}

// ---------- Leaper tables ----------
const KNIGHT_DELTAS: [number, number][] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_DELTAS: [number, number][] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

function makeKnightTable(): SquareSet[] {
  const t: SquareSet[] = new Array(64);
  for (let sqIdx = 0; sqIdx < 64; sqIdx++) {
    const f = squareFile(sqIdx);
    const r = squareRank(sqIdx);
    let lo = 0, hi = 0;
    for (const [df, dr] of KNIGHT_DELTAS) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        const ns = nr * 8 + nf;
        if (ns < 32) lo |= (1 << ns) >>> 0;
        else hi |= (1 << (ns - 32)) >>> 0;
      }
    }
    t[sqIdx] = { lo: lo >>> 0, hi: hi >>> 0 };
  }
  return t;
}

function makeKingTable(): SquareSet[] {
  const t: SquareSet[] = new Array(64);
  for (let sqIdx = 0; sqIdx < 64; sqIdx++) {
    const f = squareFile(sqIdx);
    const r = squareRank(sqIdx);
    let lo = 0, hi = 0;
    for (const [df, dr] of KING_DELTAS) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        const ns = nr * 8 + nf;
        if (ns < 32) lo |= (1 << ns) >>> 0;
        else hi |= (1 << (ns - 32)) >>> 0;
      }
    }
    t[sqIdx] = { lo: lo >>> 0, hi: hi >>> 0 };
  }
  return t;
}

function makePawnTable(): SquareSet[][] {
  // pawnAttacks[color][sq] -> SquareSet of squares attacked by pawn on sq
  const t: SquareSet[][] = [[], []];
  for (let c = 0; c < 2; c++) {
    const arr: SquareSet[] = new Array(64);
    for (let sqIdx = 0; sqIdx < 64; sqIdx++) {
      const f = squareFile(sqIdx);
      const r = squareRank(sqIdx);
      let lo = 0, hi = 0;
      const dir = c === Color.White ? 1 : -1;
      const nr = r + dir;
      if (nr >= 0 && nr < 8) {
        for (const df of [-1, 1]) {
          const nf = f + df;
          if (nf >= 0 && nf < 8) {
            const ns = nr * 8 + nf;
            if (ns < 32) lo |= (1 << ns) >>> 0;
            else hi |= (1 << (ns - 32)) >>> 0;
          }
        }
      }
      arr[sqIdx] = { lo: lo >>> 0, hi: hi >>> 0 };
    }
    t[c] = arr;
  }
  return t;
}

const knightTable: SquareSet[] = makeKnightTable();
const kingTable: SquareSet[] = makeKingTable();
const pawnTable: SquareSet[][] = makePawnTable();

export function knightAttacks(sqIdx: number): SquareSet {
  return knightTable[sqIdx];
}
export function kingAttacks(sqIdx: number): SquareSet {
  return kingTable[sqIdx];
}
export function pawnAttacks(color: Color, sqIdx: number): SquareSet {
  return pawnTable[color][sqIdx];
}

// ---------- Black Magic sliding ----------
import { rookMagics as rookMagicsData } from "./rookMagic.js";
import { rookAttackTable as rookAttackTableData } from "./rookMagic.js";
import { bishopMagics as bishopMagicsData } from "./bishopMagic.js";
import { bishopAttackTable as bishopAttackTableData } from "./bishopMagic.js";

type MagicEntry = {
  sq: number;
  mask: string;
  maskLo: number;
  maskHi: number;
  magic: number;
  magicLo: number;
  magicHi: number;
  magicHex: string;
  shift: number;
  offset: number;
  size: number;
};

const rookMagics: MagicEntry[] = rookMagicsData as unknown as MagicEntry[];
const bishopMagics: MagicEntry[] = bishopMagicsData as unknown as MagicEntry[];
const rookAttackTable: SquareSet[] = (rookAttackTableData as unknown as SquareSet[]).map((e) => ({ lo: e.lo >>> 0, hi: e.hi >>> 0 }));
const bishopAttackTable: SquareSet[] = (bishopAttackTableData as unknown as SquareSet[]).map((e) => ({ lo: e.lo >>> 0, hi: e.hi >>> 0 }));

export async function ensureMagicTablesLoaded(): Promise<void> {
  return;
}

// ---------- sliding attacks via magic ----------
export function bishopAttacks(sqIdx: number, occupied: SquareSet): SquareSet {
  // If tables not yet loaded, fallback to naive ray
  if (bishopMagics.length === 0 || bishopAttackTable.length === 0) return bishopAttacksNaive(sqIdx, occupied);
  const m = bishopMagics[sqIdx];
  if (!m) return bishopAttacksNaive(sqIdx, occupied);
  const mask: SquareSet = { lo: m.maskLo >>> 0, hi: m.maskHi >>> 0 };
  const occ = sq.and(occupied, mask);
  const idx = (mul64Shift(occ.lo, occ.hi, m.magicLo, m.magicHi, m.shift) + m.offset) >>> 0;
  const at = bishopAttackTable[idx];
  if (!at) return bishopAttacksNaive(sqIdx, occupied);
  return at;
}

export function rookAttacks(sqIdx: number, occupied: SquareSet): SquareSet {
  if (rookMagics.length === 0 || rookAttackTable.length === 0) return rookAttacksNaive(sqIdx, occupied);
  const m = rookMagics[sqIdx];
  if (!m) return rookAttacksNaive(sqIdx, occupied);
  const mask: SquareSet = { lo: m.maskLo >>> 0, hi: m.maskHi >>> 0 };
  const occ = sq.and(occupied, mask);
  const idx = (mul64Shift(occ.lo, occ.hi, m.magicLo, m.magicHi, m.shift) + m.offset) >>> 0;
  const at = rookAttackTable[idx];
  if (!at) return rookAttacksNaive(sqIdx, occupied);
  return at;
}

export function queenAttacks(sqIdx: number, occupied: SquareSet): SquareSet {
  return sq.or(bishopAttacks(sqIdx, occupied), rookAttacks(sqIdx, occupied));
}

// Naive fallback for correctness verification and when tables missing
function slidingNaive(sqIdx: number, occupied: SquareSet, deltas: [number, number][]): SquareSet {
  const f0 = squareFile(sqIdx);
  const r0 = squareRank(sqIdx);
  let lo = 0, hi = 0;
  for (const [df, dr] of deltas) {
    let f = f0 + df, r = r0 + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const ns = r * 8 + f;
      if (ns < 32) lo |= (1 << ns) >>> 0;
      else hi |= (1 << (ns - 32)) >>> 0;
      if (sq.has(occupied, ns)) break;
      f += df; r += dr;
    }
  }
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

const ROOK_DELTAS: [number, number][] = [[1,0],[-1,0],[0,1],[0,-1]];
const BISHOP_DELTAS: [number, number][] = [[1,1],[1,-1],[-1,1],[-1,-1]];

function bishopAttacksNaive(sqIdx: number, occ: SquareSet): SquareSet {
  return slidingNaive(sqIdx, occ, BISHOP_DELTAS);
}
function rookAttacksNaive(sqIdx: number, occ: SquareSet): SquareSet {
  return slidingNaive(sqIdx, occ, ROOK_DELTAS);
}

// Export naive for testing parity
export const _naive = { bishopAttacksNaive, rookAttacksNaive };

// ---------- ray / between ----------
function rayNaive(from: number, to: number): SquareSet {
  const ff = squareFile(from), rf = squareRank(from);
  const tf = squareFile(to), rt = squareRank(to);
  const df = tf - ff, dr = rt - rf;
  // check aligned: rank, file, diagonal
  if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return sq.empty();
  const stepF = df === 0 ? 0 : df > 0 ? 1 : -1;
  const stepR = dr === 0 ? 0 : dr > 0 ? 1 : -1;
  let lo = 0, hi = 0;
  let f = ff, r = rf;
  while (true) {
    const ns = r * 8 + f;
    if (ns < 32) lo |= (1 << ns) >>> 0;
    else hi |= (1 << (ns - 32)) >>> 0;
    if (f === tf && r === rt) break;
    f += stepF; r += stepR;
    // safety: prevent infinite if not aligned (already returned)
    if (f < 0 || f >= 8 || r < 0 || r >= 8) break;
  }
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

export function ray(from: number, to: number): SquareSet {
  return rayNaive(from, to);
}

export function between(from: number, to: number): SquareSet {
  const r = ray(from, to);
  if (sq.isEmpty(r)) return r;
  // exclusive: remove endpoints
  const a = sq.minus(r, sq.singleton(from));
  return sq.minus(a, sq.singleton(to));
}

// ---------- isAttacked / kingAttackers ----------
/**
 * All pieces of `attacker` color attacking `square`. `occ` overrides the
 * occupancy used for slider rays (hot-loop variant: king-safety masks
 * evaluate attackedness with the moving king removed from the occupancy so
 * that sliders x-raying the king stay "attacking" through its old square).
 */
export function attackersTo(
  board: import("./board.js").Board,
  square: number,
  attacker: Color,
  occ: SquareSet = board.occupied,
): SquareSet {
  const colorOcc = attacker === Color.White ? board.white : board.black;
  // pawn origins: pawnAttacks(opposite, square) mirrors the attacker pawns that hit square
  const oppPawnAtt = pawnAttacks(attacker === Color.White ? Color.Black : Color.White, square);
  const attackerPawns = attacker === Color.White ? sq.and(board.white, board.pawn) : sq.and(board.black, board.pawn);
  let attackers = sq.and(attackerPawns, oppPawnAtt);
  const nAtt = knightAttacks(square);
  const attackerKnights = attacker === Color.White ? sq.and(board.white, board.knight) : sq.and(board.black, board.knight);
  attackers = sq.or(attackers, sq.and(attackerKnights, nAtt));
  const attackerBishopsQueens = sq.or(
    attacker === Color.White ? sq.and(board.white, board.bishop) : sq.and(board.black, board.bishop),
    attacker === Color.White ? sq.and(board.white, board.queen) : sq.and(board.black, board.queen),
  );
  attackers = sq.or(attackers, sq.and(attackerBishopsQueens, bishopAttacks(square, occ)));
  const attackerRooksQueens = sq.or(
    attacker === Color.White ? sq.and(board.white, board.rook) : sq.and(board.black, board.rook),
    attacker === Color.White ? sq.and(board.white, board.queen) : sq.and(board.black, board.queen),
  );
  attackers = sq.or(attackers, sq.and(attackerRooksQueens, rookAttacks(square, occ)));
  const kAtt = kingAttacks(square);
  const attackerKings = attacker === Color.White ? sq.and(board.white, board.king) : sq.and(board.black, board.king);
  attackers = sq.or(attackers, sq.and(attackerKings, kAtt));
  return attackers;
}

export function isAttacked(board: import("./board.js").Board, square: number, attacker: Color): boolean {
  // Check if square is attacked by attacker color
  // Use board to find attacker pieces
  const occ = board.occupied;
  // pawn
  const pawnAtt = pawnAttacks(attacker === Color.White ? Color.Black : Color.White, square);
  // pawn attacks are from pawn's perspective; we invert: pawn that attacks square is one step opposite
  // pawnAttacks(color, sq) gives squares that pawn on sq attacks. So to see if square is attacked by pawn, we need pawns of attacker that have square in their attack set.
  // Equivalent to: pawns = board.pawn & board[attacker]; check if any pawn attacks square
  // So compute pawn attackers by checking pawns that attack square via pawnTable inverse
  // Simplest: iterate pawn squares
  // But we can use pawnAttacks of opposite color square to find pawn origins: pawns that attack square are those on squares that pawn of attacker would attack from opposite direction
  // Actually pawnAttacks(attacker, pawnSq) includes target squares. So pawnSq attacks square iff square in pawnAttacks(attacker, pawnSq). Equivalent to pawnSq in pawnAttacks(opposite, square)
  const oppPawnAtt = pawnAttacks(attacker === Color.White ? Color.Black : Color.White, square);
  // oppPawnAtt is squares from which opponent pawn would attack square if pawn were opposite color; but pawns attack forward, so attack set from square's perspective opposite color gives origin squares
  // Let's use direct: pawn attackers = pawns & oppPawnAtt
  const attackerPawns = attacker === Color.White ? sq.and(board.white, board.pawn) : sq.and(board.black, board.pawn);
  if (!sq.isEmpty(sq.and(attackerPawns, oppPawnAtt))) return true;

  // knight
  const nAtt = knightAttacks(square);
  const attackerKnights = attacker === Color.White ? sq.and(board.white, board.knight) : sq.and(board.black, board.knight);
  if (!sq.isEmpty(sq.and(attackerKnights, nAtt))) return true;

  // bishop / queen diagonal
  const bAtt = bishopAttacks(square, occ);
  const attackerBishopsQueens = sq.or(
    attacker === Color.White ? sq.and(board.white, board.bishop) : sq.and(board.black, board.bishop),
    attacker === Color.White ? sq.and(board.white, board.queen) : sq.and(board.black, board.queen),
  );
  if (!sq.isEmpty(sq.and(attackerBishopsQueens, bAtt))) return true;

  // rook / queen orthogonal
  const rAtt = rookAttacks(square, occ);
  const attackerRooksQueens = sq.or(
    attacker === Color.White ? sq.and(board.white, board.rook) : sq.and(board.black, board.rook),
    attacker === Color.White ? sq.and(board.white, board.queen) : sq.and(board.black, board.queen),
  );
  if (!sq.isEmpty(sq.and(attackerRooksQueens, rAtt))) return true;

  // king
  const kAtt = kingAttacks(square);
  const attackerKings = attacker === Color.White ? sq.and(board.white, board.king) : sq.and(board.black, board.king);
  if (!sq.isEmpty(sq.and(attackerKings, kAtt))) return true;

  return false;
}

export function kingAttackers(board: import("./board.js").Board, kingColor: Color): SquareSet {
  const ks = kingColor === Color.White ? sq.and(board.white, board.king) : sq.and(board.black, board.king);
  const ksq = sq.first(ks);
  if (ksq === undefined) return sq.empty();
  const attacker = kingColor === Color.White ? Color.Black : Color.White;
  // Collect all attacker pieces that attack king square
  let attackers: SquareSet = sq.empty();
  const occ = board.occupied;
  // pawns
  const oppPawnAtt = pawnAttacks(attacker === Color.White ? Color.Black : Color.White, ksq);
  const attackerPawns = attacker === Color.White ? sq.and(board.white, board.pawn) : sq.and(board.black, board.pawn);
  attackers = sq.or(attackers, sq.and(attackerPawns, oppPawnAtt));
  // knights
  const nAtt = knightAttacks(ksq);
  const attackerKnights = attacker === Color.White ? sq.and(board.white, board.knight) : sq.and(board.black, board.knight);
  attackers = sq.or(attackers, sq.and(attackerKnights, nAtt));
  // bishops/queens
  const bAtt = bishopAttacks(ksq, occ);
  const attackerBishopsQueens = sq.or(
    attacker === Color.White ? sq.and(board.white, board.bishop) : sq.and(board.black, board.bishop),
    attacker === Color.White ? sq.and(board.white, board.queen) : sq.and(board.black, board.queen),
  );
  attackers = sq.or(attackers, sq.and(attackerBishopsQueens, bAtt));
  // rooks/queens
  const rAtt = rookAttacks(ksq, occ);
  const attackerRooksQueens = sq.or(
    attacker === Color.White ? sq.and(board.white, board.rook) : sq.and(board.black, board.rook),
    attacker === Color.White ? sq.and(board.white, board.queen) : sq.and(board.black, board.queen),
  );
  attackers = sq.or(attackers, sq.and(attackerRooksQueens, rAtt));
  // king
  const kAtt = kingAttacks(ksq);
  const attackerKings = attacker === Color.White ? sq.and(board.white, board.king) : sq.and(board.black, board.king);
  attackers = sq.or(attackers, sq.and(attackerKings, kAtt));
  return attackers;
}

// For testing sliding correctness
export function rookAttacksForTest(sqIdx: number, occ: SquareSet): SquareSet {
  return rookAttacks(sqIdx, occ);
}
export function bishopAttacksForTest(sqIdx: number, occ: SquareSet): SquareSet {
  return bishopAttacks(sqIdx, occ);
}
