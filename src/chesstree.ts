// src/chesstree.ts — clean-room chesstree-compatible analysis-tree layer
// (`turbochess/chesstree`). Public shapes mirror the `@itshak/chesstree`
// `.d.ts` ONLY — no third-party engine code was read or copied (same clean-room policy
// as the chessops compat, ADR-014/015). All logic is backed by the turbochess
// engine (`parseSan`/`makeMove`/`makeFen`/`makeUci`) and `turbochess/pgn`.
// Not part of the third-party baseline; MIT like the rest of turbochess.
import { parsePgn, type GameTree as CoreGameTree, type PgnMove } from "./pgn.js";
import { parseFen, makeFen } from "./fen.js";
import { makeMove, isCheck } from "./chess.js";
import { parseSan, makeUci } from "./san.js";
import { Color } from "./types.js";
import type { Move, Position, Setup } from "./types.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const NULL_MOVE_SANS = new Set(["--", "Z0", "null"]);
const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// ---------- public tree shapes (mirror of the chesstree public API) ----------
export type Path = string;

export interface Comment {
  id: string;
  text: string;
}

export interface Glyph {
  symbol: string;
  name: string;
}

export interface Clock {
  white: number;
  black: number;
}

export interface Shape {
  orig: string;
  dest?: string;
  brush: string;
  piece?: string;
}

export interface Eval {
  cp: number;
  best: string;
}

export interface TreeNode {
  id: string;
  ply: number;
  san?: string;
  fen: string;
  uci: string;
  children: TreeNode[];
  eval?: Eval;
  check?: string;
  dests?: string;
  drops?: string;
  comments?: Comment[];
  startingComments?: Comment[];
  glyphs?: Glyph[];
  clock?: Clock;
  shapes?: Shape[];
  forceVariation?: boolean;
}

export interface Game {
  fen: string;
  id: string;
  opening: unknown;
  player: unknown;
  status: { id: number; name: string };
  turns: number;
  variant: { key: string; name: string; short: string };
  result?: string;
  white?: { name: string };
  black?: { name: string };
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  whiteElo?: string;
  blackElo?: string;
  timeControl?: string;
  termination?: string;
  tags: Record<string, string>;
}

export interface Player {
  color: string;
  name?: string;
}

export interface AnalyseData {
  game: Game;
  player: Player;
  opponent: Player;
  treeParts: TreeNode[];
  sidelines: TreeNode[][];
  userAnalysis: boolean;
}

/** Deterministic unique 2-char node id (same alphabet/contract the
 * workstation's `createUniqueMoveNodeId` relies on). */
function nextNodeId(siblings: TreeNode[]): string {
  const used = new Set(siblings.map((s) => s.id));
  for (const first of ID_ALPHABET) {
    for (const second of ID_ALPHABET) {
      const id = first + second;
      if (!used.has(id)) return id;
    }
  }
  return "zz";
}

function commentId(fullPath: string, index: number): string {
  // Same scheme the baseline emits: pgn-comment-comment-<path-to-node>-<i>
  return `pgn-comment-comment-${fullPath}-${index}`;
}

const isNullMoveSan = (san: string): boolean => NULL_MOVE_SANS.has(san);

/** Baseline import semantics: a move repeated as a sibling (same SAN — e.g.
 * the same line reached via several variations) merges into one node;
 * subtrees and comments fold together recursively. */
function mergeTree(existing: TreeNode, incoming: TreeNode): void {
  for (const child of incoming.children) {
    const twin = existing.children.find((c) => c.san !== undefined && c.san === child.san);
    if (twin !== undefined) mergeTree(twin, child);
    else existing.children.push(child);
  }
  if (incoming.comments !== undefined && incoming.comments.length > 0) {
    const ex = existing.comments ?? (existing.comments = []);
    for (const c of incoming.comments) {
      if (!ex.some((e) => e.text === c.text)) ex.push(c);
    }
  }
  if (existing.glyphs === undefined && incoming.glyphs !== undefined) existing.glyphs = incoming.glyphs;
}

interface ReplayCtx {
  pos: Position;
  ply: number;
  path: string;
  moveNo: number;
}

function replaySection(moves: PgnMove[], ctx: ReplayCtx, out: TreeNode[]): void {
  // Mainline nesting: the parser emits a flat mainline list, so each
  // successive move nests under the previous node's children. A PGN variation
  // replaces the move it follows — it starts from the position BEFORE that
  // move and its nodes are siblings of it (children[0] = mainline).
  let target: TreeNode[] = out;
  for (const m of moves) {
    const snapshot: ReplayCtx = { ...ctx };
    const id = nextNodeId(target);
    const node: TreeNode = {
      id,
      ply: ctx.ply + 1,
      fen: fenWithEpPolicy(ctx.pos),
      uci: "",
      children: [],
    };
    let advance: { move: Move } | null = null;
    if (isNullMoveSan(m.san)) {
      // baseline normalizes Z0/null placeholders to san "--", uci "0000"
      node.san = "--";
      node.uci = "0000";
    } else {
      const parsed = parseSan(m.san, ctx.pos);
      if (!parsed.ok) continue; // never throw on garbage — skip the move
      const move: Move = parsed.value;
      advance = { move };
      node.san = m.san;
      node.uci = makeUci(move);
      node.fen = fenWithEpPolicy(makeMove(ctx.pos, move));
    }
    if (m.comments.length > 0) {
      node.comments = m.comments.map((text, i) => ({
        id: commentId(`${ctx.path}${id}`, i),
        text,
      }));
    }
    // baseline pgnImport merges duplicate sibling moves (same SAN) into one
    // node, recursively merging their subtrees
    const existing = target.find((c) => c.san !== undefined && c.san === node.san);
    let mergedInto: TreeNode | undefined;
    if (existing !== undefined && !isNullMoveSan(node.san ?? "")) {
      mergeTree(existing, node);
      mergedInto = existing;
    } else {
      target.push(node);
    }
    if (advance) {
      ctx.pos = makeMove(ctx.pos, advance.move);
      ctx.ply += 1;
      ctx.path += id;
    }
    // variations of m are siblings of m (they replace it) → same target list;
    // the mainline continuation instead nests under the node's children
    for (const variation of m.variations) {
      replaySection(variation.moves, { ...snapshot }, target);
    }
    if (advance) {
      target = (mergedInto ?? node).children; // mainline continues under this node
    }
  }
}

/** FEN parity with the baseline: the ep square is only emitted when a legal
 * en-passant capture exists (chessops/pgn behavior), not unconditionally. */
function ownPawnAt(pos: Position, sq: number): boolean {
  const b = pos.board;
  const own = pos.turn === Color.White ? b.white : b.black;
  const lo = (own.lo & b.pawn.lo) >>> 0;
  const hi = (own.hi & b.pawn.hi) >>> 0;
  return sq < 32 ? (lo & (1 << sq)) !== 0 : (hi & (1 << (sq - 32))) !== 0;
}

function fenWithEpPolicy(pos: Position): string {
  const fen = makeFen(pos);
  const ep = pos.epSquare;
  if (ep === null || ep === undefined) return fen;
  const offset = pos.turn === Color.White ? -8 : 8;
  for (const df of [-1, 1]) {
    const from = ep + offset + df;
    if (from < 0 || from > 63) continue;
    if (Math.abs((from & 7) - (ep & 7)) !== 1) continue;
    if (!ownPawnAt(pos, from)) continue;
    const after = makeMove(pos, { from, to: ep, isEnPassant: true, isCastling: false, isPromotion: false });
    if (!isCheck(after)) return fen; // a legal ep capture exists → keep ep
  }
  // no legal ep capture — strip the ep field (baseline FEN policy)
  const parts = fen.split(" ");
  if (parts.length === 6) {
    parts[3] = "-";
    return parts.join(" ");
  }
  return fen;
}

// ---------- pgnImport ----------
const STRO_DEFAULTS: [string, string][] = [
  ["Event", "?"],
  ["Site", "?"],
  ["Date", "????.??.??"],
  ["Round", "?"],
  ["White", "?"],
  ["Black", "?"],
  ["Result", "*"],
];

/** Headers with STRO defaults filled (baseline behavior) + SetUp/FEN from a
 * root FEN that differs from the start position. */
function normalizedHeaders(headers: Map<string, string>, fen?: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of STRO_DEFAULTS) out.set(k, headers.get(k) ?? v);
  for (const [k, v] of headers) {
    if (!out.has(k) || k === "SetUp" || k === "FEN") out.set(k, v);
  }
  if (fen !== undefined && fen !== START_FEN) {
    if (!out.has("SetUp")) out.set("SetUp", "1");
    out.set("FEN", fen);
  }
  return out;
}

function defaultGame(fen: string, headers: Map<string, string>): Game {
  const norm = normalizedHeaders(headers, fen);
  const tag = (k: string): string => norm.get(k) ?? "?";
  return {
    fen,
    id: "synthetic",
    opening: undefined,
    player: "white",
    result: tag("Result"),
    status: { id: 20, name: "started" },
    turns: 1,
    variant: { key: "standard", name: "standard", short: "standard" },
    white: { name: tag("White") },
    black: { name: tag("Black") },
    event: tag("Event"),
    site: tag("Site"),
    date: tag("Date"),
    round: tag("Round"),
    whiteElo: headers.get("WhiteElo"),
    blackElo: headers.get("BlackElo"),
    timeControl: headers.get("TimeControl"),
    termination: headers.get("Termination"),
    tags: Object.fromEntries(norm),
  };
}

export function pgnImport(pgn: string): AnalyseData {
  // Never throws — consumers (workstation) wrap calls in fallbacks that expect
  // an empty treeParts on failure, unlike the reference baseline which throws.
  const parsed = parsePgn(pgn);
  if (!parsed.ok) {
    const empty = defaultGame(START_FEN, new Map());
    return {
      game: empty,
      player: { color: "white" },
      opponent: { color: "black" },
      treeParts: [],
      sidelines: [],
      userAnalysis: true,
    };
  }
  const headers = parsed.value.headers;
  const fenHeader = headers.get("FEN");
  const rootFen = fenHeader ?? START_FEN;
  const startRes = parseFen(rootFen);
  const start: Setup = startRes.ok ? startRes.value : (parseFen(START_FEN) as { ok: true; value: Setup }).value;
  const root: TreeNode = { id: "", ply: 0, fen: rootFen, uci: "", children: [] };
  const ctx: ReplayCtx = { pos: start, ply: 0, path: "", moveNo: 1 };
  replaySection(parsed.value.moves, ctx, root.children);
  const game = defaultGame(rootFen, headers);
  const white = headers.get("White");
  const black = headers.get("Black");
  return {
    game,
    player: { color: "white", name: white },
    opponent: { color: "black", name: black },
    treeParts: [root],
    sidelines: [],
    userAnalysis: true,
  };
}

function lastPlyOf(root: TreeNode): number {
  let ply = 0;
  let node = root.children[0];
  while (node) {
    ply = node.ply;
    node = node.children[0];
  }
  return ply;
}

// ---------- TreeWrapper ----------
export interface TreeWrapper {
  root: TreeNode;
  lastPly(): number;
  nodeAtPath(path: Path): TreeNode | undefined;
  getNodeList(path: Path): TreeNode[];
  nodesOnPath(path: Path): TreeNode[];
  longestValidPath(path: Path): Path;
  addNode(node: TreeNode, path: Path): Path | undefined;
  addNodes(nodes: TreeNode[], path: Path): Path | undefined;
  setCommentAt(comment: Comment, path: Path): TreeNode | undefined;
  deleteCommentAt(id: string, path: Path): TreeNode | undefined;
  setGlyphsAt(glyphs: Glyph[], path: Path): TreeNode | undefined;
  setClockAt(clock: Clock | undefined, path: Path): TreeNode | undefined;
  pathIsMainline(path: Path): boolean;
  pathExists(path: Path): boolean;
  parentNode(path: Path): TreeNode | undefined;
  export(): string;
  pgn(): string;
}

function nodeAtPathFrom(root: TreeNode, path: Path): TreeNode | undefined {
  let node: TreeNode | undefined = root;
  for (let i = 0; i + 2 <= path.length; i += 2) {
    const chunk = path.slice(i, i + 2);
    node = node.children.find((c) => c.id === chunk);
    if (!node) return undefined;
  }
  return node;
}

function nodeListFrom(root: TreeNode, path: Path): TreeNode[] {
  const list: TreeNode[] = [root];
  let node: TreeNode = root;
  for (let i = 0; i + 2 <= path.length; i += 2) {
    const chunk = path.slice(i, i + 2);
    const next: TreeNode | undefined = node.children.find((c) => c.id === chunk);
    if (!next) break;
    list.push(next);
    node = next;
  }
  return list;
}

function pathIsMainlineFrom(root: TreeNode, path: Path): boolean {
  let node: TreeNode = root;
  for (let i = 0; i + 2 <= path.length; i += 2) {
    const chunk = path.slice(i, i + 2);
    const first: TreeNode | undefined = node.children[0];
    if (!first || first.id !== chunk) return false;
    node = first;
  }
  return true;
}

export class TreeWrapperImpl implements TreeWrapper {
  root: TreeNode;

  constructor(root: TreeNode) {
    this.root = root;
  }

  lastPly(): number {
    return lastPlyOf(this.root);
  }

  nodeAtPath(path: Path): TreeNode | undefined {
    return nodeAtPathFrom(this.root, path);
  }

  getNodeList(path: Path): TreeNode[] {
    return nodeListFrom(this.root, path);
  }

  nodesOnPath(path: Path): TreeNode[] {
    return nodeListFrom(this.root, path);
  }

  longestValidPath(path: Path): Path {
    let valid = "";
    let node = this.root;
    for (let i = 0; i + 2 <= path.length; i += 2) {
      const chunk = path.slice(i, i + 2);
      const next = node.children.find((c) => c.id === chunk);
      if (!next) break;
      valid += chunk;
      node = next;
    }
    return valid;
  }

  addNode(node: TreeNode, path: Path): Path | undefined {
    const parent = this.nodeAtPath(path);
    if (!parent) return undefined;
    parent.children.push(node); // no dedup — baseline semantics
    return path + node.id;
  }

  addNodes(nodes: TreeNode[], path: Path): Path | undefined {
    let p: Path | undefined = path;
    for (const n of nodes) {
      p = this.addNode(n, p ?? "");
      if (p === undefined) return undefined;
    }
    return p;
  }

  setCommentAt(comment: Comment, path: Path): TreeNode | undefined {
    const node = this.nodeAtPath(path);
    if (!node) return undefined;
    const comments = node.comments ?? [];
    const idx = comments.findIndex((c) => c.id === comment.id);
    if (idx >= 0) comments[idx] = comment;
    else comments.push(comment);
    node.comments = comments;
    return node;
  }

  deleteCommentAt(id: string, path: Path): TreeNode | undefined {
    const node = this.nodeAtPath(path);
    if (!node) return undefined;
    node.comments = (node.comments ?? []).filter((c) => c.id !== id);
    return node;
  }

  setGlyphsAt(glyphs: Glyph[], path: Path): TreeNode | undefined {
    const node = this.nodeAtPath(path);
    if (!node) return undefined;
    node.glyphs = glyphs;
    return node;
  }

  setClockAt(clock: Clock | undefined, path: Path): TreeNode | undefined {
    const node = this.nodeAtPath(path);
    if (!node) return undefined;
    node.clock = clock;
    return node;
  }

  pathIsMainline(path: Path): boolean {
    return pathIsMainlineFrom(this.root, path);
  }

  pathExists(path: Path): boolean {
    return this.nodeAtPath(path) !== undefined;
  }

  parentNode(path: Path): TreeNode | undefined {
    if (path.length < 2) return undefined;
    return this.nodeAtPath(path.slice(0, -2));
  }

  export(): string {
    return pgnExport.renderFullTxt({
      data: { game: defaultGame(this.root.fen, new Map()) },
      tree: this,
    });
  }

  pgn(): string {
    return this.export();
  }
}

export function build(root: TreeNode): TreeWrapper {
  return new TreeWrapperImpl(root);
}

// ---------- PGN export ----------
const STRO_KEYS = new Set(["Event", "Site", "Date", "Round", "White", "Black", "Result"]);
const GLYPH_TO_NAG: Record<string, number> = { "!": 1, "?": 2, "!!": 3, "??": 4, "!?": 5, "?!": 6 };
const Q = '"';
const headerLine = (k: string, v: string | undefined): string =>
  "[" + k + " " + Q + (v ?? "?") + Q + "]";

function renderHeaders(game: Game, rootFen: string): string[] {
  const lines = [
    headerLine("Event", game.event),
    headerLine("Site", game.site),
    headerLine("Date", game.date ?? "????.??.??"),
    headerLine("Round", game.round),
    headerLine("White", game.white?.name),
    headerLine("Black", game.black?.name),
    headerLine("Result", game.result ?? "*"),
  ];
  if (rootFen !== START_FEN) {
    lines.push(headerLine("SetUp", "1"), headerLine("FEN", rootFen));
  }
  for (const [k, v] of Object.entries(game.tags)) {
    if (STRO_KEYS.has(k) || k === "SetUp" || k === "FEN") continue;
    lines.push(headerLine(k, v));
  }
  return lines;
}

interface NumberingState {
  turn: "w" | "b";
  moveNo: number;
  needNumber: boolean;
}

function advanceState(state: NumberingState): void {
  if (state.turn === "b") {
    state.moveNo += 1;
    state.turn = "w";
  } else {
    state.turn = "b";
  }
}

/** Emits the tree from `list[idx]`: the node, then the paren groups for its
 * sibling alternatives (list[idx+1..], which replace it — baseline places
 * them right after the move they replace), then descends the mainline child. */
function emitFrom(list: TreeNode[], idx: number, state: NumberingState, tokens: string[]): void {
  if (idx >= list.length) return;
  const stateBefore = { ...state };
  const node = list[idx];
  const san = node.san;
  const isNull = san !== undefined && isNullMoveSan(san);
  if (san !== undefined && !isNull) {
    if (state.turn === "w") tokens.push(state.moveNo + ".");
    else if (state.needNumber) tokens.push(state.moveNo + "...");
    tokens.push(san);
    state.needNumber = false;
    for (const g of node.glyphs ?? []) {
      const nag = GLYPH_TO_NAG[g.symbol];
      if (nag !== undefined) tokens.push("$" + nag);
    }
  }
  for (const c of node.comments ?? []) tokens.push("{" + c.text + "}");
  if (san !== undefined && !isNull) advanceState(state);
  for (let j = idx + 1; j < list.length; j++) {
    const inner: NumberingState = { ...stateBefore, needNumber: true };
    const sub: string[] = [];
    emitFrom([list[j]], 0, inner, sub);
    tokens.push("(" + sub.join(" ") + ")");
  }
  if (list.length > idx + 1) state.needNumber = true;
  emitFrom(node.children, 0, state, tokens);
}

function renderSection(nodes: TreeNode[], state: NumberingState): string {
  const tokens: string[] = [];
  emitFrom(nodes, 0, state, tokens);
  return tokens.join(" ");
}

function numberingFromFen(fen: string): NumberingState {
  const parts = fen.split(/\s+/);
  const turn = parts[1] === "b" ? "b" : "w";
  const moveNo = parseInt(parts[5] ?? "1", 10) || 1;
  return { turn, moveNo, needNumber: true };
}

function renderMovetext(root: TreeNode, game: Game): string {
  const state = numberingFromFen(root.fen);
  const moves = renderSection(root.children, state);
  const result = game.result ?? "*";
  return moves.length > 0 ? moves + " " + result : result;
}

export interface AnalyseCtrl {
  data: { game: Game };
  tree: TreeWrapper;
}

export const pgnExport = {
  /** Full PGN (tags + movetext) — byte-compatible with the reference baseline's
   * output for the surfaces consumers use (STRO headers, FEN/SetUp, comments,
   * variations, result). */
  renderFullTxt(ctrl: AnalyseCtrl): string {
    const game = ctrl.data.game;
    const root = ctrl.tree.root;
    const headers = renderHeaders(game, root.fen);
    return headers.join("\n") + "\n\n" + renderMovetext(root, game);
  },

  /** Renders a node list as a one-line PGN mainline (no result token). */
  renderVariationPgn(game: Game, nodeList: TreeNode[]): string {
    if (nodeList.length === 0) return "";
    const root = nodeList[0].san === undefined ? nodeList[0] : { id: "", ply: 0, fen: nodeList[0].fen, uci: "", children: nodeList };
    const headers = renderHeaders(game, root.fen);
    const state = numberingFromFen(root.fen);
    const nodes = root.children;
    const tokens: string[] = [];
    for (const node of nodes) {
      const san = node.san;
      if (san === undefined) continue;
      const isNull = isNullMoveSan(san);
      if (!isNull) {
        if (state.turn === "w") tokens.push(`${state.moveNo}.`);
        else if (state.needNumber) tokens.push(`${state.moveNo}...`);
        tokens.push(san);
        state.needNumber = false;
        advanceState(state);
      }
      for (const c of node.comments ?? []) tokens.push(`{${c.text}}`);
    }
    return `${headers.join("\n")}\n\n${tokens.join(" ")}`;
  },
};

/** chesstree-compatible alias — `import { buildTree } from "turbochess/chesstree"`. */
export const buildTree = build;
