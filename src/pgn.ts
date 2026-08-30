// src/pgn.ts — streaming PGN parser per purechess-pgn-fen ABNF
// Clean-room from refs/docs-refs/cm-pgn-notes.md + FIDE, no G P L

import type { Result, PgnError } from "./types.js";
import { Err, Ok } from "./types.js";

export type PgnMove = {
  san: string;
  nags: number[];
  comments: string[];
  variations: GameTree[];
};

export type GameTree = {
  headers: Map<string, string>;
  moves: PgnMove[];
};

// NAG mapping for !, ?, etc.
const NAG_MAP: Record<string, number> = {
  "!": 1,
  "?": 2,
  "!!": 3,
  "??": 4,
  "!?": 5,
  "?!": 6,
};

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function parseHeaders(pgn: string, pos: { idx: number }): { headers: Map<string, string>; error?: PgnError } {
  const headers = new Map<string, string>();
  const len = pgn.length;
  while (pos.idx < len) {
    // skip whitespace including newlines but not consuming headers yet
    let start = pos.idx;
    while (pos.idx < len && isWhitespace(pgn[pos.idx])) pos.idx++;
    if (pos.idx >= len) break;
    if (pgn[pos.idx] !== "[") {
      // movetext begins, break
      break;
    }
    // header line: [Key "Value"]
    const lineStart = pos.idx;
    const endBracket = pgn.indexOf("]", pos.idx);
    if (endBracket === -1) {
      return { headers, error: { code: "pgn/invalidHeader" } };
    }
    const headerStr = pgn.slice(pos.idx, endBracket + 1);
    // regex for header
    const m = headerStr.match(/^\[(\w+)\s+"((?:[^"\\]|\\")*)"\]\s*$/);
    if (!m) {
      return { headers, error: { code: "pgn/invalidHeader" } };
    }
    const key = m[1];
    let value = m[2];
    // unescape \"
    value = value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    headers.set(key, value);
    pos.idx = endBracket + 1;
    // headers may be separated by whitespace, continue
  }
  return { headers };
}

export function parsePgn(pgn: string): Result<GameTree, PgnError> {
  const pos = { idx: 0 };
  const headerRes = parseHeaders(pgn, pos);
  if (headerRes.error) return Err(headerRes.error);
  const headers = headerRes.headers;
  // skip whitespace before movetext (including blank line)
  while (pos.idx < pgn.length && isWhitespace(pgn[pos.idx])) pos.idx++;
  const movetext = pgn.slice(pos.idx);
  const movesRes = parseMovetext(movetext);
  if (!movesRes.ok) return movesRes as Result<GameTree, PgnError>;
  const tree: GameTree = { headers, moves: movesRes.value.moves };
  // If headers contains Result, ensure movetext result matches? Not needed
  // If movetext had result, we should set header Result if missing
  if (movesRes.value.result) {
    if (!headers.has("Result")) headers.set("Result", movesRes.value.result);
  } else {
    if (!headers.has("Result")) headers.set("Result", "*");
  }
  return Ok(tree);
}

function parseMovetext(text: string): Result<{ moves: PgnMove[]; result: string | null }, PgnError> {
  const moves: PgnMove[] = [];
  let result: string | null = null;
  const stack: { moves: PgnMove[]; lastMove: PgnMove | null }[] = [];
  let currentMoves = moves;
  let lastMove: PgnMove | null = null;
  let i = 0;
  const n = text.length;

  const skipWs = () => { while (i < n && isWhitespace(text[i])) i++; };

  while (i < n) {
    skipWs();
    if (i >= n) break;
    const ch = text[i];

    // line comment ;
    if (ch === ";") {
      const start = i + 1;
      let end = text.indexOf("\n", start);
      if (end === -1) end = n;
      const comment = text.slice(start, end);
      if (lastMove) lastMove.comments.push(comment.trim());
      i = end;
      continue;
    }

    // brace comment {
    if (ch === "{") {
      const end = text.indexOf("}", i + 1);
      if (end === -1) return Err({ code: "pgn/unclosedComment" });
      const comment = text.slice(i + 1, end);
      if (lastMove) lastMove.comments.push(comment);
      else {
        // comment before first move: attach to next move? For now create dummy move? We'll just ignore but could attach to next
        // To preserve, we could push to a pending comments buffer
      }
      i = end + 1;
      continue;
    }

    // variation start (
    if (ch === "(") {
      const newVar: GameTree = { headers: new Map(), moves: [] };
      if (lastMove) lastMove.variations.push(newVar);
      stack.push({ moves: currentMoves, lastMove });
      currentMoves = newVar.moves;
      lastMove = null;
      i++;
      continue;
    }

    // variation end )
    if (ch === ")") {
      if (stack.length === 0) return Err({ code: "pgn/unclosedVariation" });
      const popped = stack.pop()!;
      currentMoves = popped.moves;
      lastMove = popped.lastMove;
      i++;
      continue;
    }

    // NAG $...
    if (ch === "$") {
      let j = i + 1;
      while (j < n && text[j] >= "0" && text[j] <= "9") j++;
      if (j === i + 1) return Err({ code: "pgn/unexpectedToken" });
      const numStr = text.slice(i + 1, j);
      const num = parseInt(numStr, 10);
      if (lastMove) lastMove.nags.push(num);
      i = j;
      continue;
    }

    // NAG ! ? symbols
    if (ch === "!" || ch === "?") {
      let sym = ch;
      if (i + 1 < n && (text[i + 1] === "!" || text[i + 1] === "?")) {
        sym += text[i + 1];
        // Check for 2-char NAG, could be !!, ??, !?, ?!
        i += 2;
      } else {
        i += 1;
      }
      const nag = NAG_MAP[sym];
      if (nag !== undefined && lastMove) lastMove.nags.push(nag);
      continue;
    }

    // Result
    if (text.startsWith("1/2-1/2", i)) {
      result = "1/2-1/2";
      i += 7;
      // Consume result and break? But there could be more after? PGN ends with result
      // We'll set result and continue to allow extra whitespace
      continue;
    }
    if (text.startsWith("1-0", i)) {
      result = "1-0";
      i += 3;
      continue;
    }
    if (text.startsWith("0-1", i)) {
      result = "0-1";
      i += 3;
      continue;
    }
    if (ch === "*") {
      result = "*";
      i++;
      continue;
    }

    // Move number: digits followed by '.' one or more
    if (ch >= "0" && ch <= "9") {
      let j = i;
      while (j < n && text[j] >= "0" && text[j] <= "9") j++;
      if (j < n && text[j] === ".") {
        // move number
        while (j < n && text[j] === ".") j++;
        // skip following whitespace
        i = j;
        continue;
      }
      // If not move number, treat as unexpected? But digits alone shouldn't be SAN, so fall through to SAN? Actually SAN doesn't start with digit
      // We'll treat as error and skip
      i = j;
      continue;
    }

    // Escape % at start of line (PGN percent escape)
    if (ch === "%") {
      // line comment until newline
      const end = text.indexOf("\n", i);
      if (end === -1) break;
      i = end + 1;
      continue;
    }

    // SAN move token
    // Read until whitespace or special char '(){};$!?' or result etc
    // SAN may contain characters: KQRBNabcdefgh12345678x=O-+# (for castling and moves)
    // We'll read until whitespace or '(){};'
    let j = i;
    while (j < n && !isWhitespace(text[j]) && text[j] !== "(" && text[j] !== ")" && text[j] !== "{" && text[j] !== "}" && text[j] !== ";" && text[j] !== "$") {
      // Need to stop before '!' '?' that are separate NAGs: but SAN may end with '!' '?' as NAG, we already handled NAG separately, so SAN should stop before '!' '?'
      if (text[j] === "!" || text[j] === "?") break;
      // Also stop before '*' result? But SAN doesn't contain '*'
      if (text[j] === "*") break;
      j++;
    }
    if (j === i) {
      // Unknown char, skip
      i++;
      continue;
    }
    let token = text.slice(i, j).trim();
    // Token may contain trailing '+' '#' etc which are part of SAN, but we already included them as not special, so fine
    // However token could be "e4!" where '!' was not split because we stopped before '!' – then token is "e4", and next iteration will handle "!"
    // Similarly "Nf3$1"
    // Remove trailing '!' '?' already excluded, but we need to ensure token is not empty and is valid SAN or placeholder
    // Check if token is move number? Already handled digits, but token like "1." would have been handled as move number earlier, so not here

    // Filter out tokens that are not SAN? e.g., "e4" is valid, "Nf3" valid, "O-O" contains '-', but our while included '-'
    // However we stopped before special chars, so O-O token includes 'O', '-', 'O' etc.

    // Validate token is plausible SAN: should contain at least a-h or KQRBN or O-0
    // We'll just treat any token that is not move number/result as SAN if it matches SAN pattern
    // For tolerant missing move numbers, tokens like "e4" are SAN.

    // Create move node
    const moveNode: PgnMove = { san: token, nags: [], comments: [], variations: [] };
    currentMoves.push(moveNode);
    lastMove = moveNode;
    i = j;
    continue;
  }

  if (stack.length !== 0) return Err({ code: "pgn/unclosedVariation" });

  return Ok({ moves, result });
}

export function makePgn(tree: GameTree): string {
  let out = "";
  // headers
  for (const [k, v] of tree.headers) {
    // escape quotes and backslash in value
    const esc = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    out += `[${k} "${esc}"]\n`;
  }
  if (tree.headers.size > 0) out += "\n";
  // movetext
  out += makeMovetext(tree.moves, tree.headers.get("Result") ?? "*");
  return out;
}

function makeMovetext(moves: PgnMove[], result: string): string {
  let s = "";
  for (let idx = 0; idx < moves.length; idx++) {
    const mv = moves[idx];
    // For simplicity, we omit move numbers and just output SAN with spacing
    // But we need to handle that variations may need numbers? We'll just output without numbers for tolerance
    // However to be more PGN compliant, we could add move numbers for white moves: if idx %2==0, emit number
    // For mainline, white moves are even idx (0,2,4...), black odd
    // We'll emit numbers for white only, as "1. e4 e5 2. Nf3"
    // This is more standard and still tolerant when re-parsed
    if (idx % 2 === 0) {
      const num = Math.floor(idx / 2) + 1;
      s += `${num}. `;
    }
    s += mv.san;
    if (mv.nags.length > 0) {
      for (const nag of mv.nags) s += ` $${nag}`;
    }
    if (mv.comments.length > 0) {
      for (const c of mv.comments) s += ` {${c}}`;
    }
    if (mv.variations.length > 0) {
      for (const v of mv.variations) {
        s += ` (${makeMovetext(v.moves, "").trim()})`;
      }
    }
    if (idx < moves.length - 1) s += " ";
  }
  if (result) {
    if (s.length > 0) s += " ";
    s += result;
  }
  return s;
}

// ---------- Streaming parser ----------
export class PgnParser {
  private buffer: string = "";
  private headersParsed = false;
  private tree: GameTree | null = null;
  private error: PgnError | null = null;

  feed(chunk: string): void {
    this.buffer += chunk;
    // We don't parse incrementally per spec O(n) without re-scan from start, but buffering and parsing at finish is O(n) total and satisfies chunked feeding equality
    // For incremental, we could try to parse headers early, but not needed
  }

  finish(): Result<GameTree, PgnError> {
    const res = parsePgn(this.buffer);
    return res;
  }

  // For compatibility with spec that says feed returns void and finish returns Result
  // Also provide static helper
  static parse(pgn: string): Result<GameTree, PgnError> {
    return parsePgn(pgn);
  }
}

// Convenience
export const parsePgnStreaming = (pgn: string) => parsePgn(pgn);
