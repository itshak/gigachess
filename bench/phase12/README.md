# Phase 12 — evidence-based selection
Baseline: 4fef578; 142 independent completed paired measurement artifacts
from Phase 9 (93), Phase 10 (41), Phase 11 (8), stored in the adjacent
results directory. Three Phase 9 Bun jobs were canceled and are not data.
No new engine code is on the production branch.

The FEN allocation, constructor, serialization and hash changes with
targeted single-piece legality yield 1.432–1.672x FEN roundtrip and
1.270–1.421x validated replay on four Node 24 hosts. Apple Silicon
deep perft regressed in that trial (0.896/0.904x); re-evaluate before
acceptance. The simpler replay version is a control, as is the targeted
version without compact tables. Offline half-rook tables reduce decoded
size 821248 -> 108544 bytes; Node 24 move generation 1.040–1.250x
(wall; Apple CPU ratio only 1.010), with mixed deep perft. Folded
hash and undo variants do not justify integration, nor do alternate
popcounts or leaf specialization. Direct UCI parsing is tested only
as an incremental addition to the targeted candidate.

Four candidates: safehalf, targethalf, targetcontrol, targetucihalf.
Six hardware/OS labels, 24 Node24 jobs plus 4 Bun and 3 Node22 jobs,
plus corpus. Measure identical work, 20k positions, 300 games,
15 rotated timing rounds, deep perft and sliding attacks. Expanded
legality test compares every from/to UCI pair on 128 distributed
positions and all origins on 2000 distributed positions, cold and
loaded, plus Chess960, malformed tokens, promotion/EP, ownership
and subclass construction. Do not treat benchmark acceptance as
permission to change public semantics.
