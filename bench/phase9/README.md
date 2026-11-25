# Phase 9 hypothesis screening

Experimental code remains isolated; no shipped performance change is
accepted based on a single shared-server run. Each patch is relative to
8a1a44a (Phase 8 plus the Windows bundle-test fix). GitHub CI builds
baseline and candidate independently, checks full position, ordered moves,
hash, replay and invalid-input parity, and compares paired rotated rounds.
The original 94-job multi-competitor run is untouched.

| Patch | Hypothesis |
|---|---|
| fen | Unique parser scratch ownership; no ordinary castling sets; bitboard validation; avoid duplicate check computation |
| hash | Direct scalar XOR loops for Polyglot construction |
| attack | Avoid sliding lookup when enemy has no piece on an empty-board ray |
| write | Enumerate occupied rank bits rather than scan 64 squares |
| movegen | Unroll ordinary nonpawn generation for unpinned/no-check positions |
| combined | All five initial hypotheses together |
| replay | Skip unused king-safe/castling analysis for non-king single-piece legality, avoid duplicate pieceAt |
| leaf | Independent specialized leaf counter with role/half loops unrolled |
| copy | Explicit compact-state word copies instead of TypedArray.set |
| leafcopy | Leaf specialization plus explicit state copies |

Local screen: 4k positions identical; all variants build. Shared
multi-build measurements are noisy; isolated trials show write 1.55x
serialization but 0.88x roundtrip, replay 1.65x validated replay,
leaf 1.015x mixed perft, leafcopy 1.063x. Do not treat these as
cross-platform wins. Raw local data is stored in results.
47 competitive CI trials on four platforms (plus Node 22 and Bun
selected lanes), 20k positions, 300 replay streams, 15 rounds.
Deep perft trials include start d6 and Kiwipete d5. Pure JS remains
primary; WASM reference is separate. Browser testing follows only
for hypotheses with repeatable meaningful gains.

## Second wave and corrected campaign

Additional hypotheses: single-origin pin detection; direct common UCI
word decoding (alone and with single-origin analysis); leaf no-pin
specialization; owned parsed-board constructor; scalar FEN placement;
combined parser/ownership and parser/serializer/hash; precomputed enemy
leaf masks; and two FEN + replay combinations.

First screening campaign 45641894993 was canceled after identifying a
wrong FEN import (the fast entry intentionally exposes only Board) and
a CRLF-sensitive shared TSV fixture. The corrected harness imports the
actual FEN module for malformed-input checks, normalizes line endings,
and also checks each of 276 perft counts independently before timing.
The prior failures are harness failures, not position mismatches.
Total: 21 hypotheses, 96 competitive jobs, plus corpus preparation.
The production branch currently contains Windows harness fixes only;
performance patches remain experimental until repeatable gates pass.

Local paired screen: fenall 2.166x FEN roundtrip, fenowned 1.554x;
fenreplay on 10k positions 1.325x FEN roundtrip and 1.229x replay;
fenreplaytarget 1.281x FEN roundtrip and 1.302x replay but 0.945x
fresh movegen. Single-origin pin analysis 1.173x replay; UCI-only
0.943x; leaf no-pin 0.988x; leaf enemy masks 1.031x mixed perft.
These are observations, not release thresholds.
