/**
 * Opt-in bundled ESM entry point for the full-precision, in-process Board.
 * esbuild creates a single optimized static JS module plus the three lazily
 * loaded compressed magic/Zobrist data chunks. No WASM or native dependencies.
 *
 * Import ONLY from gigachess/fast for this Board and its lazy-load hooks;
 * the separately compiled ./core entry has independent module-local caches.
 */
export { Board } from "./board.js";
export { ensureMagicTablesLoaded, magicTablesLoaded } from "./attacks.js";
export { ensureZobristLoaded, zobristTablesLoaded } from "./zobrist.js";
