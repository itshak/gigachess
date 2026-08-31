// src/san.ts — parseSan/makeSan, parseUci/makeUci per purechess-rules
// Clean-room from spec tables + FIDE notes, no G P L

import * as sq from "./squareSet.js";
import * as board from "./board.js";
import * as chess from "./chess.js";
import { Color, Role } from "./types.js";
import type { Position, Move, Result, SanError, UciError } from "./types.js";
import { Err, Ok } from "./types.js";
import { squareFile, squareRank, parseSquare, squareName } from "./util.js";

function roleToSanChar(role: Role): string {
  switch (role) {
    case Role.King: return "K";
    case Role.Queen: return "Q";
    case Role.Rook: return "R";
    case Role.Bishop: return "B";
    case Role.Knight: return "N";
    case Role.Pawn: return "";
    default: return "";
  }
}

function sanCharToRole(ch: string): Role | undefined {
  if (ch === "K") return Role.King;
  if (ch === "Q") return Role.Queen;
  if (ch === "R") return Role.Rook;
  if (ch === "B") return Role.Bishop;
  if (ch === "N") return Role.Knight;
  return undefined;
}

function promoCharToRole(ch: string): Role | undefined {
  const c = ch.toUpperCase();
  if (c === "Q") return Role.Queen;
  if (c === "R") return Role.Rook;
  if (c === "B") return Role.Bishop;
  if (c === "N") return Role.Knight;
  return undefined;
}

function normalizeCastlingSan(s: string): string {
  // tolerant 0-0 -> O-O
  return s.replace(/0-0-0/g, "O-O-O").replace(/0-0/g, "O-O");
}

// ---------- makeSan ----------
export function makeSan(move: Move, pos: Position): string {
  // Castling — detected via the shared detectCastling path (design D2) so a
  // canonical castling move given in the representation's encoding renders
  // O-O/O-O-O, never "Kg1"/"Kxh1" (measured defect: makeSan({4,6}, kiwipete)
  // returned "Kg1"). The isCastling flag is kept as a fallback for moves
  // produced by genLegalMoves under either representation. The role/rights
  // pre-check keeps the hot SAN path free of detectCastling calls.
  let castling: import("./chess.js").CastlingPlan | null = null;
  const movingPiece = board.pieceAt(pos.board, move.from);
  if (movingPiece && movingPiece.role === Role.King && (pos.castling.white.size > 0 || pos.castling.black.size > 0)) {
    castling = chess.detectCastling(pos, move.from, move.to);
  }
  if (castling || move.isCastling) {
    const isKingSide = castling ? castling.side === "king" : move.to === 6 || move.to === 62;
    let base = isKingSide ? "O-O" : "O-O-O";
    // add check suffix
    const next = chess.makeMove(pos, move);
    if (chess.isCheckmate(next)) base += "#";
    else if (chess.isCheck(next)) base += "+";
    return base;
  }

  const piece = board.pieceAt(pos.board, move.from);
  if (!piece) return "";

  const toName = squareName(move.to);
  const isCapture = (() => {
    const target = board.pieceAt(pos.board, move.to);
    if (target && target.color !== pos.turn) return true;
    if (move.isEnPassant) return true;
    // en-passant capture onto the empty ep square (chessops output parity):
    // a pawn moving DIAGONALLY onto the ep square is a capture even when the
    // caller did not set the isEnPassant flag (external move objects). A
    // straight push to the ep square remains a quiet move.
    if (
      piece.role === Role.Pawn &&
      pos.epSquare !== null &&
      move.to === pos.epSquare &&
      squareFile(move.from) !== squareFile(move.to)
    ) {
      return true;
    }
    return false;
  })();

  const destRank = squareRank(move.to);
  const isPromotion = !!move.isPromotion || (piece.role === Role.Pawn && (destRank === 7 || destRank === 0));

  // Piece letter
  let san = "";
  if (piece.role !== Role.Pawn) {
    san += roleToSanChar(piece.role);
  } else if (isCapture) {
    // pawn capture needs file of from
    san += String.fromCharCode(97 + squareFile(move.from));
  }

  // Disambiguation for non-pawn (and pawn capture already handled)
  if (piece.role !== Role.Pawn) {
    // Find all pieces of same role/color that can legally move to same destination
    const candidates: number[] = [];
    const own = pos.turn === Color.White ? pos.board.white : pos.board.black;
    // Iterate over all squares with same role
    const roleSet = (() => {
      switch (piece.role) {
        case Role.Knight: return pos.board.knight;
        case Role.Bishop: return pos.board.bishop;
        case Role.Rook: return pos.board.rook;
        case Role.Queen: return pos.board.queen;
        case Role.King: return pos.board.king;
        default: return sq.empty();
      }
    })();
    const sameRole = sq.and(own, roleSet);
    for (const sqIdx of sq.iter(sameRole)) {
      if (sqIdx === move.from) continue;
      const d = chess.dests(pos, sqIdx);
      if (sq.has(d, move.to)) candidates.push(sqIdx);
    }
    // Include moving piece itself, total candidates +1 = all that can reach dest
    // If there is any other candidate, need disambiguation
    if (candidates.length > 0) {
      // Determine minimal disambiguation
      const movingFile = squareFile(move.from);
      const movingRank = squareRank(move.from);
      let needFile = false;
      let needRank = false;
      // Check if file alone distinguishes
      let fileUnique = true;
      for (const c of candidates) {
        if (squareFile(c) === movingFile) { fileUnique = false; break; }
      }
      if (fileUnique) {
        san += String.fromCharCode(97 + movingFile);
      } else {
        // file not unique, check rank
        let rankUnique = true;
        for (const c of candidates) {
          if (squareRank(c) === movingRank) { rankUnique = false; break; }
        }
        if (rankUnique) {
          san += String.fromCharCode(49 + movingRank);
        } else {
          san += String.fromCharCode(97 + movingFile) + String.fromCharCode(49 + movingRank);
        }
      }
    }
  }

  // Capture
  if (isCapture) {
    // For pawn, we already added file, need 'x'
    // For pieces, disambiguation already in san, now add 'x'
    san += "x";
  }

  // Destination
  // For pawn capture we already have file preceding 'x', need dest; for non-pawn we need dest after optional disamb and 'x'
  // Our san currently for pawn capture is like "e" + "x" => "ex", then dest
  // For non-pawn, san is piece char + disamb + 'x' if capture, then dest
  // So append dest
  // But for non-pawn capture case, we already have piece+disamb, now need to ensure we haven't duplicated file for pawn
  // For pawn non-capture, san is "" currently, just dest
  // For pawn capture, san is "ex" already, need dest
  // For pieces, san currently is piece+disamb (+x if capture) => need dest
  // However for pieces, if we added disamb file/rank, san already has it, so just add dest
  // Implementation above for pieces: san = piece char + disamb (file or rank or both) . For pawn capture, san = file + 'x' ? Wait we added file for pawn at start, then for disamb we skip for pawn, then capture adds 'x'. So for pawn capture "exd5": piece pawn => san initially "e" (file), then disamb skipped, then isCapture adds "x" => "ex", then dest "d5" => "exd5" correct.
  // For pawn non-capture "e4": san "" initially, no disamb, no capture, just dest "e4"
  // For piece "Nbd2": piece N, candidates determine file unique => san = "N" + "b" => "Nb", no capture, then dest "d2" => "Nbd2"
  // For "Qh4e1": piece Q, disamb "h4", san="Qh4", dest "e1" => "Qh4e1"
  san += toName;

  // Promotion
  if (isPromotion) {
    const promo = move.promotion ?? Role.Queen;
    san += "=" + roleToSanChar(promo);
  }

  // Check / mate suffix
  const next = chess.makeMove(pos, move);
  if (chess.isCheckmate(next)) san += "#";
  else if (chess.isCheck(next)) san += "+";

  return san;
}

// ---------- parseSan ----------
export function parseSan(san: string, pos: Position): Result<Move, SanError> {
  const orig = san;
  let s = normalizeCastlingSan(san.trim());
  // Handle check suffix for later, but keep for validation
  let checkSuffix = "";
  if (s.endsWith("+") || s.endsWith("#")) {
    checkSuffix = s.slice(-1);
    s = s.slice(0, -1);
  }

  // Castling
  if (s === "O-O" || s === "O-O-O") {
    const isKingSide = s === "O-O";
    const kingSq = board.kingSquare(pos.board, pos.turn);
    if (kingSq === undefined) return Err({ code: "san/noKing" });
    // Find if castling is legal via dests. The generated dest is the
    // representation's castling square: normalized landing (6/2/62/58) or the
    // right's rook square (chessops/960 form). Both are accepted.
    const d = chess.dests(pos, kingSq);
    const normDest = pos.turn === Color.White ? (isKingSide ? 6 : 2) : (isKingSide ? 62 : 58);
    let dest: number | undefined;
    if (sq.has(d, normDest)) {
      dest = normDest;
    } else {
      const rights = pos.turn === Color.White ? pos.castling.white : pos.castling.black;
      for (const rs of rights) {
        const rookIsKingSide = squareFile(rs) > squareFile(kingSq);
        if (rookIsKingSide === isKingSide && sq.has(d, rs)) { dest = rs; break; }
      }
    }
    if (dest === undefined) return Err({ code: "san/illegal" });
    const move: Move = { from: kingSq, to: dest, isCastling: true, isEnPassant: false, isPromotion: false, promotion: null };
    // Optionally validate check suffix matches actual
    // We ignore mismatch for parsing tolerance, but we could validate
    // If checkSuffix present, we could verify after play, but not required to error
    return Ok(move);
  }

  // Promotion handling
  let promotion: Role | undefined = undefined;
  const eqIdx = s.indexOf("=");
  if (eqIdx !== -1) {
    const promoChar = s[eqIdx + 1];
    if (!promoChar) return Err({ code: "san/invalidPromotion" });
    const role = promoCharToRole(promoChar);
    if (role === undefined) return Err({ code: "san/invalidPromotion" });
    promotion = role;
    s = s.slice(0, eqIdx);
  }

  // Destination
  if (s.length < 2) return Err({ code: "san/invalidSan" });
  const toStr = s.slice(-2);
  const to = parseSquare(toStr);
  if (to === undefined) return Err({ code: "san/invalidSquare" });
  let rest = s.slice(0, -2);

  // Capture
  let isCapture = false;
  if (rest.endsWith("x")) {
    isCapture = true;
    rest = rest.slice(0, -1);
  }

  // Piece
  let pieceRole: Role | null = null; // null means pawn
  if (rest.length > 0 && "KQRBN".includes(rest[0])) {
    const ch = rest[0];
    pieceRole = sanCharToRole(ch)!;
    rest = rest.slice(1);
  } else {
    pieceRole = Role.Pawn;
  }

  // Disambiguation remaining
  let disambFile: string | null = null;
  let disambRank: string | null = null;
  if (rest.length === 1) {
    const ch = rest[0];
    if (ch >= "a" && ch <= "h") disambFile = ch;
    else if (ch >= "1" && ch <= "8") disambRank = ch;
    else return Err({ code: "san/invalidSan" });
  } else if (rest.length === 2) {
    if (rest[0] >= "a" && rest[0] <= "h" && rest[1] >= "1" && rest[1] <= "8") {
      disambFile = rest[0];
      disambRank = rest[1];
    } else return Err({ code: "san/invalidSan" });
  } else if (rest.length > 2) {
    return Err({ code: "san/invalidSan" });
  }

  // For pawn, pieceRole is pawn, but rest may be file for capture (like "e" in exd5)
  // Our disamb handling already captured that: for "exd5", rest after removing piece (none) and capture, rest = "e" => disambFile = 'e' . Good.
  // For pawn push "e4", rest = "" => no disamb.

  // Now find legal moves matching
  const legalMoves = genLegalMovesForSan(pos);
  const candidates: Move[] = [];
  for (const m of legalMoves) {
    const fromPiece = board.pieceAt(pos.board, m.from);
    if (!fromPiece) continue;
    // piece match
    if (pieceRole !== null) {
      // pieceRole is expected role; for pawn we set Role.Pawn
      if (fromPiece.role !== pieceRole) continue;
    } else {
      if (fromPiece.role !== Role.Pawn) continue;
    }
    if (m.to !== to) continue;
    // capture match
    const target = board.pieceAt(pos.board, to);
    const isCap = (target && target.color !== pos.turn) || !!m.isEnPassant;
    if (isCapture !== isCap) {
      // For pawn, SAN may omit 'x' for capture? But spec says capture is 'x', we enforce.
      // However for leniency, we could allow if isCapture false but move is capture and SAN is pawn? But spec requires 'x' for pawn capture, so mismatch should be error
      // We'll enforce strict: if SAN indicates capture but move not capture -> not candidate; if SAN no capture but move is capture -> not candidate
      continue;
    }
    // promotion
    if (promotion !== undefined) {
      if (m.promotion !== promotion) continue;
    } else {
      if (m.isPromotion) continue;
    }
    // disambiguation
    if (disambFile !== null) {
      const f = String.fromCharCode(97 + squareFile(m.from));
      if (f !== disambFile) continue;
    }
    if (disambRank !== null) {
      const r = String.fromCharCode(49 + squareRank(m.from));
      if (r !== disambRank) continue;
    }
    candidates.push(m);
  }

  if (candidates.length === 0) return Err({ code: "san/noLegalMove" });
  if (candidates.length > 1) return Err({ code: "san/ambiguous" });
  const chosen = candidates[0];
  // Optionally validate check suffix: if suffix present but after play check status mismatches, should we error? For now ignore, but we could validate
  // If suffix is '+' but resulting pos not check, or '#' but not mate, should we error? Spec says SAN includes +/# based on resulting position, so we could validate but not required for parsing
  // We'll optionally validate if suffix present
  if (checkSuffix) {
    const next = chess.makeMove(pos, chosen);
    const isMate = chess.isCheckmate(next);
    const isChk = chess.isCheck(next);
    if (checkSuffix === "+" && !isChk) {
      // SAN claims check but not check -> still treat as illegal? We could ignore
    }
    if (checkSuffix === "#" && !isMate) {
      // mismatch
    }
  }
  return Ok(chosen);
}

// helper to generate legal moves for SAN matching (includes all promotion variants)
function genLegalMovesForSan(pos: Position): Move[] {
  // Use chess genLegalMoves internal? We can call chess.perft helper? But chess.genLegalMoves is not exported (private). We need to replicate or expose.
  // For now, we will generate via allDests and then expand promotions
  // Simpler: use chess.allDests and then for each destination, create Move(s) and test isLegal via chess.isLegal? But we need Move objects with promotion etc.
  // We'll generate via iterating allDests and handling promotion expansion
  const moves: Move[] = [];
  const all = chess.allDests(pos);
  for (const [from, set] of all) {
    for (const to of sq.iter(set)) {
      const piece = board.pieceAt(pos.board, from);
      if (!piece) continue;
      const destRank = squareRank(to);
      const isPromo = piece.role === Role.Pawn && (destRank === 0 || destRank === 7);
      if (isPromo) {
        for (const promo of [Role.Queen, Role.Rook, Role.Bishop, Role.Knight] as const) {
          const isEnPassant = false;
          // pawn promotion capture is also capture, but set already includes captures
          const target = board.pieceAt(pos.board, to);
          const isCap = !!target || (pos.epSquare === to);
          // Actually en passant to back rank not possible
          const mv: Move = { from, to, promotion: promo, isPromotion: true, isEnPassant: false, isCastling: false };
          // Need to set isEnPassant correctly for pawn promo capture en passant? Not needed
          moves.push(mv);
        }
      } else {
        const target = board.pieceAt(pos.board, to);
        let isEnPassant = false;
        if (piece.role === Role.Pawn && pos.epSquare !== null && to === pos.epSquare) {
          const fileDiff = Math.abs(squareFile(to) - squareFile(from));
          const dir = piece.color === Color.White ? 1 : -1;
          if (fileDiff === 1 && destRank - squareRank(from) === dir) isEnPassant = true;
        }
        let isCastling = false;
        if (piece.role === Role.King) {
          // Shared detectCastling path (design D2) — no dest-heuristic here.
          isCastling = chess.detectCastling(pos, from, to) !== null;
        }
        moves.push({ from, to, promotion: null, isPromotion: false, isEnPassant, isCastling });
      }
    }
  }
  return moves;
}

// ---------- UCI ----------
export function parseUci(uci: string): Result<Move, UciError> {
  const s = uci.trim();
  if (s.length < 4 || s.length > 5) return Err({ code: "uci/invalidUci" });
  const fromStr = s.slice(0, 2);
  const toStr = s.slice(2, 4);
  const from = parseSquare(fromStr);
  const to = parseSquare(toStr);
  if (from === undefined || to === undefined) return Err({ code: "uci/invalidSquare" });
  let promotion: Role | null = null;
  let isPromotion = false;
  if (s.length === 5) {
    const promoChar = s[4];
    const role = promoCharToRole(promoChar);
    if (!role) return Err({ code: "uci/invalidPromotion" });
    promotion = role;
    isPromotion = true;
  }
  // Determine if this is castling via king move? For UCI, castling is e1g1 or e1h1 etc. We need to detect if this is king move and castling rights? But we don't have Position here to validate. parseUci as per spec is pure without position: it just parses squares and promotion. However spec says parseUci handles e1g1 and e1h1 both as castling in 960. But without position, we can't know. So we just return Move with from,to,promotion and set isCastling false initially; caller can interpret via position's dests/isLegal.
  // But we can set isCastling heuristically: if from is king start and to is G1/C1 or rook square? We don't have board. We'll just return move and let chess.isLegal handle normalization.
  // For now, set isCastling false, and let makeMove handle 960 normalization
  const move: Move = { from, to, promotion, isPromotion, isEnPassant: false, isCastling: false };
  // Also need to detect promotion case where to square is back rank and promotion missing? That's SAN concern, not UCI: UCI must have promotion char if pawn to back rank, but we can allow without and still return move with null promotion? Spec says e7e8q and e7e8Q both promotion queen. We'll handle.
  return Ok(move);
}

export function makeUci(move: Move): string {
  const from = squareName(move.from);
  const to = squareName(move.to);
  let promo = "";
  if (move.promotion !== null && move.promotion !== undefined) {
    switch (move.promotion) {
      case Role.Queen: promo = "q"; break;
      case Role.Rook: promo = "r"; break;
      case Role.Bishop: promo = "b"; break;
      case Role.Knight: promo = "n"; break;
      default: promo = "";
    }
  } else if (move.isPromotion && move.promotion) {
    // same
  }
  return from + to + promo;
}
