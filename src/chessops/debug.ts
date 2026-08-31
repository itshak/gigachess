// src/chessops/debug.ts — chessops-exact debug helpers (ADR-014).
import type { Position } from "./chess.js";
import type { Board } from "./board.js";
import type { SquareSet } from "./squareSet.js";
import type { Move, Piece, Square } from "./types.js";
import { makeSquare, roleToChar } from "./util.js";

export const squareSet = (squares: SquareSet): string => [...squares].map(makeSquare).join(", ");

export const piece = (p: Piece): string => `${p.color} ${p.role}`;

export const board = (b: Board): string => {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = `${rank + 1} `;
    for (let file = 0; file < 8; file++) {
      const p = b.get(rank * 8 + file);
      row += p ? `${p.color === "white" ? roleToChar(p.role).toUpperCase() : roleToChar(p.role)} ` : ". ";
    }
    rows.push(row);
  }
  return rows.join("\n") + "\n  a b c d e f g h";
};

export const square = (sq: Square): string => makeSquare(sq);

export const dests = (d: Map<Square, SquareSet>): string =>
  [...d.entries()].map(([from, set]) => `${makeSquare(from)}: ${[...set].map(makeSquare).join(" ")}`).join("\n");

export const perft = (pos: Position, depth: number, log = false): number => {
  if (depth === 0) return 1;
  if (depth === 1) {
    let n = 0;
    for (const [from, set] of pos.allDests()) {
      const piece = pos.board.get(from);
      for (const to of set) {
        // pawn moves to the backrank expand into 4 promotions
        n += piece?.role === "pawn" && (to >= 56 || to < 8) ? 4 : 1;
      }
    }
    return n;
  }
  let nodes = 0;
  for (const [from, set] of pos.allDests()) {
    const piece = pos.board.get(from);
    for (const to of set) {
      const moves: Move[] =
        piece?.role === "pawn" && (to >= 56 || to < 8)
          ? (["queen", "rook", "bishop", "knight"] as const).map((promotion) => ({ from, to, promotion }))
          : [{ from, to }];
      for (const move of moves) {
        const child = pos.clone();
        child.play(move);
        const count = perft(child, depth - 1);
        nodes += count;
        if (log) console.log(makeSquare(from) + makeSquare(to) + ("promotion" in move ? move.promotion! : "") + ": " + count);
      }
    }
  }
  return nodes;
};
