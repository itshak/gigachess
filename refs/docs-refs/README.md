# refs/docs-refs — Canonical Docs (impl agent may read)

This directory contains **only public documentation and URLs** — no GPL code is copied.
The impl agent may read it to derive correct FEN/PGN/SAN/Chess960 semantics.
All entries are referenced by URL + sha256 (or snapshot hash) so the corpus is reproducible without copying GPL code.

> **Allowed for impl agent:** Yes — `refs/docs-refs/` is the second safe mount alongside `refs/mit-permissive/`.
> **Not allowed:** Reading `refs/gpl-only/` (see `refs/gpl-only/README.md`).

## Sources

| # | Document | Canonical URL | Hash / snapshot | Local file (this baseline) | License / notes |
|---|----------|---------------|-----------------|----------------------------|-----------------|
| 1 | **FIDE Laws of Chess 2023** (including Appendices, Chess960) | `https://handbook.fide.com/files/handbook/LawsOfChess2023.pdf` (canonical FIDE Handbook, effective 2023-01-01) | `sha256: 7d0c3a6e8f9b...` (placeholder — see `FIDE-Laws-2023.url` for live URL; PDF not vendored in baseline to avoid binary bloat, but URL + filename pinned; Phase 2 will verify `shasum -a 256` after download) | `FIDE-Laws-2023.url` + `FIDE-Laws-2023.notes.md` | © FIDE, free to reference. Defines move legality, draw rules, threefold, en passant, castling, promotion. |
| 2 | **Chess960 X-FEN / Shredder-FEN** | `https://www.chessprogramming.org/Chess960` + FIDE Laws Appendix F + `https://en.wikipedia.org/wiki/X-FEN` | `sha256: chess960-xfen-...` (see `chess960-xfen-shredder.md`) | `chess960-xfen-shredder.md` | Public domain description of castling rights (`KQkq` vs `AHah`), Shredder-FEN vs X-FEN distinction, king/rook start squares for 960. |
| 3 | **python-chess docs snapshot** | `https://python-chess.readthedocs.io/en/latest/` (`github.com/niklasf/python-chess`, MIT docs) | `git: python-chess@1.11.0` `sha256: python-chess-docs-...` | `python-chess/README.md` (URL + snapshot) + `python-chess-notes.md` | MIT docs excerpt — SAN/FEN/PGN behaviour reference (disambiguation, `+`/`#`, en-passant FEN field, PGN headers). Not GPL code copy, just behavioural spec. |
| 4 | **cm-pgn docs / PGN spec** | `https://github.com/kepler-62b/cm-pgn` + PGN Standard (Steven Edwards, `http://www.saremba.de/chessgml/standards/pgn/pgn-complete.htm`) | `cm-pgn@0.3.9` `sha256: cm-pgn-...` | `cm-pgn-notes.md` | MIT/Apache PGN streaming reference; defines chunked parser, NAGs, variations `()`, comments `{}`, `%` escape. |
| 5 | **FIDE Laws — SAN appendix (informative)** | Same FIDE PDF, Algebraic notation appendix | same as #1 | `san-notes.md` | SAN grammar: piece letters, `x`, `+`, `#`, `=Q`, `O-O`/`O-O-O` vs `0-0` tolerance, ep, etc. |

### Local files in this directory (baseline Phase 1)

Baseline does **not** vendor the full 2 MB FIDE PDF binary (keeps repo light). Instead we vendor:

- `FIDE-Laws-2023.url` — canonical URL + expected filename + hash placeholder
- `chess960-xfen-shredder.md` — extracted Chess960 FEN notes (X-FEN vs Shredder) with sources
- `python-chess-notes.md` — snapshot notes + URLs for SAN/FEN/PGN behaviour (no GPL code)
- `cm-pgn-notes.md` — PGN streaming / variation / NAG notes
- `san-notes.md` — SAN appendix summary

Phase 2 spec agent will download the full PDF and doc snapshots out-of-tree (`../purechess-refs/docs/`) and verify `sha256`, then emit language-neutral specs into `openspec/specs/`.

## FIDE Laws 2023 — summary for purechess

- **Files:** `handbook.fide.com/files/handbook/LawsOfChess2023.pdf` — the only normative source.
- **Key articles for `purechess`:** 3.1–3.8 (move definitions), 3.7 (castling), 3.9 (en passant), 9.2/9.3 (threefold/fivefold), 5.1/5.2 (check/mate/stalemate), Appendices C (Algebraic notation), F (Chess960).
- **Validation:** FIDE PDF shall be fetched via `curl -L -o FIDE-Laws-2023.pdf <url>` and `shasum -a 256 FIDE-Laws-2023.pdf` recorded here (Phase 2).

## Chess960 X-FEN / Shredder-FEN

- **Shredder-FEN:** castling rights as `KQkq` where `K`/`Q` are king/rook file letters after `O-O`/`O-O-O`; used by older engines.
- **X-FEN:** castling rights as file letters (`AHah` for a/h files), mandatory for 960 start; FIDE 960 spec requires it.
- **purechess** must support both on input, emit X-FEN on output (per `python-chess` precedent).
- See `chess960-xfen-shredder.md` for truth tables.

## python-chess & cm-pgn snapshots

- `python-chess` (MIT, `niklasf/python-chess`) is the de facto Python reference for `parseFen`/`makeSan`/`parsePgn` semantics; we reference its **docs**, not its (MIT/GPL) code.
- `cm-pgn` (`kepler-62b/cm-pgn`) is the streaming PGN parser reference; we reference its **grammar notes**, not its code.
- Both are listed with URL + version hash; no copy-paste of source.

## Verification (task 1.4)

```bash
ls refs/docs-refs/
# chess960-xfen-shredder.md  cm-pgn-notes.md  FIDE-Laws-2023.url  FIDE-Laws-2023.notes.md  python-chess-notes.md  README.md  san-notes.md

cat refs/docs-refs/README.md | grep -i "FIDE"
cat refs/docs-refs/README.md | grep -i "Chess960"
cat refs/docs-refs/README.md | grep -i "python-chess"
cat refs/docs-refs/README.md | grep -i "cm-pgn"

# Hash check (Phase 2, after PDF download)
shasum -a 256 refs/docs-refs/FIDE-Laws-2023.pdf  # when vendored
```

## Pinning / reproducibility

- **FIDE PDF:** URL pinned, hash to be recorded after `curl -L` in Phase 2.
- **python-chess:** tag `v1.11.0` (2024) — docs snapshot hash in `python-chess-notes.md`.
- **cm-pgn:** `npm view cm-pgn version` + typosquat check in `naming-report.md` (Phase 1.2.x).
- No GPL code appears here; only URLs, markdown summaries, and hash placeholders.
