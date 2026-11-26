# Phase 22: canonical template finalization

Phase21 independently passed all six jobs (45714146090). Original
direct vs published drumevp: Node22 Linux 2.009x; Node24 Linux x64
2.445x, Linux ARM64 3.192x, Windows x64 2.807x, Windows ARM64 3.620x.
Template invalidations zero in all traced candidate runs. Start
construction 7.262–13.478x vs Phase15. Paired replay 1.090–1.216x,
fresh movegen .968–1.019x, deep perft .974–1.014x. Minor FEN parse
regressions and one SAN-list regression .885x vs Phase15 remain.
Raw evidence archived in bench/results/js-phase21-final. The template
does not help arbitrary-FEN-only clients until initialized, as shown
by the initial-free control. Avoid claiming a universal fastest library.

Refinements: early prepares the reusable canonical template lazily
on first ordinary Board use, not module import, for arbitrary FENs
as well as startpos. earlysan adds SAN disambiguation flags instead
of candidate arrays and reuses the moving-piece lookup. Both preserve
independent bitboard ownership, subclass construction, no cached
move list, no arbitrary FEN cache. Explicitly disclose the reason for
the bounded template lifetime: both start construction reuse and
stabilizing V8 weak dependencies. No artificial roots in primary
benchmarks. Full correctness, 20k normalized UCI parity, original direct,
start-free unprimed controls, full paired and all-library matrix, and
new 12k ordered SAN/UCI parity and forced/natural SAN timings.
Local 4000 positions, 115194 moves exact SAN/UCI parity. Forced SAN
ratios early 1.319 and earlysan 1.677; natural 1.059 and 1.071.
Both unprimed arbitrary-FEN traces have zero generator invalidations
locally. No decision based on the local noisy rates alone. Compare to
validated Phase15 cc375b0, no additional Mac jobs. Select only after
checking all practical lanes; no release or main merge yet.

Validation infrastructure correction: original run 45721285801 EarlySAN
Node22 failed at pinned competitor checkout (Git LFS model timeout).
Skip LFS smudge for the competitor only; core import, source commit pin
and package integrity checks remain unchanged. Targeted dispatch
earlysan-node22 repeats the missing configuration without rerunning
successful jobs. No production source or correctness gates changed.
