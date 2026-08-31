## ADDED Requirements

### Requirement: Move Generation and Perft SHALL Calculate 100% Genuine Tree Traversals Without Hardcoded Shortcuts

The system SHALL execute full legal move generation and recursive perft traversals dynamically for all positions, depths, and variants. The engine SHALL NOT short-circuit startpos or any other position via pre-computed lookup tables or hardcoded node count constants (`START_PERFT`).

#### Scenario: Full dynamic calculation for startpos perft
- **WHEN** `perft(startpos, depth)` is invoked for any depth 1 through 6
- **THEN** the engine generates every legal branch dynamically from the live bitboard state, matching the reference node counts (e.g. depth 5 = 4,865,609; depth 6 = 119,060,324) without reading from constant arrays
