# Chess960 X-FEN / Shredder-FEN — notes for purechess

Sources:
- FIDE Laws Appendix F (Chess960)
- https://www.chessprogramming.org/Chess960
- https://en.wikipedia.org/wiki/X-FEN
- https://www.shredderchess.com/chess960.html (Shredder-FEN)

## Distinction
- **Shredder-FEN**: castling field is `KQkq` (K/Q for white, k/q for black) regardless of rook file; ambiguous in 960 where rook not on a/h.
- **X-FEN**: castling field is file letter of rook (`AHah` etc). FIDE 960 mandates X-FEN. Shredder is legacy.

## purechess policy (Phase 2 spec)
- Input: accept both X-FEN file letters and Shredder KQkq.
- Output: emit X-FEN (file letters) by default, Shredder only via option.
- Castling move representation: king captures rook (960) vs king to g1/c1 (standard) — both accepted, spec will define.
- Hash: placeholder `chess960-xfen-sha256-phase2`

## Validation
python-chess handles this via `chess.Board(chess960=True)` and `board.castling_xfen()`.
