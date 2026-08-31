// src/fen.ts — parseFen / makeFen with six-field validation per purechess-rules
// Clean-room from spec tables + FIDE notes, no G P L, no english hard-coded strings beyond codes

import type { Board } from "./board.js";
import * as board from "./board.js";
import * as sq from "./squareSet.js";
import { Color, Role, Err, Ok } from "./types.js";
import type { Setup, CastlingRights, FenError, Result } from "./types.js";
import { squareFile, squareRank, parseSquare, squareName } from "./util.js";
import * as attacks from "./attacks.js";
import { zobristTablesLoaded, calculateZobrist } from "./zobrist.js";

// helpers to create CastlingRights
function makeCastling(whiteSet: Set<number>, blackSet: Set<number>): CastlingRights {
  const whiteKing = whiteSet.has(7);
  const whiteQueen = whiteSet.has(0);
  const blackKing = blackSet.has(63);
  const blackQueen = blackSet.has(56);
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
  const scratch = board.newScratchBoard();
  let r = 7;
  let file = 0;
  for (let k = fs[0]; k < fe[0]; k++) {
    const c = fen.charCodeAt(k);
    if (c === 47) {
      // '/': next rank down
      if (file !== 8 || r === 0) return Err({ code: "fen/invalidPiecePlacement" });
      r--;
      file = 0;
      continue;
    }
    if (c >= 49 && c <= 56) {
      // '1'..'8': consecutive empty squares
      file += c - 48;
      if (file > 8) return Err({ code: "fen/invalidPiecePlacement" });
      continue;
    }
    if (file >= 8) return Err({ code: "fen/invalidPiecePlacement" });
    // inline role/color decode (no per-piece object allocation)
    let role: Role;
    switch (c | 32) {
      case 112: role = Role.Pawn; break;   // p
      case 110: role = Role.Knight; break; // n
      case 98: role = Role.Bishop; break;  // b
      case 114: role = Role.Rook; break;   // r
      case 113: role = Role.Queen; break;  // q
      case 107: role = Role.King; break;   // k
      default: return Err({ code: "fen/invalidPiecePlacement" });
    }
    const color = c >= 97 ? Color.Black : Color.White; // lowercase ⇒ black
    const sqIdx = r * 8 + file;
    board.putPieceInPlace(scratch, sqIdx, { color, role });
    file++;
  }
  if (file !== 8 || r !== 0) return Err({ code: "fen/invalidPiecePlacement" });
  const curBoard: Board = board.cloneBoard(scratch);

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
  let whiteSet = new Set<number>();
  let blackSet = new Set<number>();
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
        if (ch === "K") whiteSet.add(7);
        else if (ch === "Q") whiteSet.add(0);
        else if (ch === "k") blackSet.add(63);
        else if (ch === "q") blackSet.add(56);
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
          if (best !== undefined) whiteSet.add(best);
          else whiteSet.add(7); // fallback to H1
        } else if (ch === "Q") {
          if (wk === undefined) return Err({ code: "fen/invalidCastling" });
          const kf = squareFile(wk);
          let best: number | undefined;
          for (let f = kf - 1; f >= 0; f--) {
            const sqIdx = f;
            const p = board.pieceAt(curBoard, sqIdx);
            if (p && p.color === Color.White && p.role === Role.Rook) { best = sqIdx; break; }
          }
          if (best !== undefined) whiteSet.add(best);
          else whiteSet.add(0);
        } else if (ch === "k") {
          if (bk === undefined) return Err({ code: "fen/invalidCastling" });
          const kf = squareFile(bk);
          let best: number | undefined;
          for (let f = 7; f > kf; f--) {
            const sqIdx = 56 + f;
            const p = board.pieceAt(curBoard, sqIdx);
            if (p && p.color === Color.Black && p.role === Role.Rook) { best = sqIdx; break; }
          }
          if (best !== undefined) blackSet.add(best);
          else blackSet.add(63);
        } else if (ch === "q") {
          if (bk === undefined) return Err({ code: "fen/invalidCastling" });
          const kf = squareFile(bk);
          let best: number | undefined;
          for (let f = kf - 1; f >= 0; f--) {
            const sqIdx = 56 + f;
            const p = board.pieceAt(curBoard, sqIdx);
            if (p && p.color === Color.Black && p.role === Role.Rook) { best = sqIdx; break; }
          }
          if (best !== undefined) blackSet.add(best);
          else blackSet.add(56);
        } else if (ch >= "A" && ch <= "H") {
          const file = ch.charCodeAt(0) - 65;
          const sqIdx = file; // rank 0
          whiteSet.add(sqIdx);
        } else if (ch >= "a" && ch <= "h") {
          const file = ch.charCodeAt(0) - 97;
          const sqIdx = 56 + file;
          blackSet.add(sqIdx);
        } else {
          return Err({ code: "fen/invalidCastling" });
        }
      }
    }
    // duplicate check not needed; Set handles
    // For non-960, ensure no duplicate file letters etc already handled
  }

  const castling = makeCastling(whiteSet, blackSet);

  // ----- en passant -----
  // Structural validation (square name + rank for the side to move) stays
  // unconditional per purechess-rules. The capturability check moves behind
  // `strict` (design D3): real-world corpora (lichess FENs after any double
  // push) and turbochess's own makeFen output contain unreachable ep squares,
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
  if (!Number.isInteger(half) || half < 0 || half > 150) return Err({ code: "fen/invalidHalfmove" });

  // ----- fullmove -----
  const full = fieldCount > 5 ? parseFenCount(fen, fs[5], fe[5]) : 1;
  if (!Number.isInteger(full) || full < 1) return Err({ code: "fen/invalidFullmove" });

  // ----- validations per purechess-rules -----
  // pawn on back rank
  for (let f = 0; f < 8; f++) {
    const sq1 = f; // rank 1
    const sq8 = 56 + f; // rank 8
    const p1 = board.pieceAt(curBoard, sq1);
    const p8 = board.pieceAt(curBoard, sq8);
    if (p1 && p1.role === Role.Pawn) return Err({ code: "fen/pawnOnBackRank" });
    if (p8 && p8.role === Role.Pawn) return Err({ code: "fen/pawnOnBackRank" });
  }

  // kings count
  const whiteKings = sq.popcnt(sq.and(curBoard.white, curBoard.king));
  const blackKings = sq.popcnt(sq.and(curBoard.black, curBoard.king));
  const totalKings = sq.popcnt(curBoard.king);
  if (totalKings !== 2 || whiteKings !== 1 || blackKings !== 1) {
    return Err({ code: "fen/kingsCount" });
  }

  // kings adjacent
  const wkSq = board.kingSquare(curBoard, Color.White);
  const bkSq = board.kingSquare(curBoard, Color.Black);
  if (wkSq !== undefined && bkSq !== undefined) {
    const wAtt = attacks.kingAttacks(wkSq);
    if (sq.has(wAtt, bkSq)) return Err({ code: "fen/kingsAdjacent" });
  }

  // oppositeCheck: side not to move king attacked
  if (wkSq !== undefined && bkSq !== undefined) {
    const whiteAttacked = attacks.isAttacked(curBoard, wkSq, Color.Black);
    const blackAttacked = attacks.isAttacked(curBoard, bkSq, Color.White);
    // illegal if both in check
    if (whiteAttacked && blackAttacked) return Err({ code: "fen/oppositeCheck" });
    // illegal if opponent king is in check (side not to move)
    if (turn === Color.White && blackAttacked) return Err({ code: "fen/oppositeCheck" });
    if (turn === Color.Black && whiteAttacked) return Err({ code: "fen/oppositeCheck" });
  }

  // castling validation extra: if not chess960 and castling rights refer to missing rook/king not on original? For now skip strict

  const setup: Setup = {
    board: curBoard,
    turn,
    castling,
    epSquare,
    halfmoves: half,
    fullmoves: full,
    halfmove: half,
    fullmove: full,
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
  // piece placement
  let placement = "";
  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    let rankStr = "";
    for (let f = 0; f < 8; f++) {
      const sqIdx = r * 8 + f;
      // occupancy + role/color via direct bit tests (no per-square pieceAt
      // allocation — task 5.1)
      if (!sq.has(boardVal.occupied, sqIdx)) {
        empty++;
      } else {
        if (empty > 0) { rankStr += String(empty); empty = 0; }
        const isWhite = sq.has(boardVal.white, sqIdx);
        let ch: string;
        if (sq.has(boardVal.pawn, sqIdx)) ch = isWhite ? "P" : "p";
        else if (sq.has(boardVal.knight, sqIdx)) ch = isWhite ? "N" : "n";
        else if (sq.has(boardVal.bishop, sqIdx)) ch = isWhite ? "B" : "b";
        else if (sq.has(boardVal.rook, sqIdx)) ch = isWhite ? "R" : "r";
        else if (sq.has(boardVal.queen, sqIdx)) ch = isWhite ? "Q" : "q";
        else ch = isWhite ? "K" : "k";
        rankStr += ch;
      }
    }
    if (empty > 0) rankStr += String(empty);
    placement += rankStr;
    if (r > 0) placement += "/";
  }

  const active = setup.turn === Color.White ? "w" : "b";

  // castling
  let castlingStr = "";
  const chess960 = !!opts?.chess960;
  const shredder = !!opts?.shredder;
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
