# GigaChess JS performance experiments, phase 2 — 2026-11-25

## Conclusion / release gate

The experimental pure-TypeScript fast bundle and optimized perft path achieved
large reproducible improvements, including a one-run win over the **source**
drumevp no-hash implementation on mixed perft. However that advantage did
NOT reproduce consistently on the separately packaged branch. The published
MIT competitor is still faster on mixed perft, starting-position depth 5 and
Kiwipete depth 4. **No unqualified fastest JS/TS library claim is justified.**
Do not merge/release/publish a new npm version on this basis.

All tests and benchmarks were run on the Debian aiserver; no GitHub CI minutes
were consumed.

## Reproducible current branch benchmark

- Node: v24.13.0; CPU: Intel(R) Xeon(R) CPU E5-1620 v2 @ 3.70GHz; OS: linux; rounds: 9 alternating, median timing.
- Competitor: @drumevp/chess-engine npm 1.3.2,
  pinned git 0bfd032c197dde4dddfcf0810f036cdf78bb8b45, plus chessops and chess.js.
- GigaChess loaded from the installed package self-reference gigachess/fast,
  not from a standalone synthetic experiment. Its lazy magic and Polyglot
  chunks are initialized using the same bundled module.
- Correctness gates: 2600 independently compared
  legal positions; 2400 validated UCI
  replay/undo plies; 20 published
  reference checks and 276 FEN corpus
  perft cases. Zero correctness errors, zero skipped FENs.

| Workload | GigaChess fast bundle | drumevp source | drumevp published |
|---|---:|---:|---:|
| Legal movegen, positions/s | 259,252 | 221,543 | 68,096 |
| FEN parse+write, positions/s | 182,996 | 120,051 | 126,187 |
| Validated game replay, plies/s | 611,267 | 145,024 | 158,996 |
| Mixed perft, million nodes/s | 22.133 | 22.495 | 23.553 |
| Starting position d5, million nodes/s | 12.043 | 15.042 | 16.391 |
| Kiwipete d4, million nodes/s | 13.390 | 18.210 | 19.305 |

Note: The drumevp source column for perft deliberately omits hash maintenance,
matching the perft-specific GigaChess path. It is not an identical API, and
the separate full-hash source path recorded 18.658 million mixed nodes/s.

The cached-list benchmark is NOT an apples-to-apples speed race: drumevp
reuses an existing list; the GigaChess lane regenerates the list. No cached
move-list superiority is claimed.

## Source-level perft A/B, 11 alternating runs

Both candidate and baseline had fancy magic and Polyglot hashes loaded.
The optimized TS source (before bundling) includes perft-private make/undo,
a transient 64-square role cache, and precomputed king-ray sniper screening.

| Standard perft FEN | Previous branch Mnps | Optimized source Mnps | Change |
|---|---:|---:|---:|
| start | 10.743 | 12.043 | +12.1% |
| kiwipete | 11.995 | 12.604 | +5.1% |
| endgame | 7.674 | 8.532 | +11.2% |
| promotion | 14.663 | 16.143 | +10.1% |

The minified ESM bundle added roughly 3–11% on four position-specific A/B
runs versus the same source build, but not every repeated run showed the
same ratio. The optional fast entry is a **new module** with isolated lazy
table state: import its hooks from gigachess/fast rather than ordinary core.

## Correctness

- Full npm test suite PASS on the actual draft branch, including 1,000
  randomized games, 118,380 plies and 11,684 verified undos with no
  chess.js mismatches.
- 114 frozen perft depth/FEN checks over both ordinary and fast Board
  implementations, including 12 Chess960 setups with overlapping
  castling coordinates, EP and final FEN/hash/rights restoration.
- 276 independent corpus FENs, 20 published perft counts, 24 UCI games
  replayed and undone with zero mismatches in the competitor suite.
- The Board public makeMove/unmakeMove and Polyglot/repetition semantics
  remain unchanged. Only Board.perft uses the dedicated state path.

## Experiments kept

1. Separate perft-only reversible move implementation, omitting public
   halfmove/fullmove clock and Zobrist updates while preserving all
   rule-relevant castling, EP, turn and checkers state.
2. Temporary caller-owned Uint8Array piece-code lookup for internal
   perft moves; not exposed or persisted on public Board.
3. Empty-board king-ray screens to avoid magic lookups for impossible
   slider pins. Full checker and pin calculation remains available.
4. Opt-in bundled, minified ESM fast entry with lazy split chunks.
   No native dependency, WebAssembly, Rust, GPL copied source or API break.

## Rejected experiments

- Known-role bitboard clears: +2.3% start, -4.4% Kiwipete;
  insufficient broad gain, extra undo complexity.
- Exact transposition table at depth >=2: approximately neutral start,
  -5.6% Kiwipete, -12.4% promotion. Exact leaf memoization was
  worse by about 28–46%; no unsafe probabilistic cache introduced.
- Alternative rank/file rook sliding table: Kiwipete +8%, endgame +5%,
  but start -4.4% and uncached legal-move-list -8%; rejected.
- King-danger routing threshold sweeps: inconsistent position mix.
- Early-exit king attack probes: start -4%, promotion -5%; rejected.
- Quiet move special bitboard rewrite: neutral to slightly slower
  on full ordinary gameplay, with varying perft benefit; rejected.
- Additional quiet-move checkers geometric shortcut: starting position
  +3.3% but other three main perft fixtures -3–4%; rejected.
- Bundling with retained JS function names: severe 30–44% perft
  regression on Node/V8. Full minification performed best overall.

## Remaining target

A future optimization must *demonstrate* consistent published
drumevp wins on mixed, start depth 5 and Kiwipete depth 4, and retain
strong validated replay, legal movegen, FEN, chess960 and EP correctness.
The next algorithmic investigation should compare incremental legality
state and sliding attack indexing directly against pinned MIT upstream.
Do not advertise universal fastest or ship a new version in the meantime.

## Reproduce

Build: npm run build
Correctness: npm test
Competitor comparison: use bench/bench-competitive.mjs with
--gigachess-fast --drumevp /PINNED/DRUMEVP --published /NPM/PACKAGE/DIST/index.js --runs 9
Node runner requires the local tsx import loader; bench source documents
its command-line setup and data fixtures.

Raw files:
- js-perft-phase2-2026-11-25.json
- js-perft-phase2-unbundled-ab-2026-11-25.json
