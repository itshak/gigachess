## Why

The name `turbochess` is already occupied on crates.io by an abandoned 2023 chess move generator, preventing a unified multi-language ecosystem name with the upcoming Rust engine (`turbochess-rs`). Switching now to `gigachess` unifies both the JavaScript/TypeScript and Rust libraries under a clean, available, and highly brandable name with zero migration penalty, aligns directly with the `GigaBase` chess workstation ecosystem, and eliminates developer confusion.

## What Changes

- **BREAKING**: Rename npm package identifier from `turbochess` to `gigachess` in `package.json`.
- **BREAKING**: Update public package exports and import specifiers (`gigachess`, `gigachess/core`, `gigachess/pgn`, `gigachess/chessops`, etc.). Provide a backward-compatibility transition re-export or deprecation notice for `turbochess`.
- **Branding & Visual Identity**: Generate and deploy new GigaChess brand assets (`assets/logo.png`, `assets/social-preview.png`, SVG icons) featuring the cybernetic mechanical knight with GigaChess styling.
- **Documentation & Engine Metadata**: Update `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, benchmarks, test suites, and repository links to reflect `gigachess`.
- **NPM Package Publishing Preparation**: Configure build scripts, verification gates, metadata, and npm publish workflow for the initial release of `gigachess`.

## Capabilities

### New Capabilities
- `gigachess-rename`: Comprehensive rename of the library package, import specifiers, branding assets, documentation, and npm deployment configuration to `gigachess`.

### Modified Capabilities
<!-- None: This is a standalone renaming capability and clean transition -->

## Impact

- **NPM & Consumers**: New package `gigachess` published to npm; consumers update imports from `turbochess` to `gigachess`.
- **Source Code**: Source code references, comments, banner strings, and tests updated to refer to `gigachess`.
- **Build & Artifacts**: Build output in `dist/` will reflect the new package metadata and typings.
- **Cross-repo Synergy**: Enables identical naming in the Rust engine (`gigachess` on crates.io) and direct harmony with `blind-base` / `GigaBase`.
