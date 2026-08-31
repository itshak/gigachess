# Naming report — `turbochess` availability & conflicts

**Date:** 2026-08-31 (change: `turbochess-adopt`, task 1.1)

## Availability (npm registry, `npm view <name>`)

| Name | Status | Evidence |
|------|--------|----------|
| `turbochess` | **FREE** (404) | `npm view turbochess` → `npm error 404 Not Found - GET https://registry.npmjs.org/turbochess - Not found` |
| `turbo-chess` | **FREE** (404) — fallback reserved | `npm view turbo-chess` → `npm error 404 Not Found - GET https://registry.npmjs.org/turbo-chess - Not found` |

## Conflicts (existing packages — no name collision, but check confusion)

| Name | Status | Version | Note |
|------|--------|---------|------|
| `chess` | taken | 1.5.1 | distinct package; `turbochess` does not conflict |
| `chess.js` | taken | 1.4.0 | distinct package (bench baseline, dev-only) |
| `chess.ts` | taken | 0.16.2 | distinct package |
| `chessops` | taken | 0.15.1 | GPL-3.0 baseline; stays a dev-only bench dependency, never imported from `src/` |

## Reservation plan

- `turbochess` is reserved by the first `npm publish --access public` of this repo
  (package `name` renamed to `turbochess` in task 1.2). npm names are
  claim-on-publish; as of this report both candidate names are unclaimed.
- `turbo-chess` is the documented fallback if `turbochess` is squatted before
  publish.
- `purechess` remains a one-release alias: the `alias/purechess/` scaffold in
  this repo publishes a thin re-export package that depends on `turbochess`
  (see `openspec/adr/015-turbochess-rename.md` for the removal plan).
