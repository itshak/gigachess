## MODIFIED Requirements

### Requirement: Unified `Chess` Class SHALL Provide an Ergonomic Superset of `chess.js` and `chesstree`

The system SHALL export `Chess` from the root entrypoint `turbochess` (and `turbochess/chessjs`) providing a stateful, high-performance facade class that implements all standard `chess.js` method contracts (`fen()`, `turn()`, `move()`, `moves()`, `history()`, `undo()`, `reset()`, `load()`, `isCheckmate()`, `isStalemate()`, `isDraw()`, `isInsufficientMaterial()`, `isThreefoldRepetition()`, `perft()`) while delegating move execution and state tracking directly to the native `Board` core.

#### Scenario: Basic move execution matches chess.js ergonomics
- **WHEN** a user instantiates `const game = new Chess()` and calls `game.move("e4")`
- **THEN** the internal state advances via the underlying `Board`, `game.fen()` returns the new FEN, `game.turn()` returns `"b"`, and `game.history()` returns `["e4"]` with zero intermediate wrapper object overhead

#### Scenario: Integrated tree export from live game state
- **WHEN** a game is played through multiple moves and `const tree = game.toTree()` is called
- **THEN** the resulting tree wrapper provides recursive variation navigation (`nodeAtPath`, `getNodeList`, `addNode`, `setCommentAt`) and `tree.pgn()` renders full recursive PGN text with comments and glyphs
