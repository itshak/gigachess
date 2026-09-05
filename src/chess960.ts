// src/chess960.ts — Chess960 (Fischer Random) support, X-FEN/Shredder dual
// MIT gigachess, clean-room from specs + FIDE notes (no G P L)
// Re-uses core chess.ts logic which already handles 960 castling via generic rook sets

import * as chess from "./chess.js";
import type { Setup } from "./types.js";
import { Color } from "./types.js";
export { dests, allDests, isCheck, isCheckmate, isStalemate, perft, makeMove } from "./chess.js";

// Chess960 position is same as Setup but with chess960 flag handling for FEN
// Provide helper to create Chess960 position with 960 castling parsing already done via fen.ts

export class Chess960 extends chess.Chess {
  // Inherits all; ensure castling handling uses 960 rook sets already
  // Additional helper for 960-specific perft that matches python-chess with chess960=True
  static fromSetup(setup: Setup): Chess960 {
    return new Chess960(setup);
  }
}

// Re-export isCheck etc with same semantics
export const isCheck960 = chess.isCheck;
export const isCheckmate960 = chess.isCheckmate;
export const perft960 = chess.perft;
