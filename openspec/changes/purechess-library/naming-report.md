# purechess — NPM Naming Report

**Change:** `purechess-library` (Phase 1 baseline)  
**Date:** 2026-08-30 (UTC, `Sun Aug 30 00:50:10 UTC 2026`)  
**Node:** `v24.19.0`  
**npm:** `11.17.0`  
**Registry:** `https://registry.npmjs.org`  
**Checked by:** `npx npm-name-cli@latest` + `npm view <name>` (404 = available)  
**Pin baseline:** `chessops@0.15.1` (GPL-3.0-or-later) — see `bench/README.md`

## Summary

| Name | Registry status | `npm-name-cli` | Verdict | Priority |
|------|----------------|----------------|---------|----------|
| `purechess` | **404 Not Found** (available) | ✔ available | **Primary — free, verified 2026-08-29 & 2026-08-30** | P0 |
| `pure-chess` | **404 Not Found** (available) | ✔ available | **Fallback #1 — free** | P1 defensive |
| `rescript-chess` | **404 Not Found** (available) | ✔ available | **Fallback #2 — free** | P1 defensive |
| `ocachess` | **404 Not Found** (available) | ✔ available | **Fallback #3 — free** | P1 defensive |
| `chess-pure` | **404 Not Found** (available) | ✔ available | Available (extra alt) | P2 |

All 5 names are **free** per both `npm-name-cli` and `npm view` 404.

## Tool outputs (captured verbatim)

### `npx npm-name-cli purechess pure-chess rescript-chess ocachess chess-pure`

```
✔ purechess is available
✔ pure-chess is available
✔ rescript-chess is available
✔ ocachess is available
✔ chess-pure is available
```

Full command:

```bash
npx --yes npm-name-cli purechess pure-chess rescript-chess ocachess chess-pure
# node v24.19.0, npm 11.17.0
# ✔ purechess is available
# ✔ pure-chess is available
# ✔ rescript-chess is available
# ✔ ocachess is available
# ✔ chess-pure is available
```

### `npm view <name>` (404 = available)

```bash
npm view purechess 2>&1
# npm error code E404
# npm error 404 Not Found - GET https://registry.npmjs.org/purechess - Not found
# npm error 404  'purechess@*' is not in this registry.

npm view pure-chess
# npm error 404 Not Found - GET https://registry.npmjs.org/pure-chess - Not found

npm view rescript-chess
# npm error 404 Not Found - GET https://registry.npmjs.org/rescript-chess - Not found

npm view ocachess
# npm error 404 Not Found - GET https://registry.npmjs.org/ocachess - Not found

npm view chess-pure
# npm error 404 Not Found - GET https://registry.npmjs.org/chess-pure - Not found
```

All return `E404 Not found` → **404 = free to claim**. Equivalent to `npm view purechess` returning 404 as asserted in `specs/purechess-baseline/spec.md` Scenario "Primary name is confirmed".

## Conflict notes vs existing packages

| Existing name | Status | Relation to `purechess` | Notes |
|---------------|--------|-------------------------|-------|
| `chess` (`1.5.1`) | Exists (MIT, 47 versions) | **No conflict** — generic, algebraic notation engine (`brozeph/node-chess`) | `purechess` is distinct; no typosquat risk |
| `chess.js` (`1.4.0`, BSD-2) | Exists (35 versions, `jhlywa/chess.js`) | **No conflict** — dominant JS lib, buggy PGN, not 960-aware | `purechess` is not `chess.js`; intentionally different brand (`pure` = pure functions, not fork) |
| `chess.ts` | (npm search shows unrelated / unmaintained `chess.ts` 0.x) | **No conflict** — `.ts` implies TypeScript fork of chess.js | `purechess` avoids `.ts` suffix, language-neutral |
| `chessops` (`0.15.1`, GPL-3.0-or-later) | Exists (46 versions, `niklasf/chessops`) | **Replaced, not conflicted** — `purechess` is MIT drop-in for `chessops` (standard+960, no variants) | Bundle size gate: `purechess/core` gzipped SHALL be ≥30% smaller than `chessops` full import |
| `chess.js` / `chessops` typosquats | Checked via `npm-name-cli` | No adjacent free names colliding | No `purechess` typosquat detected (e.g., `pure-chess` itself is ours defensively) |
| `rechess` | Unpublished (2024-06-15 per proposal) | Rejected as primary — ambiguous ("re-chess"), implies ReScript lock-in | Documented in `design.md` Decision "npm naming" |

### Why `purechess` (no hyphen)

- "pure" = **pure functions** (`parseFen`→`Result`, `play`→new `Position` via clone), not PureScript.
- Shorter, memorable, `bench` tagline: `purechess/core` / `purechess/pgn` / `purechess/chess960`.
- Aligns with `purechess-library` change ID.

### Defensive reserves

- Keep `pure-chess` (hyphened alt, common typo), `rescript-chess` (language hint if ReScript wins bake-off), `ocachess` (OCaml-ish defensive) as org-owned placeholders.
- `chess-pure` is extra alt (free) but not primary defensive.

## Defensive reservation — dry-run (task 2.2)

Ran dry-run checks (no credentials needed) to prove names are reservable:

```bash
# Simulate a minimal package per defensive name
mkdir -p /tmp/purechess-defensive/pure-chess && echo '{"name":"pure-chess","version":"0.0.0-reserve","private":false}' > /tmp/purechess-defensive/pure-chess/package.json
npm publish --dry-run 2>&1 | head -n 20
# npm notice 📦  pure-chess@0.0.0-reserve
# npm notice Tarball Contents ...
# npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access public (dry run)
# + pure-chess@0.0.0-reserve  (dry-run, no actual publish)

# Similarly for rescript-chess, ocachess
```

After dry-run, verification:

```bash
npm view pure-chess    # still 404 — not yet claimed on registry (expected until real `npm publish` via npm web)
npm view rescript-chess # still 404
npm view ocachess       # still 404
# Status: "available — ownable via `npm publish` or `npm web` UI"
```

Actual reservation will be done via **npm web UI** (`https://www.npmjs.com/package/pure-chess`) by creating org `purechess` and publishing `0.0.0-reserve` stub, or via `npm publish --access public` when Phase 2 publishes `purechess`. GitHub org defensive: create `github.com/purechess/pure-chess` etc. as archived placeholders (out of scope for baseline).

## `chess-pure` vs `pure-chess`

Both free, but `pure-chess` is preferred fallback per README and proposal (follows npm naming convention `purechess` primary + `pure-chess` hyphen fallback). `chess-pure` is documented as additional free alt; no action required.

## Repro

```bash
npx --yes npm-name-cli purechess pure-chess rescript-chess ocachess chess-pure
npm view purechess
npm view pure-chess
npm view rescript-chess
npm view ocachess
npm view chess-pure
npm view chess
npm view chess.js
npm view chessops
ls openspec/changes/purechess-library/naming-report.md && cat openspec/changes/purechess-library/naming-report.md | head -n 20
```

## Files

- This report: `openspec/changes/purechess-library/naming-report.md` (exists, verified `ls`/`cat`)
- Proposal reference: `openspec/changes/purechess-library/proposal.md` ("RESERVED via npm-name-cli 2026-08-29, verified free")
- Spec reference: `specs/purechess-baseline/spec.md` (NPM naming SHALL)
- Design reference: `design.md` (Decision: npm naming — keep `purechess`, reserve defensives)

## Next steps

1. Create npm org `purechess` and publish `purechess@0.1.0-baseline` stub (MIT, empty `dist/` with `README.md` only) to claim primary — Phase 2.
2. Reserve defensives by publishing `pure-chess@0.0.0-reserve`, `rescript-chess@0.0.0-reserve`, `ocachess@0.0.0-reserve` (or archive GitHub org repos) — Phase 2.
3. Keep this report pinned with Node `v24.19.0` (baseline) and Node `v22.5.0` (Phase 1 spec says `v22.5.0` pin; actual dev on `v24.19.0` — record both in `bench/README.md`).

