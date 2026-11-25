# Phase 21: initial position template and V8 weak-object invalidation

Phase20 completed 4/4. Exact normalized parity 20k positions, 579975
moves, identical SHA on all three hosts. Equal retention natural 3.06–
3.33x, forced Node22 1.03–1.08, Node24 Linux .85–.87, Windows ARM
.91–.92. Results in bench/results/js-phase20-final. Full GC can cause
lazy deopt (embedded weak objects cleared) in standardMovesInto.
Local traced baseline forced 29 weak invalidations; natural 0. Class
masks/occupancy, splitting loops, typed scratch and diagnostic V8 flags
did not eliminate invalidation; typed paired .967 movegen, .918 replay.
Rejected variants and traces retained. Retaining one live initial
Board (not moves or just bitboards) gives 0 invalidations in local
diagnostic vs 30 no roots. This is evidence of lifetime dependence,
not proof of the exact weak reference or a general V8 defect.

Candidate caches one private canonical initial Board, lazily when
constructing exact initial FEN, using it to avoid parsing that FEN.
Clones mutable bitboards, king coordinates and checkers; hash lazy
load behavior retained. No arbitrary FEN or move-list cache, no V8
flags/GC changes in library. Independent template tests pass cold/
loaded and subclass cases. Local traced forced 625393 positions/s,
0 generator weak invalidations. Same-process forced candidate/pub
3.549x, natural 3.373x, but noisy paired real fresh .749, replay 1.384,
mixed .924. Do not integrate unless independent practical gates pass.
Test genuine repeated initial-position construction, original direct,
real corpus, traces, and corpus excluding initial FEN with/without
normal initial construction. No artificial strong roots in primary
benchmark, no claims based solely on traces. Mac deferred.
