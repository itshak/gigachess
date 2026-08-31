// purechess alias package — one-release transition shim (ADR-015).
// Re-exports the entire turbochess public API so existing consumers of
// `import { Chess } from "purechess"` keep working. Deprecated after one
// minor release of turbochess.
export * from "turbochess";
