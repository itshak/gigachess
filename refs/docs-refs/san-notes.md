# SAN — Standard Algebraic Notation (FIDE Appendix C + python-chess)

Sources: FIDE Laws Appendix C, https://www.chessprogramming.org/Algebraic_Chess_Notation, python-chess `BaseBoard.san()`

## Grammar
- Piece: `KQRBN` (pawn omitted)
- Disambiguation: file, rank, or both when >1 piece can reach dest
- Capture: `x` (pawn capture includes origin file, e.g., `exd5`)
- Dest: `a1`–`h8`
- Promotion: `=Q` etc (`e8=Q`, `e8=Q+` etc)
- Check: `+` (single), mate: `#` (or `++` in some legacy, normalized to `#`)
- Castle: `O-O` and `O-O-O` (letter O), tolerant `0-0` on input, `O-O` on output

## purechess parity
- `bench/bench-fen-san.mjs` will verify byte-identical `makeSan` vs chessops for 10k FENs, so `useChessMoveAnnouncer` and AriaLive remain correct.
- i18n: SAN errors map to `purechess.fen.*` etc.
