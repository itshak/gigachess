# refs/gpl-only — GPL-Tainted References (spec agent only)

> **WARNING: This directory is `gitignored` and is NEVER mounted for the impl agent.**
> Only the **spec agent** (Phase 2, `purechess-spec` change) may read it.
> No file from this directory SHALL be copied into `src/`, `bench/candidates/`, or `bench/magic-tables/` verbatim.
> Magic tables must be regenerated via MIT tools (`RecklessMagics` / `magic-bits`) and checked in as JSON.

## Why this directory exists

PureChess is AGPL-3.0-or-later *because* it bundles GPL-3.0 chess libs (`chessops` TS, `shakmaty` Rust, `chessground`) per ADR-001 and ADR-010.
For the future MIT `purechess` library we need accurate chess semantics (FIDE Laws, Chess960, PGN/FEN, SAN) but we must not taint the MIT implementation with GPL code.
Therefore GPL sources are isolated here, outside `src/` history, for **specification only**.

## Contents (spec-reference only)

| Directory (when cloned) | Upstream | License | Taint & purpose |
|--------------------------|----------|---------|-----------------|
| `chessops/` | `github.com/niklasf/chessops` (`@0.15.1` baseline) | **GPL-3.0-or-later** | TS chess logic (Board, SquareSet, `bishopAttacks`/`rookAttacks` hyperbola-quintessence, FEN/SAN/PGN). Current workstation `src/lib/chess.ts` dep (ADR-010). Spec agent reads it to derive *language-neutral* rule tables, grammars, and API shape — **never copies code or docstrings verbatim**. |
| `Stockfish/` | `github.com/official-stockfish/Stockfish` | **GPL-3.0** | UCI engine; reference for move legality, perft, syzygy, UCI semantics. Spec agent may consult for edge-case semantics; impl never copies. |
| `pgn-chess-tree/` | `github.com/anomalyco/pgn-chess-tree` | **AGPL-3.0** | PGN `GameTree` parser/tree that the author themselves wrote. **Ownership does not cleanse GPL taint:** the repo imports `chessops` (GPL-3.0-or-later) and lichess GPL helpers, so the combined work is GPL-tainted. Therefore it is **treated as `gpl-only/`** here. Its optimizations (streaming chunking, SAN tree shape, variation/NAG handling) **SHALL NOT be copied** into `src/` — they must be **re-specified** abstractly (headers, variations, NAGs, `GameTree` node shape, chunked parser state machine) and then re-implemented clean-room from that spec. See design.md Decision "Two-phase, two-agent clean-room". |

All three are **spec inputs** for Phase 2 delta specs (`purechess-rules`, `purechess-board-movegen`, `purechess-pgn-fen`). The impl agent in Phase 2 reads **only** the resulting `specs/` markdown + `bench/magic-tables/*.json` (generated via MIT tools), not these sources.

## `pgn-chess-tree` ownership-but-GPL-taint nuance

`pgn-chess-tree` is authored by the PureChess author, but because it depends on `chessops` and lichess GPL code, the work as a whole is AGPL-3.0. Per GPL copyleft, distributing it conveys the GPL obligations to recipients. For `purechess` to remain MIT, we must not copy its source into `src/` — even the author's own optimizations. Instead:

1. Spec agent **reads** `pgn-chess-tree` behavior (public API: `parsePgn`, `GameTree` node shape, headers, comments, variations, NAGs, streaming chunking) and writes a **language-neutral spec** (ABNF/EBNF for PGN, state machine for chunked parsing, tree invariants).
2. Impl agent **implements** from that spec using only `refs/mit-permissive/` and `refs/docs-refs/`.

This preserves the AGPL boundary and gives a clean audit trail.

## Physical isolation

```bash
# This directory is blocked from git and impl-agent history
cat .gitignore | grep "refs/gpl-only/"
# refs/gpl-only/

ls refs/
# gpl-only/  mit-permissive/  docs-refs/  README.md

# Impl agent mount (verified in CI)
# Only these are allowed:
ls refs/mit-permissive/  # MIT clones
ls refs/docs-refs/       # FIDE / python-chess docs
# refs/gpl-only/ is absent from mount

# No GPL text may appear in implementation output
rg -n "GPL" src/ bench/  # must be empty (except this README and spec references)
```

### Git history audit

```bash
git log --all -- refs/gpl-only/  # should be empty or contain only spec-agent commits with prefix [purechess-library][spec]
git check-ignore -v refs/gpl-only/chessops  # shows .gitignore: refs/gpl-only/
```

If a contributor needs Chess960/FIDE/PGN detail derived from `chessops` or Stockfish, they **must** do so as spec agent on a separate `openspec/changes/purechess-spec/` branch, producing markdown tables — never by editing `src/` directly.

## Cloning (spec agent only, not in baseline)

Phase 1 baseline does **not** clone these repos into the working tree (to keep the commit history clean). For local spec derivation, use an *out-of-tree* location or a gitignored clone:

```bash
# Out-of-tree (preferred, never committed)
git clone https://github.com/niklasf/chessops.git ../purechess-refs/chessops
git clone https://github.com/official-stockfish/Stockfish.git ../purechess-refs/Stockfish
git clone https://github.com/anomalyco/pgn-chess-tree.git ../purechess-refs/pgn-chess-tree

# Or gitignored in-tree (still not tracked)
git clone https://github.com/niklasf/chessops.git refs/gpl-only/chessops   # ignored by .gitignore
```

Do **not** `git add refs/gpl-only/` — CI will fail if any GPL file is tracked.

## License texts (summary)

- `chessops`: GPL-3.0-or-later (`LICENSE` in upstream)
- Stockfish: GPL-3.0 (`Copying.txt`)
- `pgn-chess-tree`: AGPL-3.0 (author-owned, but GPL-tainted via `chessops`)

The library target `purechess` itself will be MIT; this directory's purpose is to keep the GPL wall auditable (ADR-001, ADR-009, ADR-010 follow-up).

## Verification (task 1.3)

```bash
ls refs/                          # shows gpl-only/  mit-permissive/  docs-refs/
cat refs/README.md | grep -A2 "gpl-only"
cat refs/gpl-only/README.md | head -n 40
cat .gitignore | grep "refs/gpl-only/"  # must print refs/gpl-only/
git check-ignore refs/gpl-only/chessops  # .gitignore: refs/gpl-only/
```
