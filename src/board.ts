// src/board.ts — stateful high-performance Board class and bitboard operations
// Mirrors gigachess::Board in Rust (ADR-001, ADR-003).

import type { SquareSet, MutableSquareSet } from "./squareSet.js";
import * as sq from "./squareSet.js";
import { Color, Role } from "./types.js";
import type { Position, Setup, Move, CastlingRights } from "./types.js";
import { opposite } from "./util.js";
import { kingAttackers } from "./attacks.js";
import {
  zobristTablesLoaded,
  calculateZobrist,
  zobristAfterMove,
  zobristHex,
  pieceKeyIdx,
  castlingKeyIdx,
  epIsHashable,
  keyLo,
  keyHi,
  castleKeyLo,
  castleKeyHi,
  IDX_EP,
  IDX_SIDE,
} from "./zobrist.js";
import type { ZobristKey } from "./zobrist.js";
import {
  CASTLE_WK,
  CASTLE_WQ,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_CLEAR_STD,
  CASTLING_RIGHTS_TABLE,
  getCastlingMask,
  detectCastling,
} from "./castling.js";
import type { CastlingPlan } from "./castling.js";
import {
  packOf,
  unpackToMove,
  promoCodeToRole,
} from "./packedMove.js";
import { parseFen, makeFen } from "./fen.js";
import { parseSan, makeSan, parseUci, makeUci } from "./san.js";
import { legalMovesInto, forEachLegalMove, countLegalMoves, isLegal, INITIAL_FEN } from "./chess.js";

export type BoardLike = {
  readonly white: SquareSet;
  readonly black: SquareSet;
  readonly pawn: SquareSet;
  readonly knight: SquareSet;
  readonly bishop: SquareSet;
  readonly rook: SquareSet;
  readonly queen: SquareSet;
  readonly king: SquareSet;
  readonly occupied: SquareSet;
  readonly promoted: SquareSet;
  readonly kingSq?: readonly [number, number];
};

export type Undo = {
  readonly move: number;
  readonly movingRole: Role;
  readonly capturedRole: Role | -1;
  readonly capturedSq: number;
  readonly castlingPlan: CastlingPlan | null;
  readonly isEnPassant: boolean;
  readonly promoRole: Role | null;
  readonly epSquare: number | null;
  readonly castling: CastlingRights;
  readonly castlingMask?: number;
  readonly halfmoves: number;
  readonly fullmoves: number;
  readonly kingSq: readonly [number, number];
  readonly checkers: SquareSet;
  readonly zobristLo: number;
  readonly zobristHi: number;
};

export class Board implements BoardLike {
  white: MutableSquareSet;
  black: MutableSquareSet;
  pawn: MutableSquareSet;
  knight: MutableSquareSet;
  bishop: MutableSquareSet;
  rook: MutableSquareSet;
  queen: MutableSquareSet;
  king: MutableSquareSet;
  occupied: MutableSquareSet;
  promoted: MutableSquareSet;
  kingSq: [number, number];

  turn: Color;
  castling: CastlingRights;
  castlingMask?: number;
  epSquare: number | null;
  halfmoves: number;
  fullmoves: number;
  checkers: SquareSet;
  isChess960: boolean;

  _zobristLo: number;
  _zobristHi: number;

  constructor(input?: string | Position | Board | BoardLike) {
    this.white = { lo: 0, hi: 0 };
    this.black = { lo: 0, hi: 0 };
    this.pawn = { lo: 0, hi: 0 };
    this.knight = { lo: 0, hi: 0 };
    this.bishop = { lo: 0, hi: 0 };
    this.rook = { lo: 0, hi: 0 };
    this.queen = { lo: 0, hi: 0 };
    this.king = { lo: 0, hi: 0 };
    this.occupied = { lo: 0, hi: 0 };
    this.promoted = { lo: 0, hi: 0 };
    this.kingSq = [-1, -1];
    this.turn = Color.White;
    this.castling = {
      white: new Set(),
      black: new Set(),
      whiteKing: false,
      whiteQueen: false,
      blackKing: false,
      blackQueen: false,
    };
    this.castlingMask = 0;
    this.epSquare = null;
    this.halfmoves = 0;
    this.fullmoves = 1;
    this.checkers = { lo: 0, hi: 0 };
    this._zobristLo = 0;
    this._zobristHi = 0;
    this.isChess960 = false;

    if (input === undefined) {
      this.loadFen(INITIAL_FEN);
    } else if (typeof input === "string") {
      this.loadFen(input);
    } else {
      this.copyFrom(input);
    }
  }

  static startpos(): Board {
    return new Board();
  }

  static empty(): Board {
    const b = new Board();
    b.clear();
    return b;
  }

  static fromFen(fen: string): Board {
    return new Board(fen);
  }

  static fromMoves2(buffer: Uint16Array | Uint8Array, startFen: string = INITIAL_FEN, isChess960: boolean = false): Board {
    const b = new Board(startFen);
    b.isChess960 = isChess960;
    const moves = buffer instanceof Uint16Array ? buffer : new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength >> 1);
    for (let i = 0; i < moves.length; i++) {
      b.makeMove(moves[i]);
    }
    return b;
  }

  get board(): Board {
    return this;
  }

  get pos(): Position {
    return this;
  }

  toPosition(): Position {
    return {
      board: {
        white: { lo: this.white.lo >>> 0, hi: this.white.hi >>> 0 },
        black: { lo: this.black.lo >>> 0, hi: this.black.hi >>> 0 },
        pawn: { lo: this.pawn.lo >>> 0, hi: this.pawn.hi >>> 0 },
        knight: { lo: this.knight.lo >>> 0, hi: this.knight.hi >>> 0 },
        bishop: { lo: this.bishop.lo >>> 0, hi: this.bishop.hi >>> 0 },
        rook: { lo: this.rook.lo >>> 0, hi: this.rook.hi >>> 0 },
        queen: { lo: this.queen.lo >>> 0, hi: this.queen.hi >>> 0 },
        king: { lo: this.king.lo >>> 0, hi: this.king.hi >>> 0 },
        occupied: { lo: this.occupied.lo >>> 0, hi: this.occupied.hi >>> 0 },
        promoted: { lo: this.promoted.lo >>> 0, hi: this.promoted.hi >>> 0 },
        kingSq: [this.kingSq[0], this.kingSq[1]],
      },
      turn: this.turn,
      castling: this.castling,
      castlingMask: this.castlingMask,
      isChess960: this.isChess960,
      epSquare: this.epSquare,
      halfmoves: this.halfmoves,
      fullmoves: this.fullmoves,
      halfmove: this.halfmoves,
      fullmove: this.fullmoves,
      kingSq: [this.kingSq[0], this.kingSq[1]],
      checkers: { lo: this.checkers.lo >>> 0, hi: this.checkers.hi >>> 0 },
      zobristLo: this.zobristLo,
      zobristHi: this.zobristHi,
    };
  }

  get halfmove(): number {
    return this.halfmoves;
  }

  get fullmove(): number {
    return this.fullmoves;
  }

  get zobristLo(): number {
    if (this._zobristLo === 0 && this._zobristHi === 0 && zobristTablesLoaded()) {
      this.refreshZobrist();
    }
    return this._zobristLo;
  }

  get zobristHi(): number {
    if (this._zobristLo === 0 && this._zobristHi === 0 && zobristTablesLoaded()) {
      this.refreshZobrist();
    }
    return this._zobristHi;
  }

  zobrist(): ZobristKey {
    return { lo: this.zobristLo, hi: this.zobristHi };
  }

  zobristBigInt(): bigint {
    return (BigInt(this.zobristHi >>> 0) << 32n) | BigInt(this.zobristLo >>> 0);
  }

  zobristHex(): string {
    return zobristHex({ lo: this.zobristLo, hi: this.zobristHi });
  }

  inCheck(): boolean {
    return ((this.checkers.lo | this.checkers.hi) !== 0);
  }

  private refreshZobrist(): void {
    if (zobristTablesLoaded()) {
      const zk = calculateZobrist(this);
      this._zobristLo = zk.lo;
      this._zobristHi = zk.hi;
    }
  }

  clear(): this {
    this.white.lo = 0; this.white.hi = 0;
    this.black.lo = 0; this.black.hi = 0;
    this.pawn.lo = 0; this.pawn.hi = 0;
    this.knight.lo = 0; this.knight.hi = 0;
    this.bishop.lo = 0; this.bishop.hi = 0;
    this.rook.lo = 0; this.rook.hi = 0;
    this.queen.lo = 0; this.queen.hi = 0;
    this.king.lo = 0; this.king.hi = 0;
    this.occupied.lo = 0; this.occupied.hi = 0;
    this.promoted.lo = 0; this.promoted.hi = 0;
    this.kingSq[0] = -1;
    this.kingSq[1] = -1;
    this.turn = Color.White;
    this.castling = {
      white: new Set(),
      black: new Set(),
      whiteKing: false,
      whiteQueen: false,
      blackKing: false,
      blackQueen: false,
    };
    this.castlingMask = 0;
    this.epSquare = null;
    this.halfmoves = 0;
    this.fullmoves = 1;
    this.checkers = { lo: 0, hi: 0 };
    this._zobristLo = 0;
    this._zobristHi = 0;
    this.isChess960 = false;
    return this;
  }

  loadFen(fen: string): void {
    const res = parseFen(fen);
    if (!res.ok) throw new Error(`Invalid FEN: ${fen}`);
    this.copyFrom(res.value);
  }

  copyFrom(src: Position | Board | BoardLike): this {
    const b = "board" in src && (src as Position).board ? (src as Position).board : (src as BoardLike);
    this.white.lo = b.white.lo; this.white.hi = b.white.hi;
    this.black.lo = b.black.lo; this.black.hi = b.black.hi;
    this.pawn.lo = b.pawn.lo; this.pawn.hi = b.pawn.hi;
    this.knight.lo = b.knight.lo; this.knight.hi = b.knight.hi;
    this.bishop.lo = b.bishop.lo; this.bishop.hi = b.bishop.hi;
    this.rook.lo = b.rook.lo; this.rook.hi = b.rook.hi;
    this.queen.lo = b.queen.lo; this.queen.hi = b.queen.hi;
    this.king.lo = b.king.lo; this.king.hi = b.king.hi;
    this.occupied.lo = b.occupied.lo; this.occupied.hi = b.occupied.hi;
    this.promoted.lo = b.promoted.lo; this.promoted.hi = b.promoted.hi;

    const pos = src as Partial<Position>;
    this.turn = pos.turn ?? Color.White;
    this.castling = pos.castling ?? {
      white: new Set(),
      black: new Set(),
      whiteKing: false,
      whiteQueen: false,
      blackKing: false,
      blackQueen: false,
    };
    this.castlingMask = pos.castlingMask;
    this.epSquare = pos.epSquare ?? null;
    this.halfmoves = pos.halfmoves ?? pos.halfmove ?? 0;
    this.fullmoves = pos.fullmoves ?? pos.fullmove ?? 1;
    this.isChess960 = !!pos.isChess960;
    if (b.kingSq) {
      this.kingSq[0] = b.kingSq[0];
      this.kingSq[1] = b.kingSq[1];
    } else if (pos.kingSq) {
      this.kingSq[0] = pos.kingSq[0];
      this.kingSq[1] = pos.kingSq[1];
    } else {
      this.kingSq[0] = kingSquare(this, Color.White) ?? -1;
      this.kingSq[1] = kingSquare(this, Color.Black) ?? -1;
    }
    if (pos.checkers) {
      this.checkers = { lo: pos.checkers.lo, hi: pos.checkers.hi };
    } else {
      this.checkers = kingAttackers(this, this.turn);
    }
    this._zobristLo = pos.zobristLo ?? 0;
    this._zobristHi = pos.zobristHi ?? 0;
    if (this._zobristLo === 0 && this._zobristHi === 0 && zobristTablesLoaded()) {
      this.refreshZobrist();
    }
    return this;
  }

  clone(): Board {
    const nb = Board.empty();
    nb.copyFrom(this);
    return nb;
  }

  roleAt(sqIdx: number): Role | undefined {
    const bit = sqIdx < 32 ? (1 << sqIdx) >>> 0 : (1 << (sqIdx - 32)) >>> 0;
    const occ = sqIdx < 32 ? this.occupied.lo : this.occupied.hi;
    if (((occ & bit) >>> 0) === 0) return undefined;
    const pawnW = sqIdx < 32 ? this.pawn.lo : this.pawn.hi;
    if (((pawnW & bit) >>> 0) !== 0) return Role.Pawn;
    const knightW = sqIdx < 32 ? this.knight.lo : this.knight.hi;
    if (((knightW & bit) >>> 0) !== 0) return Role.Knight;
    const bishopW = sqIdx < 32 ? this.bishop.lo : this.bishop.hi;
    if (((bishopW & bit) >>> 0) !== 0) return Role.Bishop;
    const rookW = sqIdx < 32 ? this.rook.lo : this.rook.hi;
    if (((rookW & bit) >>> 0) !== 0) return Role.Rook;
    const queenW = sqIdx < 32 ? this.queen.lo : this.queen.hi;
    if (((queenW & bit) >>> 0) !== 0) return Role.Queen;
    return Role.King;
  }

  colorAt(sqIdx: number): Color | undefined {
    const bit = sqIdx < 32 ? (1 << sqIdx) >>> 0 : (1 << (sqIdx - 32)) >>> 0;
    const occ = sqIdx < 32 ? this.occupied.lo : this.occupied.hi;
    if (((occ & bit) >>> 0) === 0) return undefined;
    const whiteW = sqIdx < 32 ? this.white.lo : this.white.hi;
    return ((whiteW & bit) >>> 0) !== 0 ? Color.White : Color.Black;
  }

  pieceAt(sqIdx: number): { color: Color; role: Role } | undefined {
    const role = this.roleAt(sqIdx);
    if (role === undefined) return undefined;
    const color = this.colorAt(sqIdx)!;
    return { color, role };
  }

  hasPiece(sqIdx: number): boolean {
    const bit = sqIdx < 32 ? (1 << sqIdx) >>> 0 : (1 << (sqIdx - 32)) >>> 0;
    const occ = sqIdx < 32 ? this.occupied.lo : this.occupied.hi;
    return ((occ & bit) >>> 0) !== 0;
  }

  kingSquare(color: Color): number | undefined {
    const k = this.kingSq[color];
    if (k >= 0) return k;
    const ks = color === Color.White ? sq.and(this.white, this.king) : sq.and(this.black, this.king);
    return sq.first(ks);
  }

  private _clearSquare(sqIdx: number): void {
    if (sqIdx < 32) {
      const inv = ~(1 << sqIdx);
      this.white.lo &= inv; this.black.lo &= inv; this.pawn.lo &= inv; this.knight.lo &= inv;
      this.bishop.lo &= inv; this.rook.lo &= inv; this.queen.lo &= inv; this.king.lo &= inv;
      this.occupied.lo &= inv; this.promoted.lo &= inv;
    } else {
      const inv = ~(1 << (sqIdx - 32));
      this.white.hi &= inv; this.black.hi &= inv; this.pawn.hi &= inv; this.knight.hi &= inv;
      this.bishop.hi &= inv; this.rook.hi &= inv; this.queen.hi &= inv; this.king.hi &= inv;
      this.occupied.hi &= inv; this.promoted.hi &= inv;
    }
  }

  private _putPiece(sqIdx: number, color: Color, role: Role): void {
    if (sqIdx < 32) {
      const bit = (1 << sqIdx) >>> 0;
      if (color === Color.White) this.white.lo |= bit;
      else this.black.lo |= bit;
      switch (role) {
        case Role.Pawn: this.pawn.lo |= bit; break;
        case Role.Knight: this.knight.lo |= bit; break;
        case Role.Bishop: this.bishop.lo |= bit; break;
        case Role.Rook: this.rook.lo |= bit; break;
        case Role.Queen: this.queen.lo |= bit; break;
        case Role.King: this.king.lo |= bit; break;
      }
      this.occupied.lo |= bit;
    } else {
      const bit = (1 << (sqIdx - 32)) >>> 0;
      if (color === Color.White) this.white.hi |= bit;
      else this.black.hi |= bit;
      switch (role) {
        case Role.Pawn: this.pawn.hi |= bit; break;
        case Role.Knight: this.knight.hi |= bit; break;
        case Role.Bishop: this.bishop.hi |= bit; break;
        case Role.Rook: this.rook.hi |= bit; break;
        case Role.Queen: this.queen.hi |= bit; break;
        case Role.King: this.king.hi |= bit; break;
      }
      this.occupied.hi |= bit;
    }
    if (role === Role.King) {
      this.kingSq[color] = sqIdx;
    }
  }

  makeMove(moveWord: number | Move): Undo {
    const word = typeof moveWord === "number" ? moveWord : packOf(moveWord);
    const from = word & 0x3f;
    const to = (word >> 6) & 0x3f;
    const promoCode = (word >> 12) & 0x0f;
    const promoRole = promoCodeToRole(promoCode) ?? null;

    const movingRole = this.roleAt(from);
    if (movingRole === undefined) {
      throw new Error(`no piece at from square ${from}`);
    }

    const us = this.turn;
    const them = opposite(us);

    const prevCheckers = this.checkers;
    const prevZobristLo = this._zobristLo;
    const prevZobristHi = this._zobristHi;
    const prevCastling = this.castling;
    const prevCastlingMask = this.castlingMask;
    const prevEpSquare = this.epSquare;
    const prevHalfmoves = this.halfmoves;
    const prevFullmoves = this.fullmoves;
    const prevKingSq: [number, number] = [this.kingSq[0], this.kingSq[1]];
    const prevEpHashable = prevEpSquare !== null && zobristTablesLoaded() && epIsHashable(this, prevEpSquare, us);

    let plan: CastlingPlan | null = null;
    if (movingRole === Role.King) {
      plan = detectCastling(this, from, to);
    }
    const isCastling = plan !== null;

    let isEnPassant = false;
    if (
      movingRole === Role.Pawn &&
      this.epSquare !== null &&
      to === this.epSquare &&
      (from & 7) !== (to & 7)
    ) {
      isEnPassant = true;
    }

    let capturedRole: Role | -1 = -1;
    let capturedSq = -1;
    if (isEnPassant) {
      capturedRole = Role.Pawn;
      capturedSq = us === Color.White ? to - 8 : to + 8;
    } else if (!isCastling) {
      const capRole = this.roleAt(to);
      if (capRole !== undefined) {
        capturedRole = capRole;
        capturedSq = to;
      }
    }

    this._clearSquare(from);
    if (capturedSq >= 0) {
      this._clearSquare(capturedSq);
    }

    if (isCastling && plan !== null) {
      this._clearSquare(plan.rookFrom);
      this._putPiece(plan.rookTo, us, Role.Rook);
      this._putPiece(plan.kingTo, us, Role.King);
      this.kingSq[us] = plan.kingTo;
    } else {
      const finalRole = promoRole ?? movingRole;
      this._putPiece(to, us, finalRole);
      if (movingRole === Role.King) {
        this.kingSq[us] = to;
      }
    }

    let newCastling: CastlingRights;
    let newMask: number | undefined;
    if (!this.isChess960) {
      const mask = this.castlingMask ?? getCastlingMask(this);
      newMask = (mask & CASTLE_CLEAR_STD[from] & CASTLE_CLEAR_STD[to]) >>> 0;
      newCastling = CASTLING_RIGHTS_TABLE[newMask];
    } else {
      let newWhite: ReadonlySet<number> = this.castling.white;
      let newBlack: ReadonlySet<number> = this.castling.black;
      if (movingRole === Role.King) {
        if (us === Color.White) {
          if (newWhite.size > 0) newWhite = new Set<number>();
        } else {
          if (newBlack.size > 0) newBlack = new Set<number>();
        }
      }
      if (movingRole === Role.Rook) {
        if (us === Color.White && newWhite.has(from)) {
          const next = new Set(newWhite); next.delete(from); newWhite = next;
        } else if (us === Color.Black && newBlack.has(from)) {
          const next = new Set(newBlack); next.delete(from); newBlack = next;
        }
      }
      if (capturedRole === Role.Rook && capturedSq >= 0) {
        if (them === Color.White && newWhite.has(capturedSq)) {
          const next = new Set(newWhite); next.delete(capturedSq); newWhite = next;
        } else if (them === Color.Black && newBlack.has(capturedSq)) {
          const next = new Set(newBlack); next.delete(capturedSq); newBlack = next;
        }
      }
      newCastling = {
        white: newWhite,
        black: newBlack,
        whiteKing: newWhite.has(7),
        whiteQueen: newWhite.has(0),
        blackKing: newBlack.has(63),
        blackQueen: newBlack.has(56),
      };
    }
    this.castling = newCastling;
    this.castlingMask = newMask;

    let newEp: number | null = null;
    if (movingRole === Role.Pawn && Math.abs((to >> 3) - (from >> 3)) === 2) {
      const epRank = us === Color.White ? (from >> 3) + 1 : (from >> 3) - 1;
      newEp = (epRank << 3) | (from & 7);
    }
    this.epSquare = newEp;

    const isCapture = capturedSq >= 0;
    const isPawnMove = movingRole === Role.Pawn;
    this.halfmoves = isCapture || isPawnMove ? 0 : prevHalfmoves + 1;
    this.fullmoves = us === Color.Black ? prevFullmoves + 1 : prevFullmoves;
    this.turn = them;
    this.checkers = kingAttackers(this, them);

    if (zobristTablesLoaded() && keyLo && keyHi && castleKeyLo && castleKeyHi) {
      if (this._zobristLo === 0 && this._zobristHi === 0) {
        this.refreshZobrist();
      }
      let zLo = this._zobristLo;
      let zHi = this._zobristHi;

      // 1. Moving piece leaves from
      const kFrom = pieceKeyIdx(us, movingRole, from);
      zLo = (zLo ^ keyLo[kFrom]) >>> 0;
      zHi = (zHi ^ keyHi[kFrom]) >>> 0;

      // 2. Moving piece lands on to (or castling / promo)
      if (plan !== null) {
        const kRookFrom = pieceKeyIdx(us, Role.Rook, plan.rookFrom);
        const kRookTo = pieceKeyIdx(us, Role.Rook, plan.rookTo);
        const kKingTo = pieceKeyIdx(us, Role.King, plan.kingTo);
        zLo = (zLo ^ keyLo[kRookFrom] ^ keyLo[kRookTo] ^ keyLo[kKingTo]) >>> 0;
        zHi = (zHi ^ keyHi[kRookFrom] ^ keyHi[kRookTo] ^ keyHi[kKingTo]) >>> 0;
      } else if (promoRole !== null) {
        const kPromo = pieceKeyIdx(us, promoRole, to);
        zLo = (zLo ^ keyLo[kPromo]) >>> 0;
        zHi = (zHi ^ keyHi[kPromo]) >>> 0;
      } else {
        const kTo = pieceKeyIdx(us, movingRole, to);
        zLo = (zLo ^ keyLo[kTo]) >>> 0;
        zHi = (zHi ^ keyHi[kTo]) >>> 0;
      }

      // 3. Captured piece leaves board
      if (isEnPassant) {
        const capSq = us === Color.White ? to - 8 : to + 8;
        const kCap = pieceKeyIdx(them, Role.Pawn, capSq);
        zLo = (zLo ^ keyLo[kCap]) >>> 0;
        zHi = (zHi ^ keyHi[kCap]) >>> 0;
      } else if (capturedRole !== -1) {
        const kCap = pieceKeyIdx(them, capturedRole, to);
        zLo = (zLo ^ keyLo[kCap]) >>> 0;
        zHi = (zHi ^ keyHi[kCap]) >>> 0;
      }

      // 4. Castling rights diff
      if (!this.isChess960) {
        const diff = (prevCastlingMask ?? 0) ^ (newMask ?? 0);
        if (diff !== 0) {
          if (diff & 1) { zLo = (zLo ^ castleKeyLo[15]) >>> 0; zHi = (zHi ^ castleKeyHi[15]) >>> 0; }
          if (diff & 2) { zLo = (zLo ^ castleKeyLo[8]) >>> 0;  zHi = (zHi ^ castleKeyHi[8]) >>> 0; }
          if (diff & 4) { zLo = (zLo ^ castleKeyLo[7]) >>> 0;  zHi = (zHi ^ castleKeyHi[7]) >>> 0; }
          if (diff & 8) { zLo = (zLo ^ castleKeyLo[0]) >>> 0;  zHi = (zHi ^ castleKeyHi[0]) >>> 0; }
        }
      } else {
        for (const rs of prevCastling.white) {
          const idx = castlingKeyIdx(Color.White, rs);
          zLo = (zLo ^ castleKeyLo[idx]) >>> 0; zHi = (zHi ^ castleKeyHi[idx]) >>> 0;
        }
        for (const rs of prevCastling.black) {
          const idx = castlingKeyIdx(Color.Black, rs);
          zLo = (zLo ^ castleKeyLo[idx]) >>> 0; zHi = (zHi ^ castleKeyHi[idx]) >>> 0;
        }
        for (const rs of newCastling.white) {
          const idx = castlingKeyIdx(Color.White, rs);
          zLo = (zLo ^ castleKeyLo[idx]) >>> 0; zHi = (zHi ^ castleKeyHi[idx]) >>> 0;
        }
        for (const rs of newCastling.black) {
          const idx = castlingKeyIdx(Color.Black, rs);
          zLo = (zLo ^ castleKeyLo[idx]) >>> 0; zHi = (zHi ^ castleKeyHi[idx]) >>> 0;
        }
      }

      // 5. En passant square diff
      if (prevEpHashable) {
        const kEp = IDX_EP + (prevEpSquare & 7);
        zLo = (zLo ^ keyLo[kEp]) >>> 0; zHi = (zHi ^ keyHi[kEp]) >>> 0;
      }
      if (newEp !== null && epIsHashable(this, newEp, them)) {
        const kEp = IDX_EP + (newEp & 7);
        zLo = (zLo ^ keyLo[kEp]) >>> 0; zHi = (zHi ^ keyHi[kEp]) >>> 0;
      }

      // 6. Turn flip
      zLo = (zLo ^ keyLo[IDX_SIDE]) >>> 0;
      zHi = (zHi ^ keyHi[IDX_SIDE]) >>> 0;

      this._zobristLo = zLo;
      this._zobristHi = zHi;
    }

    return {
      move: word,
      movingRole,
      capturedRole,
      capturedSq,
      castlingPlan: plan,
      isEnPassant,
      promoRole,
      epSquare: prevEpSquare,
      castling: prevCastling,
      castlingMask: prevCastlingMask,
      halfmoves: prevHalfmoves,
      fullmoves: prevFullmoves,
      kingSq: prevKingSq,
      checkers: prevCheckers,
      zobristLo: prevZobristLo,
      zobristHi: prevZobristHi,
    };
  }

  unmakeMove(undo: Undo): void {
    const from = undo.move & 0x3f;
    const to = (undo.move >> 6) & 0x3f;
    const us = opposite(this.turn);

    this.turn = us;
    this.halfmoves = undo.halfmoves;
    this.fullmoves = undo.fullmoves;
    this.epSquare = undo.epSquare;
    this.castling = undo.castling;
    this.castlingMask = undo.castlingMask;
    this.kingSq[0] = undo.kingSq[0];
    this.kingSq[1] = undo.kingSq[1];
    this.checkers = undo.checkers;
    this._zobristLo = undo.zobristLo;
    this._zobristHi = undo.zobristHi;

    if (undo.castlingPlan !== null) {
      const plan = undo.castlingPlan;
      this._clearSquare(plan.kingTo);
      this._clearSquare(plan.rookTo);
      this._putPiece(plan.kingFrom, us, Role.King);
      this._putPiece(plan.rookFrom, us, Role.Rook);
    } else {
      this._clearSquare(to);
      this._putPiece(from, us, undo.movingRole);
      if (undo.capturedSq >= 0 && undo.capturedRole >= 0) {
        const them = opposite(us);
        this._putPiece(undo.capturedSq, them, undo.capturedRole as Role);
      }
    }
  }

  legalMoves(outBuffer?: Uint16Array): Uint16Array {
    const buf = outBuffer ?? new Uint16Array(256);
    const count = legalMovesInto(this, buf);
    return buf.subarray(0, count);
  }

  forEachLegalMove(fn: (moveWord: number) => void): void {
    forEachLegalMove(this, (from, to, promo) => {
      fn(((from & 0x3f) | ((to & 0x3f) << 6) | ((promo & 0x0f) << 12)) >>> 0);
    });
  }

  toSan(moveWord: number): string {
    const move = unpackToMove(moveWord);
    return makeSan(move, this);
  }

  toUci(moveWord: number): string {
    const move = unpackToMove(moveWord);
    return makeUci(move);
  }

  toFen(): string {
    return makeFen(this);
  }

  parseSan(san: string): number | null {
    const res = parseSan(san, this);
    return res.ok ? packOf(res.value) : null;
  }

  parseUci(uci: string): number | null {
    const res = parseUci(uci);
    return res.ok && isLegal(this, res.value) ? packOf(res.value) : null;
  }

  perft(depth: number): number {
    if (depth <= 0) return 1;
    if (depth === 1) return countLegalMoves(this);
    const buf = new Uint16Array(256);
    const count = legalMovesInto(this, buf);
    let nodes = 0;
    for (let i = 0; i < count; i++) {
      const undo = this.makeMove(buf[i]);
      nodes += this.perft(depth - 1);
      this.unmakeMove(undo);
    }
    return nodes;
  }
}

export type WritableBoard = {
  white: sq.MutableSquareSet;
  black: sq.MutableSquareSet;
  pawn: sq.MutableSquareSet;
  knight: sq.MutableSquareSet;
  bishop: sq.MutableSquareSet;
  rook: sq.MutableSquareSet;
  queen: sq.MutableSquareSet;
  king: sq.MutableSquareSet;
  occupied: sq.MutableSquareSet;
  promoted: sq.MutableSquareSet;
  kingSq: [number, number];
};

export function emptyBoard(): BoardLike {
  const e = sq.empty();
  return {
    white: e,
    black: e,
    pawn: e,
    knight: e,
    bishop: e,
    rook: e,
    queen: e,
    king: e,
    occupied: e,
    promoted: e,
    kingSq: [-1, -1],
  };
}

export function cloneBoard(board: BoardLike): BoardLike {
  return {
    white: { lo: board.white.lo >>> 0, hi: board.white.hi >>> 0 },
    black: { lo: board.black.lo >>> 0, hi: board.black.hi >>> 0 },
    pawn: { lo: board.pawn.lo >>> 0, hi: board.pawn.hi >>> 0 },
    knight: { lo: board.knight.lo >>> 0, hi: board.knight.hi >>> 0 },
    bishop: { lo: board.bishop.lo >>> 0, hi: board.bishop.hi >>> 0 },
    rook: { lo: board.rook.lo >>> 0, hi: board.rook.hi >>> 0 },
    queen: { lo: board.queen.lo >>> 0, hi: board.queen.hi >>> 0 },
    king: { lo: board.king.lo >>> 0, hi: board.king.hi >>> 0 },
    occupied: { lo: board.occupied.lo >>> 0, hi: board.occupied.hi >>> 0 },
    promoted: { lo: board.promoted.lo >>> 0, hi: board.promoted.hi >>> 0 },
    kingSq: board.kingSq ? [board.kingSq[0], board.kingSq[1]] : [-1, -1],
  };
}

export function newScratchBoard(): WritableBoard {
  return {
    white: { lo: 0, hi: 0 },
    black: { lo: 0, hi: 0 },
    pawn: { lo: 0, hi: 0 },
    knight: { lo: 0, hi: 0 },
    bishop: { lo: 0, hi: 0 },
    rook: { lo: 0, hi: 0 },
    queen: { lo: 0, hi: 0 },
    king: { lo: 0, hi: 0 },
    occupied: { lo: 0, hi: 0 },
    promoted: { lo: 0, hi: 0 },
    kingSq: [-1, -1],
  };
}

export function cloneAsWritable(board: BoardLike): WritableBoard {
  return {
    white: { lo: board.white.lo >>> 0, hi: board.white.hi >>> 0 },
    black: { lo: board.black.lo >>> 0, hi: board.black.hi >>> 0 },
    pawn: { lo: board.pawn.lo >>> 0, hi: board.pawn.hi >>> 0 },
    knight: { lo: board.knight.lo >>> 0, hi: board.knight.hi >>> 0 },
    bishop: { lo: board.bishop.lo >>> 0, hi: board.bishop.hi >>> 0 },
    rook: { lo: board.rook.lo >>> 0, hi: board.rook.hi >>> 0 },
    queen: { lo: board.queen.lo >>> 0, hi: board.queen.hi >>> 0 },
    king: { lo: board.king.lo >>> 0, hi: board.king.hi >>> 0 },
    occupied: { lo: board.occupied.lo >>> 0, hi: board.occupied.hi >>> 0 },
    promoted: { lo: board.promoted.lo >>> 0, hi: board.promoted.hi >>> 0 },
    kingSq: board.kingSq ? [board.kingSq[0], board.kingSq[1]] : [-1, -1],
  };
}

export function copyBoardInto(dst: WritableBoard, src: BoardLike): void {
  dst.white.lo = src.white.lo; dst.white.hi = src.white.hi;
  dst.black.lo = src.black.lo; dst.black.hi = src.black.hi;
  dst.pawn.lo = src.pawn.lo; dst.pawn.hi = src.pawn.hi;
  dst.knight.lo = src.knight.lo; dst.knight.hi = src.knight.hi;
  dst.bishop.lo = src.bishop.lo; dst.bishop.hi = src.bishop.hi;
  dst.rook.lo = src.rook.lo; dst.rook.hi = src.rook.hi;
  dst.queen.lo = src.queen.lo; dst.queen.hi = src.queen.hi;
  dst.king.lo = src.king.lo; dst.king.hi = src.king.hi;
  dst.occupied.lo = src.occupied.lo; dst.occupied.hi = src.occupied.hi;
  dst.promoted.lo = src.promoted.lo; dst.promoted.hi = src.promoted.hi;
  if (src.kingSq) {
    dst.kingSq[0] = src.kingSq[0];
    dst.kingSq[1] = src.kingSq[1];
  }
}

export function clearSquareInPlace(b: WritableBoard, sqIdx: number): void {
  if (sqIdx < 32) {
    const inv = ~(1 << sqIdx);
    b.white.lo &= inv; b.black.lo &= inv; b.pawn.lo &= inv; b.knight.lo &= inv;
    b.bishop.lo &= inv; b.rook.lo &= inv; b.queen.lo &= inv; b.king.lo &= inv;
    b.occupied.lo &= inv; b.promoted.lo &= inv;
  } else {
    const inv = ~(1 << (sqIdx - 32));
    b.white.hi &= inv; b.black.hi &= inv; b.pawn.hi &= inv; b.knight.hi &= inv;
    b.bishop.hi &= inv; b.rook.hi &= inv; b.queen.hi &= inv; b.king.hi &= inv;
    b.occupied.hi &= inv; b.promoted.hi &= inv;
  }
  if (b.kingSq) {
    if (b.kingSq[0] === sqIdx) b.kingSq[0] = -1;
    else if (b.kingSq[1] === sqIdx) b.kingSq[1] = -1;
  }
}

export function putPieceInPlace(b: WritableBoard, sqIdx: number, piece: { color: Color; role: Role }): void {
  if (sqIdx < 32) {
    const bit = (1 << sqIdx) >>> 0;
    if (piece.color === Color.White) b.white.lo |= bit;
    else b.black.lo |= bit;
    switch (piece.role) {
      case Role.Pawn: b.pawn.lo |= bit; break;
      case Role.Knight: b.knight.lo |= bit; break;
      case Role.Bishop: b.bishop.lo |= bit; break;
      case Role.Rook: b.rook.lo |= bit; break;
      case Role.Queen: b.queen.lo |= bit; break;
      case Role.King: b.king.lo |= bit; break;
    }
    b.occupied.lo |= bit;
  } else {
    const bit = (1 << (sqIdx - 32)) >>> 0;
    if (piece.color === Color.White) b.white.hi |= bit;
    else b.black.hi |= bit;
    switch (piece.role) {
      case Role.Pawn: b.pawn.hi |= bit; break;
      case Role.Knight: b.knight.hi |= bit; break;
      case Role.Bishop: b.bishop.hi |= bit; break;
      case Role.Rook: b.rook.hi |= bit; break;
      case Role.Queen: b.queen.hi |= bit; break;
      case Role.King: b.king.hi |= bit; break;
    }
    b.occupied.hi |= bit;
  }
  if (piece.role === Role.King && b.kingSq) {
    b.kingSq[piece.color] = sqIdx;
  }
}

export function setPiece(board: BoardLike, sqIdx: number, piece: { color: Color; role: Role }): Board {
  const nb = new Board(board);
  putPieceInPlace(nb, sqIdx, piece);
  return nb;
}

export function removePiece(board: BoardLike, sqIdx: number): Board {
  const nb = new Board(board);
  clearSquareInPlace(nb, sqIdx);
  return nb;
}

export function pieceAt(board: BoardLike, sqIdx: number): { color: Color; role: Role } | undefined {
  const bit = sq.singleton(sqIdx);
  if (sq.isEmpty(sq.and(board.occupied, bit))) return undefined;
  const color = sq.has(board.white, sqIdx) ? Color.White : Color.Black;
  let role: Role | undefined;
  if (sq.has(board.pawn, sqIdx)) role = Role.Pawn;
  else if (sq.has(board.knight, sqIdx)) role = Role.Knight;
  else if (sq.has(board.bishop, sqIdx)) role = Role.Bishop;
  else if (sq.has(board.rook, sqIdx)) role = Role.Rook;
  else if (sq.has(board.queen, sqIdx)) role = Role.Queen;
  else if (sq.has(board.king, sqIdx)) role = Role.King;
  if (role === undefined) return undefined;
  return { color, role };
}

export function hasPiece(board: BoardLike, sqIdx: number): boolean {
  return sq.has(board.occupied, sqIdx);
}

export function kingSquare(board: BoardLike, color: Color): number | undefined {
  if (board.kingSq !== undefined) {
    const k = board.kingSq[color];
    if (k >= 0) return k;
  }
  const ks = color === Color.White ? sq.and(board.white, board.king) : sq.and(board.black, board.king);
  return sq.first(ks);
}

export function occupiedEqualsWhiteBlack(board: BoardLike): boolean {
  return sq.equals(board.occupied, sq.or(board.white, board.black));
}

export function rolePartitionEqualsOccupied(board: BoardLike): boolean {
  const roles = sq.or(
    sq.or(sq.or(board.pawn, board.knight), sq.or(board.bishop, board.rook)),
    sq.or(board.queen, board.king),
  );
  return sq.equals(roles, board.occupied);
}

export function boardEquals(a: BoardLike, b: BoardLike): boolean {
  return (
    sq.equals(a.white, b.white) &&
    sq.equals(a.black, b.black) &&
    sq.equals(a.pawn, b.pawn) &&
    sq.equals(a.knight, b.knight) &&
    sq.equals(a.bishop, b.bishop) &&
    sq.equals(a.rook, b.rook) &&
    sq.equals(a.queen, b.queen) &&
    sq.equals(a.king, b.king) &&
    sq.equals(a.occupied, b.occupied) &&
    sq.equals(a.promoted, b.promoted)
  );
}
