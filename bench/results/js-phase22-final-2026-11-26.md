# Phase 22: selected EarlySAN candidate

## Decision
Retain Phase15 TargetFlat, plus private canonical initial-position
template prepared on first ordinary Board construction, and allocation-
reducing SAN disambiguation. This replaces Phase15 in the draft PR.
The template both accelerates start-position creation and retains a
live Board, which prevents the repeated V8 weak-code invalidations
observed in the diagnostic. It is bounded to one private reusable
canonical board; there is no move-list cache or arbitrary FEN cache.
No V8 runtime flags, artificial benchmark roots or relaxed chess rules.

## Independent evidence
- [Original run](https://github.com/itshak/gigachess/actions/runs/45721285801):
  9 successful variant jobs and corpus; EarlySAN Node22 failed before
  benchmarking due to unrelated competitor NNUE LFS download timeout.
- [Targeted retry](https://github.com/itshak/gigachess/actions/runs/45727896633):
  corpus and EarlySAN Node22 passed; unchanged engine code, only LFS
  checkout and workflow targeting corrected.
- Exact source: Phase22 branch commit 2812a35, apply
  bench/phase22/patches/earlysan.patch. Retry e81b3fc.
- [Reproduction scripts](https://github.com/itshak/gigachess/tree/e81b3fcb0a4581ac080d917620f9f53561d94fc5/bench/phase22).
- Raw artifacts for all ten configurations in js-phase22-final/.
  Compressed traces and logs retain original contents.
- All full npm tests passed, oracle metadata unchanged, generated
  slider blobs reproducible. Exact normalized 579975 legal moves
  across 20000 positions and exact 348148 ordered UCI/SAN strings
  across 12000 positions, same corpus digests across hosts.

| Platform | Original direct / Phase15 | Original direct / published drumevp | Unprimed arbitrary-FEN / published |
|---|---:|---:|---:|
| Linux x64 Node22 | 2.714 | 2.325 | 2.342 |
| Linux x64 Node24 | 3.355 | 2.922 | 3.663 |
| Linux ARM64 Node24 | 4.002 | 3.261 | 3.342 |
| Windows x64 Node24 | 3.252 | 2.944 | 2.719 |
| Windows ARM64 Node24 | 4.056 | 3.730 | 3.373 |

All ten competitive matrix lanes beat the tested external pure-JS
competitors on all five configurations. Minimum candidate/competitor
ratios across eligible external pure-JS implementations and hosts:
native list 2.788, normalized UCI 1.351, SAN 1.275, FEN 1.510,
validated replay 3.705, start d5 1.797, Kiwipete d4 1.746,
endgame d5 1.353, promotion d4 1.638, mixed perft d3 1.629.
Includes old published gigachess 0.5.0, chess.js, chessops, published
and pinned source drumevp (supported lanes only). WASM separate.

## Trade-offs vs Phase15
Start creation 7.346–10.779x; forced SAN 1.203–1.410x;
natural SAN 1.017–1.054x; validated replay 1.128–1.222x.
Paired fresh real-game generation .999–1.022x. FEN parse .917–.982x,
write .992–1.089x, roundtrip .934–.968x; mixed perft .963–1.001x,
start d6 .963–1.016x, Kiwi d5 .948–1.013x.
Accept the measured bounded regression in FEN and deep perft relative
to Phase15 for substantially improved start creation, replay, SAN and
direct generation, without claiming all old/new lanes improved.
The broad competitive evidence is Linux/Windows only; Mac/browser
final candidate validation deferred. Do not publish or use an
unqualified universal fastest claim before final release decision.
