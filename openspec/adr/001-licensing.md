# ADR-001: Licensing — AGPL Desktop, Proprietary Cloud

**Status:** Accepted (August 2026)

## Context

BlindBase depends on three GPL-3.0 licensed libraries:
- **chessground** (`@lichess-org/chessground`) — board UI rendering
- **chessops** (via `@itshak/chesstree`) — chess logic in TypeScript
- **shakmaty** — chess logic in Rust (move gen, Zobrist hashing, FEN/SAN/UCI)

GPL-3.0 is "strong copyleft" — any application that bundles GPL-3.0 code must make its source available under GPL-3.0 (or compatible) when distributed. This means the desktop app cannot be closed source.

## Decision

- **Desktop app:** Licensed under **AGPL-3.0-or-later** (stronger than required, but protects against cloud forks)
- **Cloud backend (future, Phase 3):** Proprietary/closed source — separate codebase running on our servers

### Why AGPL Instead of GPL

AGPL adds Section 13: if someone takes the desktop code and wraps a cloud service around it, they must open-source their cloud code. This prevents competitors from freeloading on the open desktop code.

### Cloud Server Legality

The cloud server can use shakmaty (GPL-3.0) without open-sourcing because:
1. **GPL SaaS loophole:** GPL-3.0 only triggers source disclosure on distribution. Running code on our own server is NOT distribution.
2. **Copyright ownership:** We own all BlindBase code and can relicense our own modules. Only third-party GPL libraries (shakmaty) are constrained, and the SaaS loophole covers them.

## Alternatives Considered

1. **Replace GPL deps with MIT alternatives** (react-chessboard, cozy-chess) — Rejected. Months of rewrite, significant UX regression, chessground's accessibility integration is critical.
2. **GPL-3.0 (not AGPL)** — Possible, but doesn't protect against cloud forks.
3. **Closed source** — Impossible with GPL dependencies.

## Consequences

### Positive
- Source code available to community → trust, contributions, transparency
- AGPL protects against cloud exploitation
- Cloud backend remains proprietary → real competitive moat

### Negative
- Anyone can build the app from source (mitigated: build process is non-trivial)
- Cannot sell the binary as a traditional closed-source product
- Must maintain clean separation between desktop (AGPL) and cloud (proprietary) code
