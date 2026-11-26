# Phase 7 follow-on: uncached standard movegen and magic math

The perft breakthrough is in dc3bc8f. These follow-on prototypes
investigate the new fair uncached legal generation lane. All movegen
comparisons prepare separate fresh Board/Engine instances outside timing,
call generation once (no cached lists), compare the complete move count,
rotate 4 lanes for 11 rounds, and report wall/CPU samples. Hosts shared;
absolute numbers across runs are not comparable.

| Trial | Previous candidate | New candidate | Published drumevp | Source drumevp |
|---|---:|---:|---:|---:|
| Direct standard | 48,937 | 108,598 | 177,110 | 163,566 |
| Cached-checker + smaller typed buffer | 118,209 | 105,237 | 214,195 | 200,215 |
| Array-based emission | 106,000 | 117,953 | 200,290 | 195,411 |
| Compact-root conversion for public lists | 54,999 | 55,172 | 92,726 | 109,647 |
| Direct interleaved table-word consumption | 96,307 | 110,266 | 187,531 | 165,024 |

All rates positions/s. First direct candidate independently passed
10,178 positions, 360 checks, 43 EP positions, 369 castling moves,
both package entry points and exact prior ordering plus chess.js.
Smaller typed-array/checker-cache experiment rejected. Compact-root
conversion not retained: no broad gain and duplicates generator.
Direct flat tables improved the latest candidate 14.5% once but
remain unverified by full tests. Prototype patches are retained.

The independent exact binary64 high-word multiplication experiment
uses an exact correction for rounding up onto a 2^32 boundary.
1,049,296 independent BigInt oracle product checks passed, plus
400,000 paired attack comparisons, frozen perft and attack maps.
Pinned Node 24.19 isolated sliders improved 14.4% (14.320 to
16.380 million queen attacks/s). However actual minified perft A/B
was start +6.3%, Kiwipete +11.5%, endgame +1.8%, promotion -11.1%.
Do NOT retain globally until broad regression is resolved.
No BigInt in the proposed hot path; BigInt is only in test oracle.

The benchmark artifacts and patches are exploratory evidence, not
additional runtime changes. No new dependencies, CI, release or merge.

## Release gate and decisions

The direct3 array-emission prototype passed the full existing npm
test suite and frozen move order/zero-copy tests; its additional
independent checks and gameplay A/B need completion before retaining
it in runtime. No prototype in this follow-up is merged into production.
The committed compact perft candidate remains the validated baseline.
Only one operational SentinelX host is available; no second physical
CPU/browser measurement yet. The pinned Node 24.19 broad diagnostic
observed loaded magic 5.7 vs 4.2 MAttacks/s, below the required 2.4x
chessops ratio, under shared-host contention. Do not weaken the gate.
