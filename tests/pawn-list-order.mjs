import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Board } from "../dist/board.js";
import { legalMovesInto } from "../dist/chess.js";
const reference = JSON.parse(readFileSync(new URL("./data/pawn-list-order-v1.json", import.meta.url), "utf8"));
let positions = 0;
for (const { fen, moves } of reference.positions) {
  const board = new Board(fen);
  const buf = new Uint16Array(256);
  const len = legalMovesInto(board, buf);
  assert.deepEqual(Array.from(buf.subarray(0, len)), moves, "ordered packed moves mismatch: " + fen);
  positions++;
}
console.log("PASS ordered pawn/standard legal moves against frozen preoptimization reference:", positions);
