# Full independent performance laboratory

Manual dispatch on `bench/independent-phase8-20261125` using the
existing bench-real workflow ID. Main/default branch CI and release
workflow are unchanged. Runtime code is exactly Phase 8 d408cfd.
All jobs use standard public-repository hosted runners, not paid
larger runners. No publishing or deployment.

## Matrix

- Six hardware/OS labels: Ubuntu x64/ARM64, Windows x64/ARM64,
  macOS Apple Silicon/Intel. Actual CPU models and runtime metadata
  recorded; a label does not guarantee a particular CPU vendor.
- Node 24.19.0 and 22.5.0: two independent VM replicates per label
  (24 jobs). Bun 1.4.0 on five supported labels; Deno 2.9.6 on four.
- Nine browser jobs, Chromium/Firefox/WebKit across Linux, macOS,
  Windows, pinned Playwright 1.65.1. Browser export for drumevp;
  separately bundled harness, no forced GC in browser.
- 48 independent official full-corpus suite jobs (8 suites x 6 platforms).
- Two million-game streaming jobs on x64/ARM64 Linux, plus shared
  corpus prep and final summary. Total 94 jobs, concurrency bounded.
  Timeouts up to 330 min per long job, under GitHub's 6-hour limit.

## Inputs and comparisons

Candidate, Phase 7 d408cfd's prior runtime dc3bc8f, exact published
GigaChess 0.5.0, exact npm drumevp 1.3.2, pinned drumevp source
0bfd032c197dde4dddfcf0810f036cdf78bb8b45, chessops 0.15.1,
chess.js 1.4.0, and ultrachess 1.4.0 (Rust/WASM, separately labeled).
Package integrity verified against registry pins and lockfile.
Raw drumevp source adapter bundles only movegen/perft; FEN/SAN/replay
are explicitly unsupported in that adapter (published API tested).
The original exact TSX-source/published 4,000-position runner also runs
on Node, independently of the all-engine esbuild source adapter.

A pinned 2013 archive produces 20,000 positions (including EPD/WAC)
and 1,000 real-game replay streams, deterministic shuffle seed and
SHA-256 artifact. Separate full official suite uses first 100,000
games, 10M attacks, corpus d4 perft and complete workstation workload.
No silent fallback to a tiny sample. Million-game PGN streaming jobs
download Lichess January 2015 (285,559,460 compressed bytes), verify
published SHA-256 9061f9dc0ab0d8710886d1745b5ca83a27b61fe5e504f9dcd549218fa3598f57,
and compare a parity pass plus 1 warmup and 5 measured passes per
parser. Streaming includes I/O and decompression for both engines.

## Methodology

Exact legal UCI sets and supported SAN lists verified per position
against chess.js, FEN board/turn/castling/clocks checked (irrelevant
EP presentation excluded), replay final states independently checked,
published perft counts verified before timing. Incorrect engine/lane
excluded from speed claims and recorded as failure. Deep reference
start d6 (119,060,324) and Kiwipete d5 (193,690,690) supplement four
standard deep cases and mixed 276-position perft d3. 12 rotated
warmups and 21 measured rounds for public APIs, seven measured rounds
for extended deep perft, and 25 rounds of exact 4,000-position
comparison. Preconstruction/cleanup outside move generation timing.
Native packed lists, chessops object lists and chess.js verbose
lists differ in output cost; normalized UCI and public SAN lanes
reported separately. FEN uses raw output checksums per library;
state replay includes validation. CPU and wall-time recorded where
runtime supports it. No cached-list measurements treated as generation.
Checkpoints preserve partial results. Browser time only (no process
CPU time); do not compare absolute rates across hosts. Raw artifacts
retained 30 days; summary reports same-machine ratios and failures.

Known scope: no engine Elo/search benchmark, and no claim of including
every obscure npm chess package. These are the serious direct competitors
identified by the project. Native Rust libraries are outside this
JS/TS matrix; WASM remains a separate comparison class.

## Initial four-run evidence

Previous workflow 45625792025 completed successfully on all four
machines; raw files retained in bench/results/independent-phase8-initial.
All 20 perft ratios favor Phase 8 over published drumevp, but uncached
large-batch move generation still has losses, especially Apple M1.
Do not weaken performance gates or claim unconditional superiority.
