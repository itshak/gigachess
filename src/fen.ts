// src/fen.ts — parseFen / makeFen with six-field validation per purechess-rules
// Clean-room from spec tables + FIDE notes, no G P L, no english hard-coded strings beyond codes

import type { BoardLike } from "./board.js";
import * as board from "./board.js";
import * as sq from "./squareSet.js";
import { Color, Role, Err, Ok } from "./types.js";
import type { Setup, CastlingRights, FenError, Result } from "./types.js";
import { squareFile, squareRank, parseSquare, squareName } from "./util.js";
import * as attacks from "./attacks.js";
import { zobristTablesLoaded, calculateZobrist } from "./zobrist.js";
import {
  CASTLE_WK,
  CASTLE_WQ,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLING_RIGHTS_TABLE,
  CASTLING_FEN_STR,
} from "./castling.js";

// helpers to create CastlingRights
function makeCastling(whiteSet: Set<number>, blackSet: Set<number>): CastlingRights {
  const whiteKing = whiteSet.has(7);
  const whiteQueen = whiteSet.has(0);
  const blackKing = blackSet.has(63);
  const blackQueen = blackSet.has(56);
  let isStd = true;
  for (const s of whiteSet) {
    if (s !== 7 && s !== 0) { isStd = false; break; }
  }
  if (isStd) {
    for (const s of blackSet) {
      if (s !== 63 && s !== 56) { isStd = false; break; }
    }
  }
  if (isStd) {
    const mask = (whiteKing ? CASTLE_WK : 0) |
                 (whiteQueen ? CASTLE_WQ : 0) |
                 (blackKing ? CASTLE_BK : 0) |
                 (blackQueen ? CASTLE_BQ : 0);
    return CASTLING_RIGHTS_TABLE[mask];
  }
  return {
    white: new Set(whiteSet),
    black: new Set(blackSet),
    whiteKing,
    whiteQueen,
    blackKing,
    blackQueen,
  };
}

function roleFromChar(ch: string): { role: Role; color: Color } | undefined {
  const lower = ch.toLowerCase();
  let role: Role | undefined;
  if (lower === "p") role = Role.Pawn;
  else if (lower === "n") role = Role.Knight;
  else if (lower === "b") role = Role.Bishop;
  else if (lower === "r") role = Role.Rook;
  else if (lower === "q") role = Role.Queen;
  else if (lower === "k") role = Role.King;
  else return undefined;
  const color = ch === lower ? Color.Black : Color.White;
  return { role: role!, color };
}

function charFromPiece(color: Color, role: Role): string {
  let ch: string;
  switch (role) {
    case Role.Pawn: ch = "p"; break;
    case Role.Knight: ch = "n"; break;
    case Role.Bishop: ch = "b"; break;
    case Role.Rook: ch = "r"; break;
    case Role.Queen: ch = "q"; break;
    case Role.King: ch = "k"; break;
    default: ch = "?";
  }
  return color === Color.White ? ch.toUpperCase() : ch;
}

/** Whitespace predicate for the single-pass FEN scanner (space, \t, \n, \v, \f, \r). */
function isFenSpace(c: number): boolean {
  return c === 32 || (c >= 9 && c <= 13);
}

/** Digits-only integer parse over fen[s..e); NaN when empty or non-digit. */
function parseFenCount(fen: string, s: number, e: number): number {
  if (s >= e) return NaN;
  let v = 0;
  for (let k = s; k < e; k++) {
    const c = fen.charCodeAt(k);
    if (c < 48 || c > 57) return NaN;
    v = v * 10 + (c - 48);
  }
  return v;
}

export function parseFen(fen: string, opts?: { chess960?: boolean, strict?: boolean }): Result<Setup, FenError> {
  // ----- single-pass field tokenization (zero regex, zero split arrays) -----
  // Fields are whitespace-separated; 1..6 fields are accepted (missing fields
  // default to w/-/-/0/1; more than 6 is rejected) — baseline-compatible
  // field tolerance required for parse-agreement parity on corpora like
  // wac_150.epd whose FENs carry only four fields.
  const n = fen.length;
  const fs: number[] = [];
  const fe: number[] = [];
  {
    let pos = 0;
    for (;;) {
      while (pos < n && isFenSpace(fen.charCodeAt(pos))) pos++;
      if (pos >= n) break;
      const s = pos;
      while (pos < n && !isFenSpace(fen.charCodeAt(pos))) pos++;
      fs.push(s);
      fe.push(pos);
    }
  }
  const fieldCount = fs.length;
  if (fieldCount < 1 || fieldCount > 6) {
    return Err({ code: "fen/invalidFen" });
  }

  // ----- piece placement -----
  // Single-pass build into a locally-owned scratch board (FP policy:
  // clone→mutate-clone) — ONE final immutable copy instead of the old
  // per-piece `setPiece`. The scanner walks the raw string with charCodeAt:
  // '/' drops a rank, '1'..'8' skips empty squares, anything else must be a
  // piece letter (color = uppercase ⇒ white).
  // Build locally owned words, then materialize the public board once.
  let scratch: board.WritableBoard;
  {
  let wl=0,wh=0,bl=0,bh=0,pl=0,ph=0,nl=0,nh=0,il=0,ih=0,rl=0,rh=0,ql=0,qh=0,kl=0,kh=0;
  let wk=-1,bk=-1,r=7,file=0;
  for(let k=fs[0];k<fe[0];k++){
    const c=fen.charCodeAt(k);
    if(c===47){
      if(file!==8||r===0)return Err({code:"fen/invalidPiecePlacement"});
      r--;file=0;continue;
    }
    if(c>=49&&c<=56){
      file+=c-48;if(file>8)return Err({code:"fen/invalidPiecePlacement"});continue;
    }
    if(file>=8)return Err({code:"fen/invalidPiecePlacement"});
    const index=r*8+file, bit=1<<(index&31), high=index>=32, white=c<97;
    if(high){
      switch(c|32){
        case 112: ph|=bit;break; case 110: nh|=bit;break;
        case 98: ih|=bit;break; case 114: rh|=bit;break;
        case 113: qh|=bit;break; case 107: kh|=bit;if(white)wk=index;else bk=index;break;
        default:return Err({code:"fen/invalidPiecePlacement"});
      }
      if(white)wh|=bit;else bh|=bit;
    }else{
      switch(c|32){
        case 112: pl|=bit;break; case 110: nl|=bit;break;
        case 98: il|=bit;break; case 114: rl|=bit;break;
        case 113: ql|=bit;break; case 107: kl|=bit;if(white)wk=index;else bk=index;break;
        default:return Err({code:"fen/invalidPiecePlacement"});
      }
      if(white)wl|=bit;else bl|=bit;
    }
    file++;
  }
  if(file!==8||r!==0)return Err({code:"fen/invalidPiecePlacement"});
  scratch = {
    white:{lo:wl>>>0,hi:wh>>>0},black:{lo:bl>>>0,hi:bh>>>0},
    pawn:{lo:pl>>>0,hi:ph>>>0},knight:{lo:nl>>>0,hi:nh>>>0},
    bishop:{lo:il>>>0,hi:ih>>>0},rook:{lo:rl>>>0,hi:rh>>>0},
    queen:{lo:ql>>>0,hi:qh>>>0},king:{lo:kl>>>0,hi:kh>>>0},
    occupied:{lo:(wl|bl)>>>0,hi:(wh|bh)>>>0},promoted:{lo:0,hi:0},
    kingSq:[wk,bk]
  };
  }
  const curBoard: BoardLike = scratch;

  // ----- active color -----
  let turn: Color;
  if (fieldCount < 2) {
    turn = Color.White;
  } else if (fe[1] - fs[1] === 1) {
    const c = fen.charCodeAt(fs[1]);
    if (c === 119) turn = Color.White;      // 'w'
    else if (c === 98) turn = Color.Black;  // 'b'
    else return Err({ code: "fen/invalidActiveColor" });
  } else {
    return Err({ code: "fen/invalidActiveColor" });
  }

  // ----- castling -----
  let standardMask = 0;
  const whiteSet = opts?.chess960 ? new Set<number>() : undefined;
  const blackSet = opts?.chess960 ? new Set<number>() : undefined;
  const castlingStart = fieldCount > 2 ? fs[2] : -1;
  const castlingIsDash = castlingStart === -1 || (fe[2] - fs[2] === 1 && fen.charCodeAt(fs[2]) === 45);
  if (!castlingIsDash) {
    // validate characters
    const chess960 = !!opts?.chess960;
    // Find king squares for Shredder mapping if needed
    let wk: number | undefined, bk: number | undefined;
    if (chess960) {
      wk = board.kingSquare(curBoard, Color.White);
      bk = board.kingSquare(curBoard, Color.Black);
    }
    // collect chars (index scan over field 2)
    for (let k = castlingStart; k < fe[2]; k++) {
      const ch = fen[k];
      if (!chess960) {
        if (ch !== "K" && ch !== "Q" && ch !== "k" && ch !== "q") {
          return Err({ code: "fen/invalidCastling" });
        }
        if (ch === "K") standardMask |= CASTLE_WK;
        else if (ch === "Q") standardMask |= CASTLE_WQ;
        else if (ch === "k") standardMask |= CASTLE_BK;
        else if (ch === "q") standardMask |= CASTLE_BQ;
      } else {
        // chess960 tolerant
        if (ch === "K") {
          // Shredder king-side white: find rook > king file
          if (wk === undefined) return Err({ code: "fen/invalidCastling" });
          const kf = squareFile(wk);
          // find white rooks on rank 1
          let best: number | undefined;
          for (let f = 7; f > kf; f--) {
            const sqIdx = f; // rank 0
            const p = board.pieceAt(curBoard, sqIdx);
            if (p && p.color === Color.White && p.role === Role.Rook) { best = sqIdx; break; }
            // if no rook found, still add H1 as fallback for standard
          }
          if (best !== undefined) whiteSet!.add(best);
          else whiteSet!.add(7); // fallback to H1
        } else if (ch === "Q") {
          if (wk === undefined) return Err({ code: "fen/invalidCastling" });
          const kf = squareFile(wk);
          let best: number | undefined;
          for (let f = kf - 1; f >= 0; f--) {
            const sqIdx = f;
            const p = board.pieceAt(curBoard, sqIdx);
            if (p && p.color === Color.White && p.role === Role.Rook) { best = sqIdx; break; }
          }
          if (best !== undefined) whiteSet!.add(best);
          else whiteSet!.add(0);
        } else if (ch === "k") {
          if (bk === undefined) return Err({ code: "fen/invalidCastling" });
          const kf = squareFile(bk);
          let best: number | undefined;
          for (let f = 7; f > kf; f--) {
            const sqIdx = 56 + f;
            const p = board.pieceAt(curBoard, sqIdx);
            if (p && p.color === Color.Black && p.role === Role.Rook) { best = sqIdx; break; }
          }
          if (best !== undefined) blackSet!.add(best);
          else blackSet!.add(63);
        } else if (ch === "q") {
          if (bk === undefined) return Err({ code: "fen/invalidCastling" });
          const kf = squareFile(bk);
          let best: number | undefined;
          for (let f = kf - 1; f >= 0; f--) {
            const sqIdx = 56 + f;
            const p = board.pieceAt(curBoard, sqIdx);
            if (p && p.color === Color.Black && p.role === Role.Rook) { best = sqIdx; break; }
          }
          if (best !== undefined) blackSet!.add(best);
          else blackSet!.add(56);
        } else if (ch >= "A" && ch <= "H") {
          const file = ch.charCodeAt(0) - 65;
          const sqIdx = file; // rank 0
          whiteSet!.add(sqIdx);
        } else if (ch >= "a" && ch <= "h") {
          const file = ch.charCodeAt(0) - 97;
          const sqIdx = 56 + file;
          blackSet!.add(sqIdx);
        } else {
          return Err({ code: "fen/invalidCastling" });
        }
      }
    }
    // duplicate check not needed; Set handles
    // For non-960, ensure no duplicate file letters etc already handled
  }

  const castling = opts?.chess960 ? makeCastling(whiteSet!, blackSet!) : CASTLING_RIGHTS_TABLE[standardMask];

  // ----- en passant -----
  // Structural validation (square name + rank for the side to move) stays
  // unconditional per purechess-rules. The capturability check moves behind
  // `strict` (design D3): real-world corpora (lichess FENs after any double
  // push) and gigachess's own makeFen output contain unreachable ep squares,
  // and baseline accepts them — rejecting them broke round-trip for ~4.7% of
  // real-game positions.
  let epSquare: number | null = null;
  const epIsDash = fieldCount < 4 || (fe[3] - fs[3] === 1 && fen.charCodeAt(fs[3]) === 45);
  if (!epIsDash) {
    // index-based square parse (replaces parseSquare on a substring)
    if (fe[3] - fs[3] !== 2) return Err({ code: "fen/invalidEnPassant" });
    const ef = fen.charCodeAt(fs[3]) - 97;    // file a..h
    const er = fen.charCodeAt(fs[3] + 1) - 49; // rank 1..8
    if (ef < 0 || ef > 7 || er < 0 || er > 7) return Err({ code: "fen/invalidEnPassant" });
    const sqIdx = (er << 3) | ef;
    const rank = squareRank(sqIdx);
    // must be rank 6 for white to move (index 5) or rank 3 for black to move (index 2)
    if (turn === Color.White && rank !== 5) return Err({ code: "fen/enPassantUncapturable" });
    if (turn === Color.Black && rank !== 2) return Err({ code: "fen/enPassantUncapturable" });
    epSquare = sqIdx;
    if (opts?.strict) {
      // FIDE-strict mode restores the previous behavior: a pawn of the side
      // to move must be able to capture on the ep square.
      const file = squareFile(sqIdx);
      let capturable = false;
      // For white to move, ep rank 5, capturing pawns are on rank 4 (index 4) adjacent file
      // For black to move, ep rank 2, capturing pawns on rank 3 (index 3) adjacent
      const pawnRank = turn === Color.White ? 4 : 3;
      for (const df of [-1, 1]) {
        const pf = file + df;
        if (pf < 0 || pf >= 8) continue;
        const pawnSq = pawnRank * 8 + pf;
        const p = board.pieceAt(curBoard, pawnSq);
        if (p && p.color === turn && p.role === Role.Pawn) capturable = true;
      }
      if (!capturable) return Err({ code: "fen/enPassantNotCapturable" });
    }
  }

  // ----- halfmove -----
  const half = fieldCount > 4 ? parseFenCount(fen, fs[4], fe[4]) : 0;
  if (!Number.isSafeInteger(half) || half < 0) return Err({ code: "fen/invalidHalfmove" });

  // ----- fullmove -----
  const full = fieldCount > 5 ? parseFenCount(fen, fs[5], fe[5]) : 1;
  if (!Number.isInteger(full) || full < 1) return Err({ code: "fen/invalidFullmove" });

  // ----- validations per purechess-rules -----
  // pawn on back rank
  if ((curBoard.pawn.lo & 255) || (curBoard.pawn.hi & 0xff000000)) return Err({ code: "fen/pawnOnBackRank" });
  const wl = curBoard.white.lo & curBoard.king.lo, wh = curBoard.white.hi & curBoard.king.hi;
  const bl = curBoard.black.lo & curBoard.king.lo, bh = curBoard.black.hi & curBoard.king.hi;
  const w = wl | wh, b = bl | bh;
  if (!w || !b || (wl && wh) || (bl && bh) || (w & (w-1)) || (b & (b-1))) return Err({ code: "fen/kingsCount" });

  // kings adjacent
  const wkSq = scratch.kingSq[Color.White];
  const bkSq = scratch.kingSq[Color.Black];
  if (wkSq !== undefined && bkSq !== undefined) {
    const wAtt = attacks.kingAttacks(wkSq);
    if (sq.has(wAtt, bkSq)) return Err({ code: "fen/kingsAdjacent" });
  }

  // Only the non-moving king must not be attacked; double check of
  // both kings necessarily violates that condition as well.
  if (turn === Color.White ? attacks.isAttacked(curBoard, bkSq, Color.White) : attacks.isAttacked(curBoard, wkSq, Color.Black))
    return Err({ code: "fen/oppositeCheck" });

  const is960 = !!opts?.chess960;
  const kingSqPair: [number, number] = [wkSq ?? -1, bkSq ?? -1];
  (curBoard as { kingSq?: [number, number] }).kingSq = kingSqPair;
  const chk = attacks.attackersTo(curBoard, kingSqPair[turn], turn === Color.White ? Color.Black : Color.White);
  const setup: Setup = {
    board: curBoard,
    turn,
    castling,
    castlingMask: castling.mask,
    isChess960: is960 || castling.mask === undefined,
    epSquare,
    halfmoves: half,
    fullmoves: full,
    halfmove: half,
    fullmove: full,
    kingSq: kingSqPair,
    checkers: chk,
  };
  // Seed the initial Zobrist key when the Polyglot tables are already loaded
  // (lazy-loading contract — see src/zobrist.ts); makeMove then maintains it
  // incrementally in O(1). Positions parsed before loading carry no key.
  if (zobristTablesLoaded()) {
    const zk = calculateZobrist(setup);
    (setup as { zobristLo?: number; zobristHi?: number }).zobristLo = zk.lo;
    (setup as { zobristLo?: number; zobristHi?: number }).zobristHi = zk.hi;
  }
  return Ok(setup);
}

export function makeFen(setup: Setup, opts?: { shredder?: boolean; chess960?: boolean }): string {
  const boardVal = setup.board;
  let placement = "";
  for (let r = 7; r >= 0; r--) {
    const high = r >= 4, shift = (r & 3) * 8;
    const occupied = high ? boardVal.occupied.hi : boardVal.occupied.lo;
    const white = high ? boardVal.white.hi : boardVal.white.lo;
    const pawn = high ? boardVal.pawn.hi : boardVal.pawn.lo;
    const knight = high ? boardVal.knight.hi : boardVal.knight.lo;
    const bishop = high ? boardVal.bishop.hi : boardVal.bishop.lo;
    const rook = high ? boardVal.rook.hi : boardVal.rook.lo;
    const queen = high ? boardVal.queen.hi : boardVal.queen.lo;
    let bits = (occupied >>> shift) & 255, prev = 0;
    while (bits) {
      const bit = bits & -bits, f = 31 - Math.clz32(bit), mask = bit << shift;
      if (f > prev) placement += String(f - prev);
      const w = (white & mask) !== 0;
      placement += pawn & mask ? (w?"P":"p") : knight & mask ? (w?"N":"n") :
        bishop & mask ? (w?"B":"b") : rook & mask ? (w?"R":"r") :
        queen & mask ? (w?"Q":"q") : (w?"K":"k");
      prev = f + 1; bits &= bits - 1;
    }
    if (prev < 8) placement += String(8 - prev);
    if (r) placement += "/";
  }

  const active = setup.turn === Color.White ? "w" : "b";

  // castling
  let castlingStr = "";
  const chess960 = !!opts?.chess960;
  const shredder = !!opts?.shredder;
  if (!chess960 && !shredder && !setup.isChess960 && (setup.castlingMask !== undefined || setup.castling.mask !== undefined)) {
    const m = (setup.castlingMask ?? setup.castling.mask!) & 0x0F;
    castlingStr = CASTLING_FEN_STR[m];
  } else {
    const whiteSet = setup.castling.white;
    const blackSet = setup.castling.black;
    const hasWhite = whiteSet.size > 0;
    const hasBlack = blackSet.size > 0;
    if (!hasWhite && !hasBlack) {
      castlingStr = "-";
    } else {
      if (!chess960) {
        // standard KQkq
        if (whiteSet.has(7)) castlingStr += "K";
        if (whiteSet.has(0)) castlingStr += "Q";
        if (blackSet.has(63)) castlingStr += "k";
        if (blackSet.has(56)) castlingStr += "q";
        if (castlingStr === "") castlingStr = "-";
      } else {
      if (shredder) {
        // Shredder: emit KQkq if rooks on standard squares else fallback to file letters
        let emitted = false;
        const canShredderWhiteK = whiteSet.has(7);
        const canShredderWhiteQ = whiteSet.has(0);
        const canShredderBlackK = blackSet.has(63);
        const canShredderBlackQ = blackSet.has(56);
        const isStandard = (canShredderWhiteK || canShredderWhiteQ || canShredderBlackK || canShredderBlackQ) &&
          [...whiteSet].every(s => s === 7 || s === 0) &&
          [...blackSet].every(s => s === 63 || s === 56);
        if (isStandard) {
          if (canShredderWhiteK) castlingStr += "K";
          if (canShredderWhiteQ) castlingStr += "Q";
          if (canShredderBlackK) castlingStr += "k";
          if (canShredderBlackQ) castlingStr += "q";
          emitted = true;
        }
        if (!emitted) {
          // fallback to X-FEN
          castlingStr = makeXFenString(setup);
        }
        if (castlingStr === "") castlingStr = "-";
      } else {
        castlingStr = makeXFenString(setup);
        if (castlingStr === "") castlingStr = "-";
      }
    }
  }
}

  const epStr = setup.epSquare === null || setup.epSquare === undefined ? "-" : squareName(setup.epSquare);
  const half = String(setup.halfmoves ?? setup.halfmove ?? 0);
  const full = String(setup.fullmoves ?? setup.fullmove ?? 1);

  return `${placement} ${active} ${castlingStr} ${epStr} ${half} ${full}`;
}

function makeXFenString(setup: Setup): string {
  const boardVal = setup.board;
  const wk = board.kingSquare(boardVal, Color.White);
  const bk = board.kingSquare(boardVal, Color.Black);
  let out = "";
  // white: need to order king-side then queen-side
  if (setup.castling.white.size > 0) {
    let files: { sq: number; file: number }[] = [];
    for (const sqIdx of setup.castling.white) files.push({ sq: sqIdx, file: squareFile(sqIdx) });
    if (wk !== undefined) {
      const kf = squareFile(wk);
      // sort: king-side (file > kf) first then queen-side
      const right = files.filter(x => x.file > kf).sort((a,b) => a.file - b.file);
      const left = files.filter(x => x.file < kf).sort((a,b) => b.file - a.file); // maybe closest first?
      // For standard, right = [7], left=[0] => H A
      // For generic, we emit right files then left files
      for (const r of right) out += String.fromCharCode(65 + r.file);
      for (const l of left) out += String.fromCharCode(65 + l.file);
      // if king not between? fallback sorted
      if (right.length + left.length !== files.length) {
        // some rook on same file as king? shouldn't happen
        for (const f of files) if (!right.includes(f) && !left.includes(f)) out += String.fromCharCode(65 + f.file);
      }
    } else {
      files.sort((a,b) => a.file - b.file);
      for (const f of files) out += String.fromCharCode(65 + f.file);
    }
  }
  // black
  if (setup.castling.black.size > 0) {
    let files: { sq: number; file: number }[] = [];
    for (const sqIdx of setup.castling.black) files.push({ sq: sqIdx, file: squareFile(sqIdx) });
    if (bk !== undefined) {
      const kf = squareFile(bk);
      const right = files.filter(x => x.file > kf).sort((a,b) => a.file - b.file);
      const left = files.filter(x => x.file < kf).sort((a,b) => b.file - a.file);
      for (const r of right) out += String.fromCharCode(97 + r.file);
      for (const l of left) out += String.fromCharCode(97 + l.file);
      if (right.length + left.length !== files.length) {
        for (const f of files) if (!right.includes(f) && !left.includes(f)) out += String.fromCharCode(97 + f.file);
      }
    } else {
      files.sort((a,b) => a.file - b.file);
      for (const f of files) out += String.fromCharCode(97 + f.file);
    }
  }
  return out;
}
