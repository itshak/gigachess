# python-chess — behavioural reference (docs only, no GPL copy)

Upstream: https://github.com/niklasf/python-chess (MIT docs, BSD-like lib but GPL-tainted via chessops-ish? Keep as docs-refs per wall)
Docs: https://python-chess.readthedocs.io/en/latest/
Pinned: v1.11.0 (2024-02-15) — `git rev-parse HEAD` placeholder `pythonchess-1.11.0-sha`

## Behaviours to mirror (language-neutral, to be specced in Phase 2)
- `Board(fen)` parsing: 6-field strict, Shredder/X-FEN, validates with exceptions (`ValueError` → purechess `FenError` with i18n keys `purechess.fen.<code>`).
- `make_san(move)` / `parse_san(san)`: disambiguation (file/rank/full), `+` `#` check/mate, `x`, `=Q`, `O-O` vs `0-0` tolerance, en passant `e.p.` not in SAN.
- PGN: `read_game(handle)` yields `Game` with headers, `mainline()`, variations `()` , NAGs `$0-140`, comments `{}`, `;` line comments, `%` escape.
- No code copied — only behavioural parity checked via `bench/bench-fen-san.mjs` and `bench/bench-pgn.mjs`.
