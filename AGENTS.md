# AGENTS.md — PureChess AI Agent Instructions

> This file is the canonical "README for AI agents" working on PureChess.
> All AI coding assistants (Gemini, Claude, Cursor, Copilot, JetBrains AI) should read this file before making any changes.

## Project Overview

**PureChess** is a native, local-first, accessible chess workstation and database application.

- **License:** AGPL-3.0-or-later (desktop app is free and open source)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Tauri 2, Rust 2021 edition |
| **Frontend** | React 19, TypeScript (strict mode), Vite 8, Tailwind CSS 4 |
| **UI Primitives** | Radix UI (Dialog, Tabs, Select, etc.), Lucide icons |
| **Chess Board** | @lichess-org/chessground (GPL-3.0) |
| **Chess Logic (JS)** | chessops (GPL-3.0), pgn-chess-tree (AGPL-3.0) |
| **Chess Logic (Rust)** | shakmaty 0.30 (GPL-3.0) — move gen, Zobrist hashing, FEN/SAN/UCI |
| **Database** | SQLite via rusqlite (local app data: .bbconf, .bbgb, .bbpz, .bbdr, .bbdb, .bbr) |
| **Engine** | Stockfish (external process, UCI protocol) |
| **Fonts** | Atkinson Hyperlegible (UI), JetBrains Mono (engine/code) |
| **i18n** | i18next + react-i18next (en, ru, he) |

## Build & Test Commands

```bash
# Frontend
npm install              # install dependencies
npm run dev              # Vite dev server
npm run build            # production build
npm run typecheck        # TypeScript strict check (MUST pass before done)
npm run test             # vitest unit tests

# Full app (Tauri)
npm run tauri-dev        # full Tauri dev mode with hot reload
npm run tauri-dev-release # Tauri dev with release-mode Rust (faster runtime)

# Rust backend
cd src-tauri && cargo check   # type check Rust code
cd src-tauri && cargo test    # run Rust tests
cd src-tauri && cargo clippy  # lint Rust code

# Release
npm run tauri:build:app  # macOS .app bundle
npm run tauri:dmg        # macOS .dmg installer
```

## Project Constitution — ALWAYS Follow These Rules

### Accessibility (Non-Negotiable)

- **NEVER** ship a feature without full keyboard navigation
- **NEVER** use `Ctrl+` shortcuts on Windows — they conflict with NVDA/JAWS browse mode
- **ALWAYS** use `Alt+` chords on Windows (e.g., `Alt+B`, `Alt+R`, `Alt+N`)
- **ALWAYS** announce state changes via `AriaLiveAnnouncer` — keep announcements short and queue-safe
- **ALWAYS** ensure board interactions work without a mouse
- **NEVER** rely solely on color to convey information
- **NEVER** use `autoFocus` on elements that would disrupt screen reader flow — use smart focus management
- Arrow key move navigation (`enableArrowMoveShortcuts`) is **OFF by default** — screen readers need arrows for their own navigation
- Standard move stepping shortcuts: `[` (back) and `]` (forward)

### Code Quality

- **NEVER** remove existing comments or docstrings unrelated to your change
- **ALWAYS** preserve i18n: any user-facing string MUST have keys in `en`, `ru`, `he` translation files
- **ALWAYS** run `npm run typecheck` before declaring work complete
- **ALWAYS** run `cd src-tauri && cargo check` for any Rust changes
- **NEVER** modify database schemas without recording an ADR in `openspec/adr/`
- **NEVER** introduce new npm dependencies without evaluating license compatibility (no GPL-incompatible licenses)
- **ALWAYS** include the OpenSpec change ID in every git commit message when working on an active change — format: `[change-id] Descriptive commit message` (e.g., `[sound-design] Add move sound effects for piece capture`). This links every commit to its spec for traceability.
- Use functional React components with hooks — never class components
- Prefer Radix UI primitives for interactive elements (dialogs, menus, tabs, etc.)
- **DRY & Unified Board Architecture (ADR-011):**
  - **NEVER** copy-paste move announcement, sound playback, or board accessibility logic across view pages.
  - **ALWAYS** encapsulate and reuse the core primitives:
    - `useChessMoveAnnouncer` for move announcements, VoiceOver/screen reader live regions, and audio speech synthesis.
    - `useGameViewAccessibility` for keyboard navigation, focus management, and screen reader detection.
    - `useOnTheFlyMoveInput` for typing moves on the board.
    - `BoardContainer` / `GameViewShell` for shared board layout, clocks, overlays, and promotion picking.

### Chess Domain Rules

- Move notation: always support both `O-O` and `0-0` castle formats
- FEN: always validate with shakmaty before storing in database
- SRS: SM-2 algorithm — never modify the core formula without an ADR
- Board orientation: auto-orient by repertoire side (White at bottom for White repertoire)
- Zobrist hashing: use shakmaty's `Zobrist64` for all position-keyed lookups
- Engine evaluation: persist `eval_cp`, `mate`, `depth`, `engine_name` on repertoire nodes

### UI Design Principles

- **Text-light:** No redundant `<h1>` headers inside tabs. Eliminate paragraph descriptions under controls.
- **Tactile:** Large mode cards, SVG illustrations, compact pill button groups
- **Responsive:** Default 1450×800px, fluid collapse at 1350px/1024px breakpoints
- **Typography:** Atkinson Hyperlegible for UI, JetBrains Mono for engine/notation
- **Colors:** Cream `#F6F0E6` background, Espresso `#2C1B14` text

## Repository Map

```
purechess/
├── src/                           # React frontend
│   ├── components/                # UI components
│   │   ├── game/                  # Board, ChessgroundBoard, GameView
│   │   ├── repertoire/            # RepertoireWorkstation, Explorer, etc.
│   │   └── ui/                    # Shared UI primitives (Button, Card, etc.)
├── src-tauri/src/                 # Rust backend
│   ├── repertoires/               # Repertoire tree, import/export, SRS
│   ├── puzzles/                   # Puzzle import, uniqueness verification
│   ├── drills/                    # Endgame drill engine, Syzygy verification
│   ├── position_index/            # Position indexing for search
│   ├── rust_position_search.rs    # Parallel GigaBase position search
│   ├── gigabase_moves.rs          # GigaBase move parsing
│   └── masters_pack.rs            # Masters opening tree
├── docs/                          # Public documentation
├── openspec/                      # OpenSpec specs, ADRs, changes
│   ├── specs/                     # Source of Truth (feature specs)
│   ├── adr/                       # Architecture Decision Records (public)
│   ├── changes/                   # Active changes
│   └── history/                   # Archived changes
```

## OpenSpec Workflow

This project uses [OpenSpec](https://openspec.dev) for spec-driven development.

### Before Planning or Coding

1. Read relevant capability specs under `openspec/specs/`
2. Read ADR index under `openspec/adr/`
3. Check active changes with `openspec list`

### For Significant Changes

Follow the OpenSpec lifecycle:
1. **Explore:** `/opsx:explore` — investigate, brainstorm, NO code
2. **Propose:** `/opsx:propose` — create a change with proposal, specs, design, tasks
3. **Apply:** `/opsx:apply` — implement the tasks
4. **Verify:** `/opsx:validate` — validate against the spec
5. **Archive:** `/opsx:archive` — merge into Source of Truth

### For Small Fixes

Bug fixes, typos, and minor UI tweaks don't need the full OpenSpec cycle. Just fix them and ensure tests pass.

## Environment Setup (New Machines)

```bash
# 1. Clone the repo
git clone <repo-url>
cd purechess

# 2. Install dependencies
npm install
cd src-tauri && cargo build && cd ..

# 3. Install OpenSpec CLI
npm install -g @fission-ai/openspec@latest

# 4. Verify
openspec list                    # should show active changes
npm run typecheck                # should pass
npm run test                     # should pass
```
