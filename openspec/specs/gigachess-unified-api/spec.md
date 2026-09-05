# gigachess-unified-api Specification

## Purpose
Defines the Unified Super `Chess` class in `gigachess/chessjs` providing an intuitive, high-performance superset of the `chess.js` API with native tree navigation, bitboard movegen, and 1-line backward compatibility wrappers for `chess.js` and `chessops` consumers.

## Requirements

### Requirement: Unified `Chess` Class SHALL Provide an Ergonomic Superset of `chess.js` and `chesstree`

The system SHALL export `Chess` from the root entrypoint `gigachess` (and `gigachess/chessjs`) providing a stateful, high-performance facade class that implements all standard `chess.js` method contracts (`fen()`, `turn()`, `move()`, `moves()`, `history()`, `undo()`, `reset()`, `load()`, `isCheckmate()`, `isStalemate()`, `isDraw()`, `isInsufficientMaterial()`, `isThreefoldRepetition()`, `perft()`) while delegating move execution and state tracking directly to the native `Board` core.

#### Scenario: Basic move execution matches chess.js ergonomics
- **WHEN** a user instantiates `const game = new Chess()` and calls `game.move("e4")`
- **THEN** the internal state advances via the underlying `Board`, `game.fen()` returns the new FEN, `game.turn()` returns `"b"`, and `game.history()` returns `["e4"]` with zero intermediate wrapper object overhead

#### Scenario: Integrated tree export from live game state
- **WHEN** a game is played through multiple moves and `const tree = game.toTree()` is called
- **THEN** the resulting tree wrapper provides recursive variation navigation (`nodeAtPath`, `getNodeList`, `addNode`, `setCommentAt`) and `tree.pgn()` renders full recursive PGN text with comments and glyphs

### Requirement: Package Exports SHALL Provide Dedicated `gigachess/chessjs` Compatibility Module

The system SHALL configure `package.json` exports such that `"gigachess/chessjs"` resolves to the dedicated `Chess` compatibility wrapper module, while the package root `"."` exports the native `Board` engine API without root backward compatibility aliases.

#### Scenario: Drop-in 1-line swap for chess.js consumers via dedicated wrapper
- **WHEN** an external project replaces `import { Chess } from 'chess.js'` with `import { Chess } from 'gigachess/chessjs'`
- **THEN** all existing method calls (`load`, `fen`, `move`, `moves({ verbose: true })`, `history({ verbose: true })`, `undo`) work identically with zero code modifications and run with native bitboard acceleration

### Requirement: Chessops Compatibility Layer SHALL Expose Integrated Tree Analysis

The system SHALL expose `gigachess/chessops` maintaining 100% exact API parity with `chessops@0.15.1` while re-exporting integrated `buildTree` and `pgnImport` methods from the same package.

#### Scenario: Workstation uses single dependency for chessops and chesstree
- **WHEN** `blind-base` imports `{ Chess, parseFen, makeFen }` and `{ buildTree, pgnImport }` from `gigachess/chessops`
- **THEN** typecheck exits 0, all vitest tests pass, and the standalone `@itshak/chesstree` package dependency is eliminated
