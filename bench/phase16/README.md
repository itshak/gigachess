# Phase 16: diagnose contradictory direct benchmark results

Engine unchanged from successful Phase 15. No new Mac jobs. Original
4k benchmark retained; three-engine experiments use the same positions
and checksum, fresh boards each time. Four controls: generic call-site
versus dedicated functions, crossed with forced versus natural GC.
Each combination runs in a new process, twice, with reversed order,
12 warmups, 21 recorded rounds. Wall and process CPU samples preserved.
The initial local screen ran all modes in one process: candidate/pub
.653 generic forced, .822 specific forced, 3.803 specific natural,
3.104 generic natural. This suggests GC and/or JIT feedback dependence;
not yet causal proof. The controls also omit the source competitor and
tsx loader, so the original four-engine benchmark is run alongside them.
Do not discard any results or treat an artificial microbenchmark win as
universal superiority. No production changes in this campaign.
