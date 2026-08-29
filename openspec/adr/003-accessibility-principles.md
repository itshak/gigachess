# ADR-003: Accessibility Principles — Keyboard-First, Triple Audience

**Status:** Accepted (2024, reaffirmed August 2026)

## Context

BlindBase serves three distinct audiences with different accessibility needs:
1. **Blind/visually impaired chess players** — screen readers (VoiceOver, NVDA, JAWS), keyboard only
2. **Sighted macOS chess players** — no native desktop chess DB exists on macOS
3. **Sighted keyboard power users** — prefer keyboard shortcuts over mouse

Traditional chess software (ChessBase, Scid, Lucas Chess) has zero screen reader support. Lichess has partial support for casual play but cannot do database searches, position analysis, or repertoire training.

## Decision

### Keyboard-First Architecture
- **ALL** features must be fully operable via keyboard
- Mouse/trackpad is supported but never required
- Arrow keys are reserved for screen reader navigation by default
- Move stepping uses `[` (back) and `]` (forward) — never arrows by default
- `enableArrowMoveShortcuts` is **OFF by default** (opt-in for sighted users)

### Windows Shortcut Convention
- **NEVER** use `Ctrl+` shortcuts — they conflict with NVDA/JAWS browse mode
- **ALWAYS** use `Alt+` chords (e.g., `Alt+B`, `Alt+R`, `Alt+N`)
- macOS uses `Cmd+` (no conflict with VoiceOver)

### ARIA and Announcements
- State changes announced via `AriaLiveAnnouncer` (polite region)
- Announcements must be short and queue-safe (no long paragraphs)
- Board moves announced: piece, from square, to square, captures, check
- Engine evaluations announced on change

### Asynchronous Loading Focus Transitions
- When asynchronous data fetching or background indexing is underway, keyboard and screen reader focus lands immediately on the loading overlay (`role="status"` / `aria-live="polite"`).
- When loading completes, focus transitions smoothly and automatically to the primary interactive element (e.g. the first item in the list or the primary tab).
- If content is already cached/loaded upon tab switch, focus lands directly on the primary control without intermediate focus jumps.

### Step-Through Keyboard Workflows
- Multi-step configuration screens (such as Tactics/Puzzles setup) support sequential `Enter` navigation and roving `tabIndex`.
- Arrow keys navigate among choices (modes, pill groups); `Enter` confirms and advances focus to the next parameter, culminating in `Enter` on the action button to begin the session.

### "Curb Cut" Philosophy
Accessibility-first design makes the product better for ALL users:
- Keyboard shortcuts make sighted power users faster
- Audio cues help sighted users when multitasking
- Clean, text-light UI benefits everyone

## Alternatives Considered

1. **Add accessibility as a "mode"** — Rejected. Accessibility must be the default, not an afterthought.
2. **Use Ctrl+ shortcuts with "screen reader mode" toggle** — Rejected. Too fragile, easy to break.
3. **Only support VoiceOver (macOS first)** — Rejected. Must support NVDA/JAWS for Windows from the start.

## Consequences

### Positive
- Only accessible chess workstation in existence → monopoly position
- Keyboard-first is genuinely faster for power users
- Founder is a blind user → dogfooding catches issues immediately

### Negative
- Every feature takes longer to implement (keyboard + ARIA + announcements)
- Some UI patterns that are visually intuitive need rethinking (drag-and-drop → type-to-move)
- Must maintain VoiceOver + NVDA + JAWS compatibility (three screen readers)
