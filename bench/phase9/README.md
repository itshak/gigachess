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
