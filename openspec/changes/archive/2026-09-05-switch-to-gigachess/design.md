## Context

See `proposal.md` for motivation. The library is currently published on npm as `turbochess` (v0.2.0, published 2026-09-01 with zero external users) and developed locally under `/Users/ais/Projects/turbochess`. The name `turbochess` is taken on crates.io by an abandoned 2023 crate, making a unified cross-language brand between the TypeScript library and the Rust engine impossible under that name. Switching to `gigachess` unifies both repositories, aligns with the `GigaBase` ecosystem, and provides a completely clean namespace on npm and crates.io.

## Goals / Non-Goals

**Goals:**
- Rename the npm package from `turbochess` to `gigachess` in `package.json` and export configurations.
- Update all documentation (`README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `CONTRIBUTING.md`), benchmark scripts, and test suites to `gigachess`.
- Generate and deploy production-grade brand assets (`assets/logo.png`, `assets/social-preview.png`) with GigaChess cybernetic branding.
- Establish an npm transition strategy: publish `gigachess@0.2.0` (or `0.1.0`), and publish a forwarding/deprecation wrapper for `turbochess` with `npm deprecate`.
- Ensure 100% test passing, typechecking, and benchmark parity (all 24 performance gates green).

**Non-Goals:**
- Changing internal engine algorithms (zero-BigInt 32-bit pairs, Black Magic slider attacks, and Stockfish pin/check architectures remain untouched).
- Breaking public API ergonomics (`Chess`, `Chessops`, `parsePgn`, `Board` APIs remain identical).
- Renaming unrelated workspaces or external applications until this core package is published.

## Decisions

### Decision 1: Rename `package.json` to `gigachess` with identical export map
- **Choice**: Change `name: "gigachess"` in `package.json`. Preserve exact export paths (`.`, `./core`, `./pgn`, `./chess960`, `./chessops`, `./chessjs`) mapping to `./dist/*`.
- **Rationale**: Consumers get zero friction beyond replacing `"turbochess"` with `"gigachess"` in `package.json` dependencies and import declarations.
- **Alternatives Considered**: Scoped package `@gigabase/chess` (rejected because single-word unscoped packages have significantly higher adoption and prestige on npm, and `gigachess` is available).

### Decision 2: Backward compatibility via deprecation wrapper on `turbochess`
- **Choice**: Since `turbochess` has virtually zero external users (1 day old), publish `turbochess@0.2.1` that re-exports everything from `gigachess` and run `npm deprecate turbochess "turbochess has been renamed to gigachess. Please install gigachess instead."`
- **Rationale**: Any accidental early adopters get smooth forwarding without silent breaks, while npm clearly signals the canonical package.
- **Alternatives Considered**: Immediate unpublish (risks breaking anyone who ran `npm i turbochess` within the last 24 hours).

### Decision 3: Visual Identity Assets
- **Choice**: Modernize the brand with the cybernetic mechanical knight logo incorporating "GIGACHESS" typography, electric cyan and gold illumination, and hexagonal badge geometry. Generate `assets/logo.png` and `assets/social-preview.png` (1200x630 OpenGraph card).
- **Rationale**: Maintains visual continuity with the existing futuristic aesthetic while updating the name prominently.

### Decision 4: Global documentation and benchmark string updates
- **Choice**: Update all user-facing names in `README.md`, `bench/bench-real.mjs`, and `tests/` from "TurboChess" to "GigaChess". Internal code variables that do not contain "turbo" require no changes.

## Risks / Trade-offs

- **[Risk] Name squatting race condition on npm or crates.io** → *Mitigation*: Register/publish placeholder or initial version of `gigachess` on npm immediately once the change is approved.
- **[Risk] Broken import references in downstream projects (e.g. `blind-base`)** → *Mitigation*: The `turbochess` re-export wrapper provides a grace period, while `blind-base` package.json will be updated in a follow-up commit.
- **[Risk] Benchmark regression during rename** → *Mitigation*: The change touches zero hot loop engine logic. Pre-publish gate mandates running `node --expose-gc bench/bench-real.mjs --quick` to ensure all 24 gates remain green.
