# gigachess-rename Specification

## Purpose
Establishes the library rebranding from turbochess to gigachess across package metadata, export specifiers, visual brand assets, and npm publishing configurations to unify the TypeScript and Rust chess ecosystems.

## Requirements

### Requirement: Package rename and export resolution under gigachess
The system SHALL rename the package identifier in `package.json` to `gigachess` and expose all modern module subpaths (`gigachess`, `gigachess/core`, `gigachess/pgn`, `gigachess/chess960`, `gigachess/chessops`, `gigachess/chessjs`) with identical TypeScript declaration maps and ESM module artifacts.

#### Scenario: Clean ESM imports from gigachess root
- **WHEN** a consumer executes `import { Chess } from "gigachess"`
- **THEN** it resolves to `./dist/index.js` with full TypeScript type definitions and tree-shaking support without runtime overhead.

#### Scenario: Clean submodule imports from gigachess subpaths
- **WHEN** a consumer imports from `gigachess/core`, `gigachess/pgn`, `gigachess/chessops`, or `gigachess/chess960`
- **THEN** the import resolves to the respective build target in `./dist/` with matched types and zero-leak side effects.

### Requirement: Backward-compatibility and transition for turbochess
The system SHALL maintain a clear transition path for existing consumers importing `turbochess` by providing an npm alias or re-export package pointing directly to `gigachess`.

#### Scenario: Consumer using legacy package name
- **WHEN** a consumer installs or imports from legacy `turbochess`
- **THEN** an npm deprecation notice or thin forwarding wrapper advises upgrading to `gigachess` without immediately breaking existing setups.

### Requirement: Visual brand identity and asset generation
The system SHALL provide updated, production-ready brand assets under `assets/` reflecting the `gigachess` identity, including a modern high-resolution logo (`assets/logo.png`), social preview card (`assets/social-preview.png`), and vector/favicon formats.

#### Scenario: Documentation renders gigachess brand assets
- **WHEN** a user or developer views `README.md` or repository documentation
- **THEN** the header displays the official `gigachess` badge and logo showcasing the cybernetic knight and GigaChess branding.

#### Scenario: Social link unfurling
- **WHEN** the repository or package link is shared on GitHub, Discord, Twitter/X, or chat platforms
- **THEN** OpenGraph metadata references `assets/social-preview.png` featuring GigaChess visual branding.

### Requirement: NPM package publishing and verification
The system SHALL configure package build scripts, prepublish validations, and npm metadata so that `npm publish` deploys `gigachess` cleanly to the npm registry with all verification tests and benchmarks passing.

#### Scenario: Pre-publish verification passes cleanly
- **WHEN** the build and verification command sequence (`npm run typecheck`, `npm test`, `node --expose-gc bench/bench-real.mjs --quick`) is run prior to publishing
- **THEN** all 165+ test suites pass, TypeScript compiles with zero errors, and all 24 benchmark gates remain green.
