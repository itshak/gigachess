// src/chess.ts — core chess rules, Position/Setup, dests, isLegal, isCheck, perft etc
// MIT turbochess, clean-room from specs + FIDE notes (no G P L)

import * as sq from "./squareSet.js";
import type { SquareSet } from "./squareSet.js";
import * as board from "./board.js";
import type { Board } from "./board.js";
import * as attacks from "./attacks.js";
import { Color, Role } from "./types.js";
import type { Setup, Move, Result, CastlingRights, Position } from "./types.js";
import { opposite, squareFile, squareRank, parseSquare, squareName } from "./util.js";
import { zobristTablesLoaded, zobristAfterMove, calculateZobrist, zobristHex } from "./zobrist.js";
import type { ZobristKey } from "./zobrist.js";
import { parseFen, makeFen } from "./fen.js";
import { parseSan, makeSan, parseUci, makeUci } from "./san.js";
import { packOf, packedToMoves } from "./packedMove.js";
import type { TreeNode, TreeWrapper } from "./chesstree.js";
import { pieceAt } from "./board.js";

// Tree driver hook for toTree/loadTree (injected by turbochess root / chesstree)
let _treeDriver: {
  build: (root: TreeNode) => TreeWrapper;
  pgnImport: (pgn: string) => { treeParts: TreeNode[] };
} | undefined;

export function registerTreeDriver(driver: {
  build: (root: TreeNode) => TreeWrapper;
  pgnImport: (pgn: string) => { treeParts: TreeNode[] };
}): void {
  _treeDriver = driver;
}

// helpers

export function isCheck(pos: Position): boolean {
  const ksq = board.kingSquare(pos.board, pos.turn);
  if (ksq === undefined) return false;
  const attacker = opposite(pos.turn);
  return attacks.isAttacked(pos.board, ksq, attacker);
}

export function kingAttackers(pos: Position, color: Color): SquareSet {
  return attacks.kingAttackers(pos.board, color);
}

// insufficient material per spec
export function isInsufficientMaterial(pos: Position): boolean {
  const b = pos.board;
  // only kings
  if (sq.equals(b.occupied, b.king)) return true;
  // count pieces
  const whitePawns = sq.popcnt(sq.and(b.white, b.pawn));
  const blackPawns = sq.popcnt(sq.and(b.black, b.pawn));
  const whiteRooks = sq.popcnt(sq.and(b.white, b.rook));
  const blackRooks = sq.popcnt(sq.and(b.black, b.rook));
  const whiteQueens = sq.popcnt(sq.and(b.white, b.queen));
  const blackQueens = sq.popcnt(sq.and(b.black, b.queen));
  if (whitePawns > 0 || blackPawns > 0 || whiteRooks > 0 || blackRooks > 0 || whiteQueens > 0 || blackQueens > 0) {
    return false;
  }
  const whiteKnights = sq.popcnt(sq.and(b.white, b.knight));
  const blackKnights = sq.popcnt(sq.and(b.black, b.knight));
  const whiteBishops = sq.popcnt(sq.and(b.white, b.bishop));
  const blackBishops = sq.popcnt(sq.and(b.black, b.bishop));

  const totalKnights = whiteKnights + blackKnights;
  const totalBishops = whiteBishops + blackBishops;

  // K vs K already handled
  // K+B vs K, K+N vs K
  if (totalKnights === 1 && totalBishops === 0) return true;
  if (totalBishops === 1 && totalKnights === 0) return true;

  // K+B vs K+B same color bishops
  if (totalBishops === 2 && totalKnights === 0) {
    // find bishop squares
    let firstB = sq.first(sq.or(sq.and(b.white, b.bishop), sq.and(b.black, b.bishop)));
    // Actually need both bishops
    const bishops = sq.or(sq.and(b.white, b.bishop), sq.and(b.black, b.bishop));
    const iter = [...sq.iter(bishops)];
    if (iter.length === 2) {
      const c1 = (squareFile(iter[0]) + squareRank(iter[0])) % 2;
      const c2 = (squareFile(iter[1]) + squareRank(iter[1])) % 2;
      if (c1 === c2) return true;
    }
  }

  // K+B vs K+B same color insufficient, opposite color sufficient -> false
  // K+N vs K+N etc not insufficient
  return false;
}

export function isFiftyMoveDraw(pos: Position): boolean {
  return (pos.halfmoves ?? pos.halfmove ?? 0) >= 100;
}
export function isSeventyFiveMoveDraw(pos: Position): boolean {
  return (pos.halfmoves ?? pos.halfmove ?? 0) >= 150;
}

export function isThreefoldRepetition(history: Position[]): boolean {
  if (history.length < 3) return false;
  const last = history[history.length - 1];
  let count = 0;
  for (const h of history) {
    if (positionsEqualForRepetition(h, last)) count++;
    if (count >= 3) return true;
  }
  return false;
}
export function isFivefoldRepetition(history: Position[]): boolean {
  if (history.length < 5) return false;
  const last = history[history.length - 1];
  let count = 0;
  for (const h of history) if (positionsEqualForRepetition(h, last)) count++;
  return count >= 5;
}

function positionsEqualForRepetition(a: Position, b: Position): boolean {
  if (a.turn !== b.turn) return false;
  if (a.epSquare !== b.epSquare) return false;
  if (!board.boardEquals(a.board, b.board)) return false;
  // castling sets equality
  if (a.castling.white.size !== b.castling.white.size) return false;
  if (a.castling.black.size !== b.castling.black.size) return false;
  for (const s of a.castling.white) if (!b.castling.white.has(s)) return false;
  for (const s of a.castling.black) if (!b.castling.black.has(s)) return false;
  return true;
}

// ---------- castling: one detect/apply path (ADR-013 as amended) ----------
// ADR-013 bake-off result (change purechess-gates-green, task 1.1): the
// baseline-style king-captures-rook representation (e1h1) is the single
// canonical OUTPUT encoding used by dests/allDests/genLegalMoves (and hence
// makeUci). It measured equal-or-faster than the normalized-landing encoding
// (perft d3 11.26 vs 11.42 ms median; makeMove walk 425 vs 430 ms; allDests
// 6.27 vs 6.39 ms — see bench/castling-bakeoff.mjs) and deletes the
// canonicalization layer: standard-chess and Chess960 handling converge and
// dests are byte-identical to baseline. Both INPUT forms are still accepted
// by detectCastling (king→rook square e1h1, and king→landing e1g1 as a
// two-file step) so `parseUci("e1g1")` in standard chess and 960 `e1h1`
// input keep working (UCI protocol boundary documented in ADR-013: engines
// are sent e1g1 for standard castling; conversion belongs to the engine
// boundary, not to makeUci).
export type CastlingPlan = {
  side: "king" | "queen";
  kingFrom: number;
  kingTo: number; // normalized landing square (6/2/62/58)
  rookFrom: number;
  rookTo: number; // 5/3/61/59
};

function castlingPlanFor(color: Color, ks: number, rs: number): CastlingPlan {
  const rank = squareRank(ks);
  const isKingSide = squareFile(rs) > squareFile(ks);
  return {
    side: isKingSide ? "king" : "queen",
    kingFrom: ks,
    kingTo: isKingSide ? (rank << 3) | 6 : (rank << 3) | 2,
    rookFrom: rs,
    rookTo: isKingSide ? (rank << 3) | 5 : (rank << 3) | 3,
  };
}

/** Finds the position's castling plan (if any) targeting square `to` (either
 * the rook origin or the normalized landing square). Shared by the hot loops. */
function planForDest(plans: CastlingPlan[], to: number): CastlingPlan | null {
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    if (p.rookFrom === to || p.kingTo === to) return p;
  }
  return null;
}

/**
 * Single source of truth for castling detection, shared by makeMove, isLegal,
 * makeSan, destsFast and genLegalMoves (design D2). Accepts both input
 * representations:
 *  - king→own-rook square (baseline / 960 input, e1h1), and
 *  - king→normalized landing square (e1g1; a two-file king step),
 * provided the corresponding castling right exists and the rook is actually
 * on its origin square. Returns null for every non-castling move — in
 * particular for an ordinary one-square king step to g1/c1/g8/c8, which the
 * previous per-call-site heuristics misclassified when ANY color (even the
 * opponent) held castling rights (root cause of the perft parity defect).
 */
export function detectCastling(pos: Position, from: number, to: number): CastlingPlan | null {
  if (pos.castling.white.size === 0 && pos.castling.black.size === 0) return null;
  const piece = board.pieceAt(pos.board, from);
  if (!piece || piece.role !== Role.King || piece.color !== pos.turn) return null;
  const rights = piece.color === Color.White ? pos.castling.white : pos.castling.black;
  if (rights.size === 0) return null;
  const rank = squareRank(from);
  // Input form 1: king captures own rook on its origin square (baseline/960).
  if (rights.has(to) && squareRank(to) === rank) {
    const target = board.pieceAt(pos.board, to);
    if (target && target.color === piece.color && target.role === Role.Rook) {
      return castlingPlanFor(piece.color, from, to);
    }
  }
  // Input form 2: normalized landing square — a two-file step on the same rank.
  if (squareRank(to) === rank && Math.abs(squareFile(to) - squareFile(from)) === 2) {
    // The landing square must be empty for castling.
    if (!board.pieceAt(pos.board, to)) {
      for (const rs of rights) {
        const plan = castlingPlanFor(piece.color, from, rs);
        if (plan.kingTo !== to) continue;
        // The right's rook must actually be present on its origin square.
        const rp = board.pieceAt(pos.board, rs);
        if (rp && rp.color === piece.color && rp.role === Role.Rook) return plan;
      }
    }
  }
  return null;
}

// ---------- move execution (play) ----------
/**
 * Shared board-edit sequence used by BOTH the pure `makeMove` and the
 * hot-loop scratch tester below — a single source of truth so the fast path
 * can never drift from the pure path.
 */
function computeCaptured(
  pos: Position,
  origTo: number,
  to: number,
  isCastling: boolean,
  piece: { color: Color; role: Role },
): { color: Color; role: Role } | undefined {
  // capture handling (re-evaluate after normalization; for castling, captured is the rook but we handle rook move separately)
  // if we normalized 960 castling, original captured is rook but normalized to is now empty dest, so captured should be undefined for that case
  if (isCastling && piece.role === Role.King) {
    // For 960 normalized, the original rook capture is not a capture in normal sense; we should not treat as capture
    // Check if original move was king-captures-rook: then captured was rook, but after normalization we don't want to treat as capture of piece on dest (dest is empty)
    const origTarget = board.pieceAt(pos.board, origTo);
    if (origTarget && origTarget.color === piece.color && origTarget.role === Role.Rook) {
      return undefined;
    }
    return board.pieceAt(pos.board, to);
  }
  return board.pieceAt(pos.board, to);
}

function applyBoardEdits(
  nb: board.WritableBoard,
  pos: Position,
  from: number,
  to: number, // normalized dest (castling → G1/C1/G8/C8)
  origTo: number, // move.to before normalization (for capture removal)
  piece: { color: Color; role: Role },
  isEnPassant: boolean,
  plan: CastlingPlan | null, // non-null ⇒ castling, with the full king+rook plan
  isPromotion: boolean,
  promotion: Role | null,
  captured: { color: Color; role: Role } | undefined,
): void {
  // remove moving piece from from
  board.clearSquareInPlace(nb, from);
  // if en passant, remove captured pawn which is not on to square
  if (isEnPassant) {
    const epCaptureRank = pos.turn === Color.White ? squareRank(to) - 1 : squareRank(to) + 1;
    const epCaptureSq = epCaptureRank * 8 + squareFile(to);
    board.clearSquareInPlace(nb, epCaptureSq);
  } else if (captured) {
    // captured is only ever non-undefined when to === origTo (capture removal
    // square), so removing at origTo is exactly equivalent to the original
    // `removePiece(nb, to)`.
    board.clearSquareInPlace(nb, origTo);
  }

  // handle castling: king + rook relocation + rights context all come from the
  // single detectCastling plan (design D2) — no per-site rook scanning left.
  if (plan) {
    board.clearSquareInPlace(nb, plan.rookFrom);
    board.putPieceInPlace(nb, plan.rookTo, { color: pos.turn, role: Role.Rook });
    // place king on destination (to)
    board.putPieceInPlace(nb, to, { color: pos.turn, role: Role.King });
  } else {
    // normal move: place moving piece (with promotion)
    let role = piece.role;
    if (isPromotion && promotion !== undefined && promotion !== null) {
      role = promotion;
    }
    board.putPieceInPlace(nb, to, { color: piece.color, role });
  }
}

export function makeMove(pos: Position, move: Move): Position {
  let from = move.from;
  let to = move.to;
  let piece = board.pieceAt(pos.board, from);
  if (!piece) throw new Error("no piece at from");
  // Single castling detection for BOTH input representations (normalized
  // landing e1g1 and baseline/960 king-captures-rook e1h1) — fixes the defect
  // where `makeMove(pos, {from: king, to: landing})` moved only the king and
  // left the rook behind.
  let isEnPassant = !!move.isEnPassant;
  // Robust ep derivation: a pawn moving DIAGONALLY onto the ep square is an
  // en-passant capture even when the caller did not set the flag (external
  // move objects) — keeps the board edit AND the Zobrist delta correct.
  if (
    !isEnPassant &&
    piece.role === Role.Pawn &&
    pos.epSquare !== null &&
    move.to === pos.epSquare &&
    squareFile(move.from) !== squareFile(move.to)
  ) {
    isEnPassant = true;
  }
  // Single castling detection for BOTH input representations (normalized
  // landing e1g1 and baseline/960 king-captures-rook e1h1) — fixes the defect
  // where `makeMove(pos, {from: king, to: landing})` moved only the king and
  // left the rook behind. detectCastling is the ONLY castling apply path
  // (design D2: no second castling code path); a move explicitly flagged
  // isCastling whose rights no longer support detection is not castling.
  let plan: CastlingPlan | null = null;
  if (piece.role === Role.King) {
    plan = detectCastling(pos, from, to);
  }
  const isCastling = plan !== null;
  if (plan) to = plan.kingTo;
  const isPromotion = !!move.isPromotion || move.promotion !== undefined && move.promotion !== null;
  // Board construction: clone→mutate-clone (spec-sanctioned technique). `nb`
  // is a fresh writable board owned locally and returned as a read-only Board;
  // the input position is never touched, so the observable contract stays pure.
  // The edit sequence itself lives in applyBoardEdits (shared with the
  // hot-loop scratch tester).
  const nb = board.cloneAsWritable(pos.board);
  const captured = computeCaptured(pos, move.to, to, isCastling, piece);
  applyBoardEdits(nb, pos, from, to, move.to, piece, isEnPassant, plan, isPromotion, move.promotion ?? null, captured);

  // handle promotion: pawn must promote if reaching back rank
  // Already handled via move.promotion

  // update castling rights — copy a Set ONLY when it actually changes; the
  // common case (rights unchanged) shares the existing Set reference. This
  // structural sharing is part of the public contract (ADR-012 §4): the
  // library never mutates these sets, and the public CastlingRights type
  // exposes ReadonlySet so callers cannot mutate shared sub-objects through
  // the API either.
  let newWhite: ReadonlySet<number> = pos.castling.white;
  let newBlack: ReadonlySet<number> = pos.castling.black;
  // if king moves, remove all rights for that color — a fresh empty set; no
  // copy of the old one is needed
  if (piece.role === Role.King) {
    if (pos.turn === Color.White) {
      if (newWhite.size > 0) newWhite = new Set<number>();
    } else {
      if (newBlack.size > 0) newBlack = new Set<number>();
    }
  }
  // if rook moves from origin, remove that right (clone → delete on the
  // owned copy — never on the input's set)
  if (piece.role === Role.Rook) {
    if (pos.turn === Color.White) {
      if (newWhite.has(from)) { const next = new Set(newWhite); next.delete(from); newWhite = next; }
    } else {
      if (newBlack.has(from)) { const next = new Set(newBlack); next.delete(from); newBlack = next; }
    }
  }
  // if rook captured on origin, remove opponent right
  if (captured && captured.role === Role.Rook) {
    if (captured.color === Color.White) {
      if (newWhite.has(to)) { const next = new Set(newWhite); next.delete(to); newWhite = next; }
    } else {
      if (newBlack.has(to)) { const next = new Set(newBlack); next.delete(to); newBlack = next; }
    }
  }
  // en passant capture already handled (captured pawn not rook, so no)
  // if rook moved in castling, its origin already removed, but rook destination not relevant

  // en passant square for next position
  let newEp: number | null = null;
  if (piece.role === Role.Pawn && Math.abs(squareRank(to) - squareRank(from)) === 2) {
    // double push
    const epRank = pos.turn === Color.White ? squareRank(from) + 1 : squareRank(from) - 1;
    newEp = epRank * 8 + squareFile(from);
  }

  // halfmove
  const isCapture = !!captured || isEnPassant;
  const isPawnMove = piece.role === Role.Pawn;
  const newHalf = isCapture || isPawnMove ? 0 : (pos.halfmoves ?? pos.halfmove ?? 0) + 1;
  // fullmove
  const newFull = pos.turn === Color.Black ? (pos.fullmoves ?? pos.fullmove ?? 1) + 1 : (pos.fullmoves ?? pos.fullmove ?? 1);

  const newTurn = opposite(pos.turn);
  const newCastling = {
    white: newWhite,
    black: newBlack,
    whiteKing: newWhite.has(7),
    whiteQueen: newWhite.has(0),
    blackKing: newBlack.has(63),
    blackQueen: newBlack.has(56),
  };

  const newPos: Position = {
    board: nb,
    turn: newTurn,
    castling: newCastling,
    epSquare: newEp,
    halfmoves: newHalf,
    fullmoves: newFull,
    halfmove: newHalf,
    fullmove: newFull,
  };
  // Incremental O(1) Zobrist maintenance (design D2). Skipped (positions
  // carry no zobrist fields) until the Polyglot key tables have loaded via
  // ensureZobristLoaded() — the same lazy-loading contract as the magic
  // tables. The input position is never mutated: the key is attached to the
  // freshly built newPos before it escapes.
  if (zobristTablesLoaded()) {
    const zk = zobristAfterMove(pos, move, plan, isEnPassant, captured, newPos);
    (newPos as { zobristLo?: number; zobristHi?: number }).zobristLo = zk.lo;
    (newPos as { zobristLo?: number; zobristHi?: number }).zobristHi = zk.hi;
  }
  return newPos;
}

// alias play
export const play = makeMove;

// ---------- pseudo-legal generation ----------
function pawnPseudoDests(pos: Position, from: number, color: Color): SquareSet {
  // color passed in (genPseudoDests already looked the piece up) and target
  // occupancy tested with raw set membership — zero allocations per target.
  const dir = color === Color.White ? 1 : -1;
  const rank = squareRank(from);
  const file = squareFile(from);
  const occ = pos.board.occupied;
  const whiteOcc = pos.board.white;
  const isWhite = color === Color.White;
  let lo = 0, hi = 0;
  const add = (sqIdx: number) => {
    if (sqIdx < 32) lo |= (1 << sqIdx) >>> 0;
    else hi |= (1 << (sqIdx - 32)) >>> 0;
  };
  // forward one
  const oneRank = rank + dir;
  if (oneRank >= 0 && oneRank < 8) {
    const oneSq = oneRank * 8 + file;
    if (!sq.has(occ, oneSq)) {
      add(oneSq);
      // double from starting rank
      const startRank = color === Color.White ? 1 : 6;
      if (rank === startRank) {
        const twoRank = rank + dir * 2;
        const twoSq = twoRank * 8 + file;
        if (!sq.has(occ, twoSq)) add(twoSq);
      }
    }
  }
  // captures
  for (const df of [-1, 1]) {
    const nf = file + df;
    const nr = rank + dir;
    if (nf < 0 || nf >= 8 || nr < 0 || nr >= 8) continue;
    const capSq = nr * 8 + nf;
    if (sq.has(occ, capSq)) {
      // target color via color-occupancy membership instead of pieceAt object
      if (sq.has(whiteOcc, capSq) !== isWhite) add(capSq);
    } else if (pos.epSquare !== null && capSq === pos.epSquare) {
      // en passant capture destination is epSquare, which is empty but capturable
      add(capSq);
    }
  }
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

function genPseudoDests(pos: Position, from: number): SquareSet {
  const p = board.pieceAt(pos.board, from);
  if (!p || p.color !== pos.turn) return sq.empty();
  const occ = pos.board.occupied;
  const own = p.color === Color.White ? pos.board.white : pos.board.black;
  let pseudo: SquareSet;
  switch (p.role) {
    case Role.Pawn:
      pseudo = pawnPseudoDests(pos, from, p.color);
      break;
    case Role.Knight:
      pseudo = attacks.knightAttacks(from);
      pseudo = sq.minus(pseudo, own);
      break;
    case Role.Bishop:
      pseudo = attacks.bishopAttacks(from, occ);
      pseudo = sq.minus(pseudo, own);
      break;
    case Role.Rook:
      pseudo = attacks.rookAttacks(from, occ);
      pseudo = sq.minus(pseudo, own);
      break;
    case Role.Queen:
      pseudo = attacks.queenAttacks(from, occ);
      pseudo = sq.minus(pseudo, own);
      break;
    case Role.King: {
      pseudo = attacks.kingAttacks(from);
      pseudo = sq.minus(pseudo, own);
      // castling destinations
      const ks = from;
      // `from` IS this color's king square by definition (invariant: exactly
      // one king per color), so no kingSquare lookup is needed here.
      // Conditions to add castling dest: rights exist, between empty, not in check, traversal not attacked
      if (p.color === Color.White) {
        // white castling
        // king-side to G1 (6)
        if (pos.castling.white.size > 0) {
          // find rook(s) for each side, check conditions
          // We'll check each rook square in white set
          for (const rs of pos.castling.white) {
            // The right's rook must actually be on its origin square (guards
            // against stale rights in hand-written FENs).
            const rp = board.pieceAt(pos.board, rs);
            if (!rp || rp.color !== p.color || rp.role !== Role.Rook) continue;
            const rookFile = squareFile(rs);
            const kingFile = squareFile(ks);
            const isKingSide = rookFile > kingFile;
            const dest = rs; // king-captures-rook (ADR-013 as amended)
            // Only generate dest once per side, but if multiple rooks on same side? For now handle
            // Check between empty
            const between = attacks.between(ks, rs);
            if (!sq.isEmpty(sq.and(between, occ)) ) continue;
            // Also need squares between king and dest empty? That's subset of between check? For queen-side, dest C1 is between, but need B1 also empty? Between already covers B1-D1 etc, so ok
            // Check king not in check
            if (isCheck(pos)) continue;
            // Check traversal squares not attacked
            const traversal = isKingSide ? [5, 6] : [3, 2]; // F1,G1 or D1,C1
            let attacked = false;
            for (const t of traversal) {
              if (attacks.isAttacked(pos.board, t, Color.Black)) { attacked = true; break; }
            }
            if (attacked) continue;
            // Also need dest not occupied by own? already filtered via own? But G1/C1 between empty ensures not occupied, but check if dest is occupied by opponent capture? Castling destination should be empty, but could be rook capture? No, destination must be empty per between check. For queen-side, B1 may be occupied but dest C1 must be empty; between includes B1,C1,D1, so if B1 occupied, fails. So okay.
            // Add dest
            const bit = sq.singleton(dest);
            pseudo = sq.or(pseudo, bit);
          }
        }
      } else if (p.color === Color.Black) {
        for (const rs of pos.castling.black) {
          // The right's rook must actually be on its origin square (guards
          // against stale rights in hand-written FENs).
          const rp = board.pieceAt(pos.board, rs);
          if (!rp || rp.color !== p.color || rp.role !== Role.Rook) continue;
          const rookFile = squareFile(rs);
          const kingFile = squareFile(ks);
          const isKingSide = rookFile > kingFile;
          const dest = rs; // king-captures-rook (ADR-013 as amended)
          const between = attacks.between(ks, rs);
          if (!sq.isEmpty(sq.and(between, occ))) continue;
          if (isCheck(pos)) continue;
          const traversal = isKingSide ? [61, 62] : [59, 58];
          let attacked = false;
          for (const t of traversal) {
            if (attacks.isAttacked(pos.board, t, Color.White)) { attacked = true; break; }
          }
          if (attacked) continue;
          pseudo = sq.or(pseudo, sq.singleton(dest));
        }
      }
      break;
    }
    default:
      pseudo = sq.empty();
  }
  return pseudo;
}

// ---------- dests filtered for legality ----------
// ---- Hot-loop scratch (see FP policy in board.ts) ---------------------------
// `destScratch` is owned exclusively by moveLeavesKingSafe, a leaf function:
// while the scratch is live it only calls board/attacks helpers that never
// re-enter movegen, so no re-entrant caller can observe intermediate state.
// The public API remains pure — the scratch never escapes and its state is
// fully rewritten from the input position before each use.
const destScratch: board.WritableBoard = board.newScratchBoard();

/**
 * Hot-loop legality tester: applies the shared board-edit sequence
 * (applyBoardEdits — same code path as makeMove) to the reusable scratch
 * board, then checks whether our king is left attacked. Semantically
 * identical to `makeMove(pos, mv)` + `!isAttacked(our king)`, minus all the
 * per-pseudo-move allocation (Position, Sets, Move object, 3 board spreads).
 * Mutation is sanctioned here per the FP policy: hot loop, locally owned
 * scratch, inputs never mutated.
 */
function moveLeavesKingSafe(
  pos: Position,
  piece: { color: Color; role: Role },
  from: number,
  to: number, // normalized dest
  origTo: number, // move.to before normalization
  isEnPassant: boolean,
  plan: CastlingPlan | null, // non-null ⇒ castling (exact king+rook apply)
  isPromotion: boolean,
  promotion: Role | null,
): boolean {
  board.copyBoardInto(destScratch, pos.board);
  const captured = computeCaptured(pos, origTo, to, plan !== null, piece);
  applyBoardEdits(destScratch, pos, from, to, origTo, piece, isEnPassant, plan, isPromotion, promotion, captured);
  const ksq = board.kingSquare(destScratch, pos.turn);
  if (ksq === undefined) return false;
  return !attacks.isAttacked(destScratch, ksq, opposite(pos.turn));
}

// ---- Per-position check/pin-mask analysis (baseline-style legality) --------
// Computed ONCE per position, then reused for every piece's dests. This
// replaces per-pseudo-move play-and-test for the common cases; the exact
// play-and-test (moveLeavesKingSafe) remains only for the rare trap cases:
// en-passant (double horizontal pawn removal can expose the king along the
// rank) and castling (the rook's landing square can block back-rank attacks
// on the king destination).

type CheckContext = {
  us: Color;
  ksq: number;
  doubleCheck: boolean;
  /** squares that resolve a single check (block or capture); FULL when not in check */
  checkMask: SquareSet;
  /** squares the king may move to (not attacked with our king removed from occupancy) */
  kingSafe: SquareSet;
  /** pinned own piece square → allowed ray (between king and sniper, plus sniper) */
  pinRays: Map<number, SquareSet>;
  /**
   * Castling plans for the side to move (empty when no rights / kingless),
   * computed once per position so the hot loops never re-run detectCastling
   * per king move. Legality is still filtered exactly in destsFast.
   */
  castlingPlans: CastlingPlan[];
};

export type { CheckContext };

// Module-level scratch, sanctioned by the FP policy for hot loops: owned by
// analyzeCheckContext (a leaf — no re-entrant movegen runs while a context is
// live within one dests/allDests/genLegalMoves call) and cleared before every
// use. Never escapes the enclosing call.
const scratchPinRays = new Map<number, SquareSet>();
// Reused castling plan scratch (same ownership discipline): avoids allocating
// two plan objects per analyzed position in the perft/movegen hot loop. The
// referenced position data is read-only and consumed within the same call.
const scratchCastlingPlans: CastlingPlan[] = [];
const scratchCastlingPlanA: CastlingPlan = { side: "king", kingFrom: 0, kingTo: 0, rookFrom: 0, rookTo: 0 };
const scratchCastlingPlanB: CastlingPlan = { side: "king", kingFrom: 0, kingTo: 0, rookFrom: 0, rookTo: 0 };

export function analyzeCheckContext(pos: Position): CheckContext {
  const us = pos.turn;
  const them = opposite(us);
  scratchPinRays.clear();
  const ksq = board.kingSquare(pos.board, us);
  if (ksq === undefined) {
    // degenerate (kingless) position: no pins, no masks
    return { us, ksq: -1, doubleCheck: false, checkMask: sq.FULL, kingSafe: sq.EMPTY, pinRays: scratchPinRays, castlingPlans: [] };
  }
  const ctx: CheckContext = { us, ksq, doubleCheck: false, checkMask: sq.FULL, kingSafe: sq.EMPTY, pinRays: scratchPinRays, castlingPlans: [] };
  // Precompute the position's castling plans once (design D2): the hot loops
  // (destsFast king branch, genLegalMoves) look them up instead of re-running
  // the full detectCastling per king move. Plans are written into the reused
  // scratch array — no allocation in the hot loop.
  ctx.castlingPlans = scratchCastlingPlans;
  ctx.castlingPlans.length = 0;
  const rights = us === Color.White ? pos.castling.white : pos.castling.black;
  if (rights.size > 0) {
    for (const rs of rights) {
      const rp = board.pieceAt(pos.board, rs);
      if (rp && rp.color === us && rp.role === Role.Rook) {
        // write into the preallocated scratch slots — no hot-loop allocation
        const slot = ctx.castlingPlans.length === 0 ? scratchCastlingPlanA : scratchCastlingPlanB;
        const next = castlingPlanFor(us, ksq, rs);
        slot.side = next.side; slot.kingFrom = next.kingFrom; slot.kingTo = next.kingTo;
        slot.rookFrom = next.rookFrom; slot.rookTo = next.rookTo;
        ctx.castlingPlans.push(slot);
      }
    }
  }
  const checkers = attacks.kingAttackers(pos.board, us);
  const nCheckers = sq.popcount(checkers);
  if (nCheckers === 1) {
    const c = sq.first(checkers)!;
    ctx.checkMask = sq.or(attacks.between(ksq, c), sq.singleton(c));
  } else if (nCheckers >= 2) {
    ctx.doubleCheck = true;
  }
  // Pinned pieces: enemy slider "snipers" x-raying our king with exactly one
  // blocker between; if the blocker is ours, it is pinned to the sniper's ray.
  const themOcc = them === Color.White ? pos.board.white : pos.board.black;
  const themBQ = sq.or(sq.and(themOcc, pos.board.bishop), sq.and(themOcc, pos.board.queen));
  const themRQ = sq.or(sq.and(themOcc, pos.board.rook), sq.and(themOcc, pos.board.queen));
  const noOcc = sq.EMPTY;
  const snipers = sq.or(
    sq.and(themRQ, attacks.rookAttacks(ksq, noOcc)),
    sq.and(themBQ, attacks.bishopAttacks(ksq, noOcc)),
  );
  for (const sniper of sq.iter(snipers)) {
    const b = attacks.between(ksq, sniper);
    const blockers = sq.and(b, pos.board.occupied);
    if (sq.popcount(blockers) !== 1) continue;
    const blockerSq = sq.first(blockers)!;
    if (sq.has(themOcc, blockerSq)) continue; // enemy blocker: not a pin
    scratchPinRays.set(blockerSq, sq.or(b, sq.singleton(sniper)));
  }
  // King-safe mask: attackedness evaluated with our king removed from the
  // occupancy, so sliders x-raying the king keep it attacked on the far side.
  const occWithoutKing = sq.minus(pos.board.occupied, sq.singleton(ksq));
  const usOcc = us === Color.White ? pos.board.white : pos.board.black;
  let kingLo = 0, kingHi = 0;
  sq.forEachSquare(attacks.kingAttacks(ksq), (d) => {
    if (sq.has(usOcc, d)) return;
    if (sq.isEmpty(attacks.attackersTo(pos.board, d, them, occWithoutKing))) {
      if (d < 32) kingLo |= (1 << d) >>> 0;
      else kingHi |= (1 << (d - 32)) >>> 0;
    }
  });
  ctx.kingSafe = { lo: kingLo >>> 0, hi: kingHi >>> 0 };
  return ctx;
}
/**
 * dests for one piece, given the per-position CheckContext. Legality is a
 * pure set intersection for all cases except the trap cases listed above.
 */
export function destsFast(pos: Position, from: number, piece: { color: Color; role: Role }, ctx: CheckContext): SquareSet {
  const pseudo = genPseudoDests(pos, from);
  if (sq.isEmpty(pseudo)) return pseudo;
  if (piece.role === Role.King) {
    // Castling dests (detected by the shared detectCastling path — fixes the
    // defect where ANY king move to {6,2,62,58} was treated as castling while
    // ANY color held rights, corrupting the scratch board via fallback rook
    // placement) keep the exact play-and-test semantics; other king dests come
    // from the precomputed king-safe mask.
    let lo = 0, hi = 0;
    const plans = ctx.castlingPlans;
    sq.forEachSquare(pseudo, (to) => {
      // Castling dests (precomputed per-position plans — the shared
      // detectCastling semantics, without the per-move cost) keep the exact
      // play-and-test semantics; other king dests come from the precomputed
      // king-safe mask.
      const plan = planForDest(plans, to);
      if (plan) {
        if (moveLeavesKingSafe(pos, piece, from, plan.kingTo, to, false, plan, false, null)) {
          if (to < 32) lo |= (1 << to) >>> 0;
          else hi |= (1 << (to - 32)) >>> 0;
        }
      } else if (sq.has(ctx.kingSafe, to)) {
        if (to < 32) lo |= (1 << to) >>> 0;
        else hi |= (1 << (to - 32)) >>> 0;
      }
    });
    return { lo: lo >>> 0, hi: hi >>> 0 };
  }
  // Any single non-king move can never resolve a double check.
  if (ctx.doubleCheck) return { lo: 0, hi: 0 };
  let nonEp = pseudo;
  let epLegal = false;
  const epSquare = pos.epSquare;
  if (piece.role === Role.Pawn && epSquare !== null && sq.has(pseudo, epSquare)) {
    nonEp = sq.minus(pseudo, sq.singleton(epSquare));
    epLegal = moveLeavesKingSafe(pos, piece, from, epSquare, epSquare, true, null, false, null);
  }
  let result = sq.and(nonEp, ctx.checkMask);
  const pin = ctx.pinRays.get(from);
  if (pin) result = sq.and(result, pin);
  if (epLegal && epSquare !== null) result = sq.or(result, sq.singleton(epSquare));
  return result;
}

export function dests(pos: Position, from: number): SquareSet {
  const piece = board.pieceAt(pos.board, from);
  if (!piece) return { lo: 0, hi: 0 };
  return destsFast(pos, from, piece, analyzeCheckContext(pos));
}

export function allDests(pos: Position): Map<number, SquareSet> {
  const m = new Map<number, SquareSet>();
  const ctx = analyzeCheckContext(pos);
  const own = pos.turn === Color.White ? pos.board.white : pos.board.black;
  sq.forEachSquare(own, (sqIdx) => {
    const piece = board.pieceAt(pos.board, sqIdx);
    if (!piece) return;
    const d = destsFast(pos, sqIdx, piece, ctx);
    if (!sq.isEmpty(d)) m.set(sqIdx, d);
  });
  return m;
}

export function isLegal(pos: Position, move: Move): boolean {
  // Single castling path (design D2): both the normalized (e1g1) and the
  // baseline/960 (e1h1) input forms resolve through detectCastling.
  const castling = detectCastling(pos, move.from, move.to);
  if (castling) {
    const d = dests(pos, move.from);
    // dests emits the rook-square representation (ADR-013 as amended); the
    // normalized e1g1 input form is accepted via the plan's rook square.
    return sq.has(d, castling.rookFrom);
  }
  const piece = board.pieceAt(pos.board, move.from);
  const to = move.to;
  const d = dests(pos, move.from);
  if (!sq.has(d, to)) return false;
  if (piece && piece.role === Role.Pawn) {
    const destRank = squareRank(to);
    const isPromoRank = (piece.color === Color.White && destRank === 7) || (piece.color === Color.Black && destRank === 0);
    if (isPromoRank && !move.promotion) return false;
  }
  return true;
}

// helpers for checkmate/stalemate
function hasAnyLegalMove(pos: Position): boolean {
  const own = pos.turn === Color.White ? pos.board.white : pos.board.black;
  for (const from of sq.iter(own)) {
    const d = dests(pos, from);
    if (!sq.isEmpty(d)) return true;
  }
  return false;
}

export function isCheckmate(pos: Position): boolean {
  return isCheck(pos) && !hasAnyLegalMove(pos);
}
export function isStalemate(pos: Position): boolean {
  return !isCheck(pos) && !hasAnyLegalMove(pos);
}

// ---------- perft ----------
export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  if (depth === 1) {
    return countLegalMoves(pos);
  }
  let nodes = 0;
  const moves = genLegalMoves(pos);
  for (const m of moves) {
    const next = makeMove(pos, m);
    nodes += perft(next, depth - 1);
  }
  return nodes;
}

function countLegalMoves(pos: Position): number {
  let count = 0;
  const ctx = analyzeCheckContext(pos);
  const own = pos.turn === Color.White ? pos.board.white : pos.board.black;
  const isWhite = pos.turn === Color.White;
  let ownLo = own.lo >>> 0, ownHi = own.hi >>> 0;
  while (ownLo !== 0 || ownHi !== 0) {
    let from: number;
    if (ownLo !== 0) {
      const lsb = (ownLo & -ownLo) >>> 0;
      from = 31 - Math.clz32(lsb);
      ownLo ^= lsb;
    } else {
      const lsb = (ownHi & -ownHi) >>> 0;
      from = 32 + (31 - Math.clz32(lsb));
      ownHi ^= lsb;
    }
    const piece = board.pieceAt(pos.board, from);
    if (!piece) continue;
    if (piece.role !== Role.King && ctx.doubleCheck) continue;
    const legal = destsFast(pos, from, piece, ctx);
    if (legal.lo === 0 && legal.hi === 0) continue;
    if (piece.role === Role.Pawn) {
      let lo = legal.lo >>> 0, hi = legal.hi >>> 0;
      while (lo !== 0 || hi !== 0) {
        let to: number;
        if (lo !== 0) {
          const lsb = (lo & -lo) >>> 0;
          to = 31 - Math.clz32(lsb);
          lo ^= lsb;
        } else {
          const lsb = (hi & -hi) >>> 0;
          to = 32 + (31 - Math.clz32(lsb));
          hi ^= lsb;
        }
        const destRank = to >> 3;
        if ((isWhite && destRank === 7) || (!isWhite && destRank === 0)) {
          count += 4;
        } else {
          count += 1;
        }
      }
    } else {
      count += sq.popcount(legal);
    }
  }
  return count;
}

// Promotion pieces in generation order (hoisted module constant — the old
// per-call array literal allocated on every promotion move in the hot loop).
const PROMO_ROLES: Role[] = [Role.Queen, Role.Rook, Role.Bishop, Role.Knight];

function genLegalMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  // Per-position check/pin-mask analysis replaces the per-move play-and-test;
  // only ep (validated inside destsFast) keeps exact semantics.
  const ctx = analyzeCheckContext(pos);
  const own = pos.turn === Color.White ? pos.board.white : pos.board.black;
  // Direct LSB bit iteration (ascending square order, same as forEachSquare)
  // — no closure allocation per piece in this hot loop.
  const plans = ctx.castlingPlans;
  const isWhite = pos.turn === Color.White;
  let ownLo = own.lo >>> 0, ownHi = own.hi >>> 0;
  while (ownLo !== 0 || ownHi !== 0) {
    let from: number;
    if (ownLo !== 0) {
      const lsb = (ownLo & -ownLo) >>> 0;
      from = 31 - Math.clz32(lsb);
      ownLo ^= lsb;
    } else {
      const lsb = (ownHi & -ownHi) >>> 0;
      from = 32 + (31 - Math.clz32(lsb));
      ownHi ^= lsb;
    }
    const piece = board.pieceAt(pos.board, from);
    if (!piece) continue;
    // A non-king move can never resolve a double check.
    if (piece.role !== Role.King && ctx.doubleCheck) continue;
    const legal = destsFast(pos, from, piece, ctx);
    const isPawn = piece.role === Role.Pawn;
    const isKing = piece.role === Role.King;
    let lo = legal.lo >>> 0, hi = legal.hi >>> 0;
    while (lo !== 0 || hi !== 0) {
      let to: number;
      if (lo !== 0) {
        const lsb = (lo & -lo) >>> 0;
        to = 31 - Math.clz32(lsb);
        lo ^= lsb;
      } else {
        const lsb = (hi & -hi) >>> 0;
        to = 32 + (31 - Math.clz32(lsb));
        hi ^= lsb;
      }
      const destRank = to >> 3;
      if (isPawn && ((isWhite && destRank === 7) || (!isWhite && destRank === 0))) {
        // generate 4 promotions (legality is promotion-independent: every
        // promoted piece lands on the same square, so king safety is identical)
        for (const promo of PROMO_ROLES) {
          // promotion capture can't be en passant (ep rank not back rank)
          moves.push({ from, to, promotion: promo, isPromotion: true, isEnPassant: false, isCastling: false });
        }
      } else {
        // determine flags
        let isEnPassant = false;
        let isCastling = false;
        if (isPawn && pos.epSquare !== null && to === pos.epSquare) {
          // check if pawn capture to ep square
          const fileDiff = Math.abs((to & 7) - (from & 7));
          const dir = isWhite ? 1 : -1;
          if (fileDiff === 1 && destRank - (from >> 3) === dir) isEnPassant = true;
        } else if (isKing && plans.length > 0) {
          // Precomputed per-position plans (design D2) — replaces the old
          // dest-matches-a-right heuristic, which flagged ordinary king steps
          // to {6,2,62,58} as castling whenever any color held rights.
          isCastling = planForDest(plans, to) !== null;
        }
        // Legality is already guaranteed by destsFast (exact play-and-test for
        // the ep/castling trap cases, check/pin masks otherwise) — no re-test.
        moves.push({ from, to, promotion: null, isEnPassant, isCastling, isPromotion: false });
      }
    }
  }
  return moves;
}


// Promotion pieces in generation order (hoisted module constant — the old
// per-call array literal allocated on every promotion move in the hot loop).
export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Deterministic unique 2-char node id (same alphabet/contract the
// workstation's `createUniqueMoveNodeId` relies on — mirrors chesstree.ts).
const TREE_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function nextTreeNodeId(siblings: TreeNode[]): string {
  const used = new Set(siblings.map((x) => x.id));
  for (const first of TREE_ID_ALPHABET) {
    for (const second of TREE_ID_ALPHABET) {
      const id = first + second;
      if (!used.has(id)) return id;
    }
  }
  return "zz";
}

/** Baseline-style color name. */
export type ColorName = "w" | "b";
/** Baseline-style piece type char. */
export type PieceChar = "p" | "n" | "b" | "r" | "q" | "k";

/** Verbose move object (chessjs-consumer `Move` shape). */
export type VerboseMove = {
  color: ColorName;
  from: string;
  to: string;
  piece: PieceChar;
  captured?: PieceChar;
  promotion?: PieceChar;
  flags: string;
  san: string;
  lan: string;
  before: string;
  after: string;
};

const ROLE_CHARS: Record<number, PieceChar> = {
  0: "p", 1: "n", 2: "b", 3: "r", 4: "q", 5: "k",
};

const PROMO_ORDER = [4, 3, 2, 1]; // Role.Queen, Role.Rook, Role.Bishop, Role.Knight

function colorName(turn: Color): ColorName {
  return turn === Color.White ? "w" : "b";
}

type HistoryEntry = { before: Position; after: Position; move: Move; san: string };

/** Ascending square iteration over a {lo,hi} pair. */
function* iterSet(set: { lo: number; hi: number }): Generator<number> {
  let lo = set.lo >>> 0;
  let hi = set.hi >>> 0;
  while (lo !== 0) {
    const lsb = (lo & -lo) >>> 0;
    yield 31 - Math.clz32(lsb);
    lo ^= lsb;
  }
  while (hi !== 0) {
    const lsb = (hi & -hi) >>> 0;
    yield 32 + (31 - Math.clz32(lsb));
    hi ^= lsb;
  }
}

/** Expands pawn back-rank destinations into the four promotions. */
function buildMoves(pos: Position, role: number, from: number, to: number): Move[] {
  const toRank = to >> 3;
  if (role === 0 && (toRank === 7 || toRank === 0)) {
    return PROMO_ORDER.map((promotion) => ({
      from,
      to,
      promotion: promotion as Role,
      isPromotion: true,
      isEnPassant: false,
      isCastling: false,
    }));
  }
  const isEp =
    role === 0 &&
    pos.epSquare !== null &&
    to === pos.epSquare &&
    (to & 7) !== (from & 7);
  const isCastling = role === 5 ? detectCastling(pos, from, to) !== null : false;
  return [{ from, to, promotion: null, isPromotion: false, isEnPassant: isEp, isCastling }];
}

function parseFullmove(fen: string): number {
  const fields = fen.split(/\s+/);
  const n = Number(fields[5]);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** True when a LEGAL en passant capture onto `pos.epSquare` exists. */
function hasLegalEpCapture(pos: Position): boolean {
  const ep = pos.epSquare;
  if (ep === null || ep === undefined) return false;
  for (const [from, set] of allDests(pos)) {
    if ((from & 7) === (ep & 7)) continue; // ep capture is diagonal
    const p = pieceAt(pos.board, from);
    if (!p || p.role !== 0) continue;
    for (const to of iterSet(set)) {
      if (to === ep) return true; // allDests is fully legal, no re-test needed
    }
  }
  return false;
}

/**
 * Unified root `Chess` (design D1): the chess.js-ergonomic mutable façade
 * over the immutable engine core, extended with the high-performance
 * bitboard surface, zero-alloc Zobrist hashing and 16-bit packed moves2, and
 * native tree navigation. Lives at the ROOT entrypoint so the tree-shakeable
 * `turbochess/core` graph stays free of FEN/PGN/tree facade code.
 */
export class Chess {
  #startFen: string;
  #history: HistoryEntry[] = [];

  #pos: Position;

  constructor(fen: string | Position = INITIAL_FEN) {
    if (typeof fen === "string") {
      const r = parseFen(fen);
      if (!r.ok) throw new Error(`Invalid FEN: ${fen}`);
      this.#pos = r.value;
    } else {
      this.#pos = fen;
    }
    this.#startFen = this.#fenOf(this.#pos);
  }

  /** Replaces the current position (throws on an invalid FEN). */
  load(fen: string): void {
    const r = parseFen(fen);
    if (!r.ok) throw new Error(`Invalid FEN: ${fen}`);
    this.#pos = r.value;
    this.#startFen = this.#fenOf(r.value);
    this.#history = [];
  }

  /** Resets to the initial position and clears history. */
  reset(): void {
    this.load(INITIAL_FEN);
  }

  /** Current FEN (byte-identical to the engine's makeFen modulo ep filtering). */
  fen(): string {
    return this.#fenOf(this.#pos);
  }

  /** Side to move: "w" | "b". */
  turn(): ColorName {
    return colorName(this.#pos.turn);
  }

  /** Current fullmove number (starts at 1). */
  moveNumber(): number {
    return this.#pos.fullmoves ?? this.#pos.fullmove ?? 1;
  }

  /**
   * Plays a move given as SAN (tolerant: `+`/`#` suffixes, `x` on quiet moves,
   * `0-0`/`O-O`), as UCI (`e2e4`, `e7e8q`), or as a {from,to,promotion?}
   * object. Returns the verbose move, or null when the move is illegal.
   */
  move(input: string | { from: string; to: string; promotion?: string }): VerboseMove | null {
    const pos = this.#pos;
    let mv: Move | null = null;
    if (typeof input === "string") {
      const sanRes = parseSan(input, pos);
      if (sanRes.ok) {
        mv = sanRes.value;
      } else {
        const uciRes = parseUci(input);
        if (uciRes.ok && isLegal(pos, uciRes.value)) mv = uciRes.value;
      }
    } else {
      const from = parseSquare(input.from);
      const to = parseSquare(input.to);
      if (from !== undefined && to !== undefined) {
        const piece = pieceAt(pos.board, from);
        const promotion = input.promotion
          ? ({ q: 4, r: 3, b: 2, n: 1 } as Record<string, Role>)[input.promotion.toLowerCase()]
          : undefined;
        for (const cand of buildMoves(pos, piece ? piece.role : -1, from, to)) {
          if (cand.promotion !== null && cand.promotion !== undefined && promotion !== undefined && cand.promotion !== promotion) continue;
          if (isLegal(pos, cand)) { mv = cand; break; }
        }
      }
    }
    if (!mv) return null;
    const san = makeSan(mv, pos);
    const after = makeMove(pos, mv);
    this.#pos = after;
    this.#history.push({ before: pos, after, move: mv, san });
    return this.#describe(pos, mv, after, san);
  }

  /**
   * Legal moves. Default: SAN strings. `{ verbose: true }`: VerboseMove[]
   * (shape-compatible with the chessjs consumer baseline). `{ square }`
   * filters by origin square ("e2").
   */
  moves(options: { square?: string; verbose: true }): VerboseMove[];
  moves(options?: { square?: string; verbose?: false }): string[];
  moves(options?: { square?: string; verbose?: boolean }): string[] | VerboseMove[] {
    const pos = this.#pos;
    const out: (string | VerboseMove)[] = [];
    const emit = (from: number, set: { lo: number; hi: number }) => {
      const piece = pieceAt(pos.board, from);
      if (!piece) return;
      for (const to of iterSet(set)) {
        for (const mv of buildMoves(pos, piece.role, from, to)) {
          const san = makeSan(mv, pos);
          if (options?.verbose) out.push(this.#describe(pos, mv, makeMove(pos, mv), san));
          else out.push(san);
        }
      }
    };
    if (options?.square !== undefined) {
      const sqIdx = parseSquare(options.square);
      if (sqIdx === undefined) return [];
      emit(sqIdx, dests(pos, sqIdx));
    } else {
      for (const [from, set] of allDests(pos)) emit(from, set);
    }
    return out as string[] | VerboseMove[];
  }

  /** SAN history by default; `{ verbose: true }` for full move objects. */
  history(options: { verbose: true }): VerboseMove[];
  history(options?: { verbose?: false }): string[];
  history(options?: { verbose?: boolean }): string[] | VerboseMove[] {
    if (options?.verbose) {
      return this.#history.map((h) => this.#describe(h.before, h.move, h.after, h.san));
    }
    return this.#history.map((h) => h.san);
  }

  /** Reverts the last move; returns it in verbose shape, or null if none. */
  undo(): VerboseMove | null {
    const last = this.#history.pop();
    if (!last) return null;
    this.#pos = last.before;
    return this.#describe(last.before, last.move, last.after, last.san);
  }

  isCheck(): boolean { return isCheck(this.#pos); }
  isCheckmate(): boolean { return isCheckmate(this.#pos); }
  isStalemate(): boolean { return isStalemate(this.#pos); }

  /** Draw by insufficient material, the fifty-move rule, or threefold repetition. */
  isDraw(): boolean {
    if (isInsufficientMaterial(this.#pos)) return true;
    if (isFiftyMoveDraw(this.#pos)) return true;
    if (isThreefoldRepetition(this.#positions())) return true;
    return false;
  }

  /** Draw by the fifty-move rule. */
  isDrawByFiftyMoves(): boolean { return isFiftyMoveDraw(this.#pos); }

  /** Draw by insufficient material. */
  isInsufficientMaterial(): boolean { return isInsufficientMaterial(this.#pos); }

  /** Draw by threefold repetition over the game's position history. */
  isThreefoldRepetition(): boolean { return isThreefoldRepetition(this.#positions()); }

  /** Game over: checkmate, stalemate, or draw. */
  isGameOver(): boolean { return this.isCheckmate() || this.isStalemate() || this.isDraw(); }

  /** Piece on a square ("e2"), or undefined. */
  get(square: string): { type: PieceChar; color: ColorName } | undefined {
    const sqIdx = parseSquare(square);
    if (sqIdx === undefined) return undefined;
    const p = pieceAt(this.#pos.board, sqIdx);
    if (!p) return undefined;
    return { type: ROLE_CHARS[p.role], color: colorName(p.color) };
  }

  /** 8x8 board, rank 8 first; null on empty squares. */
  board(): ({ square: string; type: PieceChar; color: ColorName } | null)[][] {
    const rows: ({ square: string; type: PieceChar; color: ColorName } | null)[][] = [];
    for (let rank = 7; rank >= 0; rank--) {
      const row: ({ square: string; type: PieceChar; color: ColorName } | null)[] = [];
      for (let file = 0; file < 8; file++) {
        const sqIdx = rank * 8 + file;
        const p = pieceAt(this.#pos.board, sqIdx);
        row.push(p ? { square: squareName(sqIdx), type: ROLE_CHARS[p.role], color: colorName(p.color) } : null);
      }
      rows.push(row);
    }
    return rows;
  }

  /** "light" | "dark" square color ("a1" is light, like the consumer baseline). */
  squareColor(square: string): "light" | "dark" | undefined {
    const sqIdx = parseSquare(square);
    if (sqIdx === undefined) return undefined;
    return (((sqIdx & 7) + (sqIdx >> 3)) & 1) === 0 ? "light" : "dark";
  }

  /** PGN: Seven Tag Roster defaults, FEN/SetUp for non-default starts, numbered movetext. */
  pgn(): string {
    const headers = new Map<string, string>([
      ["Event", "?"],
      ["Site", "?"],
      ["Date", "????.??.??"],
      ["Round", "?"],
      ["White", "?"],
      ["Black", "?"],
      ["Result", "*"],
    ]);
    if (this.#startFen !== INITIAL_FEN) {
      headers.set("SetUp", "1");
      headers.set("FEN", this.#startFen);
    }
    let out = "";
    for (const [k, v] of headers) out += `[${k} "${v}"]\n`;
    out += "\n";
    out += this.#movetext();
    return out;
  }

  // ---- unified high-performance surface (design D1) ----

  /** Legal destinations for one square ("e2" or index). */
  dests(square: string | number): SquareSet {
    const sqIdx = typeof square === "number" ? square : parseSquare(square);
    if (sqIdx === undefined) return { lo: 0, hi: 0 };
    return dests(this.#pos, sqIdx);
  }

  /** Legal destinations for every piece of the side to move. */
  allDests(): Map<number, SquareSet> { return allDests(this.#pos); }

  /** True when `move` is legal in the current position. */
  isLegal(move: Move): boolean { return isLegal(this.#pos, move); }

  /** Genuine recursive perft node count (no shortcuts). */
  perft(depth: number): number { return perft(this.#pos, depth); }

  /** Applies an engine move in place (immutable core stays pure underneath). */
  play(move: Move): this {
    const san = makeSan(move, this.#pos);
    const after = makeMove(this.#pos, move);
    this.#pos = after;
    this.#history.push({ before: this.#pos, after, move, san });
    return this;
  }

  /** Current 64-bit Zobrist key (zero-BigInt {lo, hi} halves). */
  zobrist(): ZobristKey {
    if (this.#pos.zobristLo !== undefined && this.#pos.zobristHi !== undefined) {
      return { lo: this.#pos.zobristLo >>> 0, hi: this.#pos.zobristHi >>> 0 };
    }
    return calculateZobrist(this.#pos);
  }

  /** Current Zobrist key as 16 zero-padded hex digits (hi first). */
  zobristHex(): string { return zobristHex(this.zobrist()); }

  /** Packs the game's move history into a 16-bit moves2 stream. */
  toMoves2(): Uint16Array {
    const words = new Uint16Array(this.#history.length);
    for (let i = 0; i < this.#history.length; i++) words[i] = packOf(this.#history[i].move);
    return words;
  }

  /** Replays a moves2 stream (Uint16Array or little-endian Uint8Array) in place. */
  loadMoves2(buffer: Uint16Array | Uint8Array, startFen: string = INITIAL_FEN): void {
    this.load(startFen);
    this.#startFen = startFen;
    for (const mv of packedToMoves(buffer)) {
      if (!isLegal(this.#pos, mv)) throw new Error(`moves2 replay: illegal move ${mv.from}->${mv.to}`);
      this.play(mv);
    }
  }

  /** Builds a Chess game from a moves2 stream (startpos, or a custom start FEN). */
  static fromMoves2(buffer: Uint16Array | Uint8Array, startFen: string = INITIAL_FEN): Chess {
    const game = new Chess(startFen);
    game.loadMoves2(buffer, startFen);
    return game;
  }

  /** Wraps an arbitrary engine Setup. */
  static fromSetup(setup: Setup): Chess {
    return new Chess(setup as Position);
  }

  /** Fresh game from the standard initial position. */
  static default(): Chess {
    return new Chess(INITIAL_FEN);
  }

  /** FEN the game started from (for tree roots / PGN headers). */
  get startFen(): string { return this.#startFen; }

  /** Live engine position (read-only view over the internal state). */
  get pos(): Position { return this.#pos; }

  /** Internal history log (read-only view; used by toTree). */
  get historyEntries(): readonly HistoryEntry[] { return this.#history; }

  /**
   * Exports the live game as a chesstree wrapper: recursive variation
   * navigation (`nodeAtPath`, `getNodeList`, `addNode`, `setCommentAt`, …)
   * and full recursive PGN rendering via `tree.pgn()`.
   */
  toTree(): TreeWrapper {
    if (!_treeDriver) {
      throw new Error("toTree() requires importing turbochess root or turbochess/chesstree");
    }
    const root: TreeNode = { id: "", ply: 0, fen: this.#startFen, uci: "", children: [] };
    let ply = 0;
    let node = root;
    for (const h of this.#history) {
      const child: TreeNode = {
        id: nextTreeNodeId(node.children),
        ply: ++ply,
        san: h.san,
        fen: makeFen(h.after),
        uci: makeUci(h.move),
        children: [],
      };
      node.children.push(child);
      node = child;
    }
    return _treeDriver.build(root);
  }

  /**
   * Imports a PGN (headers + recursive variations), loads the mainline into
   * this game, and returns the analysis tree wrapper.
   */
  loadTree(pgn: string): TreeWrapper {
    if (!_treeDriver) {
      throw new Error("loadTree() requires importing turbochess root or turbochess/chesstree");
    }
    const data = _treeDriver.pgnImport(pgn);
    const root = data.treeParts[0];
    this.reset();
    if (root && root.fen && root.fen !== INITIAL_FEN) {
      const r = parseFen(root.fen);
      if (r.ok) this.load(root.fen);
    }
    let node: TreeNode | undefined = root?.children[0];
    while (node) {
      if (node.san) this.move(node.san);
      node = node.children[0];
    }
    return _treeDriver.build(root ?? { id: "", ply: 0, fen: INITIAL_FEN, uci: "", children: [] });
  }

  #movetext(): string {
    const sans = this.#history.map((h) => h.san);
    let fullmove = parseFullmove(this.#startFen);
    const blackToStart = this.#startFen.split(/\s+/)[1] === "b";
    let s = "";
    let ply = 0;
    if (blackToStart && sans.length > 0) {
      s += `${fullmove}... ${sans[0]} `;
      ply = 1;
      fullmove++;
    }
    while (ply < sans.length) {
      s += `${fullmove}. ${sans[ply]} `;
      ply++;
      if (ply < sans.length) {
        s += `${sans[ply]} `;
        ply++;
      }
      fullmove++;
    }
    s = s.trimEnd();
    return s + (s ? " " : "") + "*";
  }

  #positions(): Position[] {
    const out: Position[] = [];
    if (this.#history.length > 0) out.push(this.#history[0].before);
    for (const h of this.#history) out.push(h.after);
    return out;
  }

  #describe(pos: Position, mv: Move, after: Position, san: string): VerboseMove {
    const piece = pieceAt(pos.board, mv.from);
    if (!piece) throw new Error("corrupt move: missing origin piece");
    const target = pieceAt(pos.board, mv.to);
    const isEp =
      !!mv.isEnPassant ||
      (piece.role === 0 && pos.epSquare !== null && mv.to === pos.epSquare && (mv.to & 7) !== (mv.from & 7));
    const isCapture = !!target && target.color !== pos.turn && !isEp;
    const isDoublePush = piece.role === 0 && Math.abs((mv.to >> 3) - (mv.from >> 3)) === 2;
    let castlingKingside: boolean | null = null;
    if (mv.isCastling) {
      const plan = detectCastling(pos, mv.from, mv.to);
      castlingKingside = plan ? plan.side === "king" : (mv.to & 7) === 6;
    }
    // Baseline flag semantics: castling is exclusively "k"/"q"; otherwise one
    // base flag — "e" (en passant), "c" (capture), "b" (double pawn push) or
    // "n" (quiet) — plus "p" appended for promotions ("np"/"cp").
    const flags: string[] = [];
    if (castlingKingside !== null) {
      flags.push(castlingKingside ? "k" : "q");
    } else {
      if (isEp) flags.push("e");
      else if (isCapture) flags.push("c");
      else if (isDoublePush) flags.push("b");
      else flags.push("n");
      if (mv.promotion) flags.push("p");
    }
    // consumer-baseline parity: castling reports the king's landing square
    // ("e1g1") for both `to` and `lan`, not the engine's rook-capture form
    const landingSq = castlingKingside !== null ? (mv.from >> 3) * 8 + (castlingKingside ? 6 : 2) : null;
    const lan = landingSq !== null ? squareName(mv.from) + squareName(landingSq) : makeUci(mv);
    const out: VerboseMove = {
      color: colorName(pos.turn),
      from: squareName(mv.from),
      to: landingSq !== null ? squareName(landingSq) : squareName(mv.to),
      piece: ROLE_CHARS[piece.role],
      flags: flags.join(""),
      san,
      lan,
      before: this.#fenOf(pos),
      after: this.#fenOf(after),
    };
    if (isCapture || isEp) out.captured = isEp || !target ? "p" : ROLE_CHARS[target.role];
    if (mv.promotion) out.promotion = ROLE_CHARS[mv.promotion];
    return out;
  }

  /**
   * FEN with consumer-baseline ep semantics: the ep square is emitted only
   * when a LEGAL en passant capture exists (pseudo-legal-but-pinned captures
   * are suppressed). The core makeFen keeps the raw ep square
   * (engine-compatible); the chessjs-facing surface filters it.
   */
  #fenOf(pos: Position): string {
    const fen = makeFen(pos);
    const ep = pos.epSquare;
    if (ep === null || ep === undefined) return fen;
    const fields = fen.split(" ");
    if (fields[3] !== squareName(ep)) return fen; // engine already suppressed it
    if (!hasLegalEpCapture(pos)) {
      fields[3] = "-";
    }
    return fields.join(" ");
  }
}
