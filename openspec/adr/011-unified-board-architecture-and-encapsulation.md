# ADR-011: Unified Board Architecture, Encapsulation, and Single Source of Truth

**Status:** Accepted (August 2026)

## Context

BlindBase incorporates multiple chess workstation surfaces:
- **Game Analysis & Databases** (`GamePage` / `GameViewShell`)
- **Live Broadcasts** (`LiveGamePage` / `GameViewShell`)
- **Repertoire Workstation & Trainer** (`RepertoireWorkstation`, `RepertoireTrainer`)
- **Endgame Drills** (`DrillsPage` / `DrillsGameView`)
- **Tactics & Puzzles** (`PuzzlesPage` / `TacticsGameView`)
- **Position Setup / Editor** (`AccessibleBoardEditor`)

Previously, individual boards implemented their own custom `useEffect` hooks for:
1. Move tracking and sound effects (`playForSan`)
2. VoiceOver / screen reader ARIA move announcements (`formatChessMoveAnnouncement`)
3. Keyboard navigation and shortcuts (`[`, `]`, `f`, `Home`, `End`)
4. Focus management and on-the-fly move input

This caused subtle behavioral divergences across boards (e.g. move numbers or piece colors announced in one view but omitted in another, or speech audio options desynchronized).

## Decision

### 1. Mandatory Encapsulation & Reusability
- **NEVER** copy-paste move announcement, sound playback, or board accessibility logic across view pages.
- **ALWAYS** encapsulate and consume single-source-of-truth hooks and components.

### 2. Core Reusable Board Primitives
- **`useChessMoveAnnouncer`** (`src/hooks/useChessMoveAnnouncer.ts`):
  - Canonical hook for move announcements, VoiceOver/screen reader live regions, and audio speech synthesis.
  - Automatically handles move numbers for White and Black in full piece notation, color gender agreement, capture/check sound triggers, and live streaming debouncing.
- **`useGameViewAccessibility`** (`src/hooks/useGameViewAccessibility.ts`):
  - Canonical hook for game view keyboard shortcuts, focus orchestration, and screen reader active detection.
- **`useOnTheFlyMoveInput`** (`src/hooks/useOnTheFlyMoveInput.ts`):
  - Canonical hook for type-to-move input directly onto the active chessboard.
- **`BoardContainer`** (`src/components/game/BoardContainer.tsx`) & **`GameViewShell`** (`src/components/game/GameViewShell.tsx`):
  - Canonical visual & accessible board container wrapping `ChessgroundBoard`, `AccessibleChessboardOverlay`, `BoardPieceReader`, and `PromotionPicker`.

### 3. Verification & Compliance
- Any new board mode, training surface, or workstation must use these core primitives.
- Code reviews and agent instructions (`AGENTS.md`) must enforce this constraint.

## Consequences

### Positive
- Unified, consistent screen reader and audio experience across every board in the application.
- Enhancements or fixes to notation formatting, sound synthesis, or shortcuts instantly benefit all views with zero duplicate edits.
- Dramatically cleaner, smaller page components.

### Negative
- Shared hooks must support optional feature parameters (e.g. live round updates, comment attachments) cleanly without leaking page-specific concerns.
