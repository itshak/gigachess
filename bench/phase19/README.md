# Phase 19: final geometry selection and GC cost accounting
Phase18 run 45697717295 15/15 successful. Raw artifacts in
bench/results/js-phase18-final. Rays and Lean improve practical lanes.
Rays fresh generation +1.6/+3.9%, replay +3.5/+3.7%, FEN roundtrip
+0.1/+2.0% (Linux x64 and Windows ARM64). Lean fresh generation
+0.3–7.8%, replay +0.8–5.8%, FEN -1.1–+0.3% (all four).
Neither reproducibly beats published drumevp in original mixed forced
benchmark. Do not claim this gap closed. Discontinue further speculative
combinations until the measurement cause is understood.

Compare both finalists on all five Linux/Windows configurations,
full npm suite and table regeneration, original direct comparison,
20k paired extended workloads, and full competitor matrix. The separate
worker records generation-only and complete construction/GC/generation/
collection throughput, wall/CPU, GC event times, and heap statistics,
with forced and natural GC in fresh processes and counterbalanced order.
Corpus checksum and SHA recorded. Forced mode calls GC before and after
generation; natural mode does neither. Total accounting is not identical
to the previous microbenchmark; report both instead of silently replacing
it. Natural mode includes any incidental GC, not a forced final cleanup.
The local screening (7 rounds, shared busy host, CPU3) shows Lean natural
gen +4.7%, total +3.6% vs Phase15; forced gen -18.6%, total -8.1%.
Not a decision-grade measurement. Raw local samples preserved.
No additional Mac jobs, no production changes in this branch.
