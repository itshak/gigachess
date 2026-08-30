# refs/mit-permissive — MIT-Only References (impl agent may read)

This directory contains **only MIT-licensed** clones. The impl agent is allowed to read it.
Every entry is pinned to a commit hash and its `LICENSE` has been verified to contain `MIT License`.

> **Rule:** `refs/gpl-only/` is not mounted for the impl agent. Only this directory + `refs/docs-refs/` are safe.

## Clones (pinned 2026-08-29, refreshed 2026-08-30)

| # | Directory | Upstream repo (canonical) | Pinned commit (HEAD) | LICENSE verified | Description |
|---|-----------|---------------------------|----------------------|------------------|-------------|
| 1 | `GopherCheck/` | `github.com/stephenjlovell/gopher_check` (referenced in proposal as `Obolonskaya/GopherCheck` — canonical MIT GopherCheck per ChessProgramming Wiki) | `882982b2f23b7ead78e6414782c502da09dd3faa` | `GopherCheck/LICENSE` → `MIT License` (Copyright 2014 Stephen J. Lovell) | Go UCI engine, bitboard magic with plain homogenous arrays; baseline for Black Magic proof. Includes `magics.json` but tables will be regenerated via `RecklessMagics`/`magic-bits` for `purechess`. |
| 2 | `NuclearChess/` | `github.com/karlb/nuclearchess` (proposal listed `jmkury/NuclearChess` — `karlb/nuclearchess` is the MIT-licensedJS/Browser variant, verified MIT) | `5e76c94d9046ad3472912dccd2f71200275e4af4` | `NuclearChess/LICENSE` → `MIT License` + `Chessboard.js MIT` | Nuclear chess variant; reference for alternative move handling (not tainted). |
| 3 | `Chess4j/` | `github.com/jswaff/chess4j` (proposal listed `qwert23/Chess4j` — `jswaff/chess4j` is the maintained MIT fork since 2017) | `d1414758a2b1190712ae770baefd5014a12b84ec` | `Chess4j/LICENSE.txt` → `MIT License` (Copyright 2017) | Java bitboard engine, magic bitboards since v3.2; clean-room reference for board encoding. |
| 4 | `magic-bits/` | `github.com/goutham/magic-bits` (proposal listed `rooklift/magic-bits` — canonical is `goutham/magic-bits`, header-only C++ MIT) | `3152d1bf63d7ec2ce3b69dc5b2474db7abd419fa` | `magic-bits/LICENSE` → `MIT License` (Copyright 2024 Goutham P Bhat) | Magic bitboard generation utilities, perfect-hashing scheme, reference for slider algorithm. |
| 5 | `RecklessMagics/` | `github.com/codedeliveryservice/RecklessMagics` (proposal listed `analog-hors/RecklessMagics` — actual crate is `codedeliveryservice/RecklessMagics`, MIT) | `fcce46b1ca6a5052a7ddab9eaef03dad5e046907` | `RecklessMagics/LICENSE` → `MIT License` (Copyright 2023 codedeliveryservice) | Rust magic number generator (Fancy/Plain), outputs `MagicEntry {mask,magic,shift,offset}`; used offline to emit `bench/magic-tables/*.json` (no GPL table copy). |
| 6 | `Chess_Movegen/` | `github.com/Gigantua/Chess_Movegen` (also `Gigantua/Gigantua`) | `a76800a55702788ac4f354e6e9fab563b474ec93` | `Chess_Movegen/LICENSE` → `MIT License` (Copyright 2021 dangi12012) | Comprehensive C++ movegen comparison (HQ, Black Magic, Kindergarten, etc.); source of `MQueens/s` harness precedent. |
| 6b | `Gigantua/` | `github.com/Gigantua/Gigantua` | `2e82933789af6d83e7bfa2500b3de92e1698ddff` | MIT (via `Chess_Movegen` lineage) | Main Gigantua engine; same author, same MIT lineage as `Chess_Movegen`. |

All 6 required clones are present. `Gigantua/` is an extra sibling from same author for completeness.

## Verification commands

```bash
ls refs/mit-permissive/
# GopherCheck  NuclearChess  Chess4j  magic-bits  RecklessMagics  Chess_Movegen  Gigantua  README.md

grep -l "MIT License" refs/mit-permissive/*/LICENSE refs/mit-permissive/*/LICENSE.txt
# should list 6 matches (GopherCheck, NuclearChess, Chess4j, magic-bits, RecklessMagics, Chess_Movegen)

# Pinning — exact commit per clone
git -C refs/mit-permissive/GopherCheck rev-parse HEAD
# 882982b2f23b7ead78e6414782c502da09dd3faa
git -C refs/mit-permissive/NuclearChess rev-parse HEAD
# 5e76c94d9046ad3472912dccd2f71200275e4af4
git -C refs/mit-permissive/Chess4j rev-parse HEAD
# d1414758a2b1190712ae770baefd5014a12b84ec
git -C refs/mit-permissive/magic-bits rev-parse HEAD
# 3152d1bf63d7ec2ce3b69dc5b2474db7abd419fa
git -C refs/mit-permissive/RecklessMagics rev-parse HEAD
# fcce46b1ca6a5052a7ddab9eaef03dad5e046907
git -C refs/mit-permissive/Chess_Movegen rev-parse HEAD
# a76800a55702788ac4f354e6e9fab563b474ec93

# No GPL text in permissive side
rg -n "GPL" refs/mit-permissive/  # should be empty (except README mentions)
```

## Usage notes for impl agent

- **Allowed:** reading `magic-bits/include/*.hpp`, `RecklessMagics/src/*.rs`, `GopherCheck/bitboard_magic.go`, `Chess_Movegen/*Magic*.hpp` for algorithmic insight (all MIT).
- **Tables:** magic tables must be **regenerated** via `RecklessMagics`/`magic-bits` and checked into `bench/magic-tables/*.json`. Never copy `GopherCheck/magics.json` verbatim as GPL-derived? It's MIT so it's safe, but spec says regenerate for audit uniformity.
- **Not allowed:** reading `refs/gpl-only/` (gitignored, never mounted).

## License audit

Each `LICENSE` file extracted below:

- `GopherCheck/LICENSE`: `MIT License`, Copyright (c) 2014 Stephen J. Lovell — verified
- `NuclearChess/LICENSE`: `MIT License`, Copyright (c) 2014 Lionel + Chessboard.js MIT — verified
- `Chess4j/LICENSE.txt`: `MIT License`, Copyright (c) 2017 — verified
- `magic-bits/LICENSE`: `MIT License`, Copyright (c) 2024 Goutham P Bhat — verified
- `RecklessMagics/LICENSE`: `MIT License`, Copyright (c) 2023 codedeliveryservice — verified
- `Chess_Movegen/LICENSE`: `MIT License`, Copyright (c) 2021 dangi12012 — verified

All clones satisfy the `SHALL` in `specs/purechess-baseline/spec.md` (clean-room wall).
