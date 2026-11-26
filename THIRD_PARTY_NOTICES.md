# Third-party algorithms and benchmark references

The GigaChess runtime is MIT-licensed and independent of benchmark
competitors. No competitor npm package is bundled into the runtime.

- drumevp/chess-engine (https://github.com/drumevp/chess-engine),
  npm package @drumevp/chess-engine version 1.3.2, package-declared MIT:
  inspiration for the 32-bit Math.imul high-half multiplication idiom
  used by our black-magic table index. The implementation is adapted to
  independently generated attack tables and input layout. Source at
  commit 0bfd032c197dde4dddfcf0810f036cdf78bb8b45.
- chessops (https://github.com/niklasf/chessops), GPL-3.0-or-later:
  independent correctness/performance reference only; no GPL code copied.
- chess.js (https://github.com/jhlywa/chess.js), BSD-2-Clause:
  differential oracle and performance comparison only.
- ultrachess (https://github.com/yahorbarkouski/ultrachess):
  Rust/WebAssembly runtime, excluded from pure JS/TS comparison.

See bench/results/js-competitor-performance-2026-11-25.md for workloads.
