# refs — Clean-Room Reference Layout

This directory enforces the **clean-room filesystem wall** for the `purechess` MIT library (Phase 1 baseline, `purechess-library` change).

## License split

| Directory | License | Allowed consumer | Purpose |
|-----------|---------|------------------|---------|
| `refs/gpl-only/` | GPL-3.0 / AGPL-3.0 | **spec agent only** (Phase 2) | GPL-tainted sources that SHALL NOT be copied into `src/` or `bench/` implementation code |
| `refs/mit-permissive/` | MIT only | **impl agent** + spec agent | Permissive sources safe to read while implementing `purechess` |
| `refs/docs-refs/` | CC0 / public docs / FIDE Laws | **impl agent** + spec agent | Canonical chess rules, FEN/PGN specs, docs that are not code-copied |

## Clean-room rule (non-negotiable)

> **Impl agent reads only `refs/mit-permissive/` + `refs/docs-refs/`.**
> It **never** mounts, lists, or reads `refs/gpl-only/`.
> The spec agent (Phase 2, separate change `purechess-spec`) is the only role allowed to read `refs/gpl-only/` and emits *language-neutral markdown specs + checked-in `magic-tables/*.json`* for the impl agent.
> CI will verify that no commit authored by the impl agent touches `refs/gpl-only/` and that no GPL text appears in `src/`.

See `proposal.md`, `design.md`, and `specs/purechess-baseline/spec.md` in `openspec/changes/purechess-library/`.

## Pinning policy

Every clone under `refs/` is pinned to an exact **commit hash** (or tag) and its `LICENSE` is verified. The table below is the source of truth; update it when a ref is refreshed.

### `refs/mit-permissive/` — MIT clones (pinned 2026-08-30, `LICENSE` verified)

| Clone | Repo (canonical) | Commit (pinned) | LICENSE | Notes |
|-------|------------------|-----------------|---------|-------|
| GopherCheck | `github.com/stephenjlovell/gopher_check` (proposal: `Obolonskaya/GopherCheck`) | `882982b2f23b7ead78e6414782c502da09dd3faa` | MIT (2014 Stephen J. Lovell) | Go `uint64` magic baseline; proves Black Magic viability |
| NuclearChess | `github.com/karlb/nuclearchess` (proposal: `jmkury/NuclearChess`) | `5e76c94d9046ad3472912dccd2f71200275e4af4` | MIT | Magic / hyperbola reference |
| Chess4j | `github.com/jswaff/chess4j` (proposal: `qwert23/Chess4j`) | `d1414758a2b1190712ae770baefd5014a12b84ec` | MIT (2017) | Java bitboard reference |
| `magic-bits` | `github.com/goutham/magic-bits` (proposal: `rooklift/magic-bits`) | `3152d1bf63d7ec2ce3b69dc5b2474db7abd419fa` | MIT (2024 Goutham P Bhat) | Magic number generation utilities |
| RecklessMagics | `github.com/codedeliveryservice/RecklessMagics` (proposal: `analog-hors/RecklessMagics`) | `fcce46b1ca6a5052a7ddab9eaef03dad5e046907` | MIT (2023 codedeliveryservice) | Rust magic table generator (offline JSON export) |
| `Chess_Movegen` / Gigantua | `github.com/Gigantua/Chess_Movegen` | `a76800a55702788ac4f354e6e9fab563b474ec93` | MIT (2021 dangi12012) | `MQueens/s` harness precedent |

Verification: `grep -l "MIT License" refs/mit-permissive/*/LICENSE refs/mit-permissive/*/LICENSE.txt` shows all 6; hashes also in `refs/mit-permissive/README.md`.

### `refs/gpl-only/` — GPL-tainted (spec-only)

| Clone | Repo | License | Taint notes |
|-------|------|---------|-------------|
| `chessops` | `github.com/niklasf/chessops` | GPL-3.0-or-later | TS chess logic; current workstation dep (ADR-010) — spec reference only |
| Stockfish | `github.com/official-stockfish/Stockfish` | GPL-3.0 | UCI engine; move/position semantics reference |
| `pgn-chess-tree` | `github.com/anomalyco/pgn-chess-tree` (author-owned) | AGPL-3.0 | Author owns the code but it imports `chessops` + lichess GPL helpers → **still GPL-tainted**; SHALL NOT be copied into `src/`; its `GameTree` / streaming optimizations are re-specified abstractly, not copied — see `refs/gpl-only/README.md` |

### `refs/docs-refs/` — Canonical docs (no code copy)

| Doc | Source | Hash / URL | Notes |
|-----|--------|------------|-------|
| FIDE Laws of Chess 2023 | `handbook.fide.com` | PDF + sha256 in `refs/docs-refs/README.md` | Canonical move legality |
| Chess960 X-FEN / Shredder-FEN | FIDE Laws Appendix + Chess960 notes | URLs + hashes in `refs/docs-refs/README.md` | Castling rights, position encoding |
| python-chess docs snapshot | `github.com/niklasf/python-chess` | MIT docs excerpt | SAN/FEN/PGN behaviour reference |
| cm-pgn docs | `github.com/kepler-62b/cm-pgn` | snapshot | PGN streaming precedent |

All docs are referenced by URL + sha256; no GPL code is copied from docs.

## Directory layout (verifiable)

```
refs/
  README.md           # this file — license split, pinning, clean-room rule
  gpl-only/           # gitignored — spec agent only (chessops, Stockfish, pgn-chess-tree)
  mit-permissive/     # impl agent may read — 6 MIT clones above (LICENSE verified)
  docs-refs/          # impl agent may read — FIDE 2023, Chess960, python-chess notes
```

Verify:

```bash
ls refs/
cat refs/README.md
cat refs/mit-permissive/README.md
cat refs/gpl-only/README.md
cat refs/docs-refs/README.md
grep -r "MIT License" refs/mit-permissive/*/LICENSE  # each MIT clone
```

## .gitignore

`refs/gpl-only/` is blocked in the repository `.gitignore` so it never appears in impl-agent mounts or history:

```
refs/gpl-only/
```

See repository root `.gitignore`.

## Two-phase process

- **Phase 1 (this change):** baseline agent never reads `refs/gpl-only/`; builds wall, harness, and bake-off.
- **Phase 2 (`purechess-spec`, separate change):** spec agent reads GPL + FIDE/python-chess and emits `purechess-rules`, `purechess-board-movegen`, `purechess-pgn-fen` delta specs + `bench/magic-tables/*.json` (generated via MIT tools, not GPL tables).
- **Phase 2+ impl:** impl agent reads only `specs/` + `refs/mit-permissive/` + `refs/docs-refs/`.

## Audit

```bash
# Impl agent must not have touched GPL sources
git log --all -- refs/gpl-only/  # should be empty or only spec-agent commits
rg -n "GPL" src/ bench/candidates/  # should find no GPL text in impl output
```
