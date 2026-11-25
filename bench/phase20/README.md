# Phase 20: equal result retention, not a production engine change

Phase19 11/11 passed (45700601055); neither Rays nor Lean selected:
fresh SAN matrix regression 25.0% / 21.3% on one platform each,
remaining original forced-GC gap. Preserve Phase15, cc375b0.
Full Phase19 raw artifacts in bench/results/js-phase19-final (gzip logs
and GC samples); both finalists beat published drumevp on isolated
complete lifecycle in forced and natural modes across all five hosts.
Reject the new pawn push-origin mask prototype: 4000 positions, 7207
replayed plies, 12 invalid FEN cases, frozen/ownership/exhaustive tests
pass, but noisy local fresh ratio .829. Preserve patch and raw results.
No new public API, no cached result returned. Source inspected:
drumevp ChessEngine.generateLegalMoves retains the returned Uint32Array
in legalMovesCache. GigaChess returns caller-owned Uint16Array and does
not retain it. Both get fresh boards. This makes live ranges different.
Initial local retention measurements are noisy, and the held list was
not observably consumed; no conclusion from them. New modes consume all
retained words after generation timing and keep checksum stable within
each engine. The isolated retain total includes consumer checksum cost.
Four-engine mixed original workload, two reversed repetitions of forced/
natural GC and equal retention, same baseline/candidate engine code to
detect measurement variation. Exact normalized UCI sets on 20k positions
verified separately; no replacement of original direct metric. Three
targeted configurations only, no Mac jobs. Do not assert that result
retention explains the difference until measured.
