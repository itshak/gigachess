# ADR-005: Chessground Over Alternatives

**Status:** Accepted (2025, reaffirmed August 2026)

## Context

The chess board UI is the most critical visual component. Options evaluated:
- **@lichess-org/chessground** (GPL-3.0) — Lichess board library
- **react-chessboard** (MIT) — React wrapper around chessboard.js
- **cm-chessboard** (MIT) — Standalone SVG chessboard
- **Custom implementation** — Built from scratch

## Decision

Use **@lichess-org/chessground** (GPL-3.0) despite the licensing implications.

### Why

1. **Accessibility:** Chessground renders the board as a controlled surface, NOT as individual draggable DOM elements. This is critical for screen readers — react-chessboard makes each piece a separate draggable element, flooding VoiceOver/NVDA with "draggable" announcements.

2. **Performance:** Chessground is battle-tested on Lichess (100M+ games played). Smooth animations, minimal repaints, efficient piece movement.

3. **Feature completeness:** Premove, autoqueening, drawing arrows/circles, move highlights, orientation flip — all built in.

4. **Prior experience:** The project originally used react-chessboard. It was noticeably more sluggish and the draggable-element screen reader issue was never resolved.

## Alternatives Considered

1. **react-chessboard (MIT)** — Previously used. Rejected due to: (a) sluggish performance, (b) draggable elements flood screen readers, (c) less mature animation system.
2. **cm-chessboard (MIT)** — SVG-based, clean API, but: no premove, limited community, untested accessibility.
3. **Custom board** — Prohibitive development time, risk of introducing accessibility bugs.

## Consequences

### Positive
- Best-in-class board UX (matches Lichess quality)
- Screen reader compatible (no draggable element pollution)
- Smooth animations, premove support, drawing tools

### Negative
- GPL-3.0 license forces the entire app to be open source (→ ADR-001)
- Tightly coupled to chessground's DOM structure (custom CSS, overlay layer)
- Locked to Lichess's development decisions
