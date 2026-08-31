# turbochess-unified-api Specification

## Purpose
Defines the Unified Super `Chess` class at the root `turbochess` package entrypoint, providing an intuitive, high-performance superset of the `chess.js` API with native tree navigation, bitboard movegen, and 1-line backward compatibility aliases for `chess.js` and `chessops` consumers.

## Requirements

### Requirement: Unified Root `Chess` Class SHALL Provide an Ergonomic Superset of `chess.js` and `chesstree`

The system SHALL export `Chess` from the root entrypoint `turbochess` providing a stateful, high-performance class that implements all standard `chess.js` method contracts (`fen()`, `turn()`, `move()`, `moves()`, `history()`, `undo()`, `reset()`, `load()`, `isCheckmate()`, `isStalemate()`, `isDraw()`, `isInsufficientMaterial()`, `isThreefoldRepetition()`, `perft()`) while adding direct tree analysis methods (`toTree()`, `loadTree()`) and fast bitboard legal move queries (`dests(square)`, `allDests()`).

#### Scenario: Basic move execution matches chess.js ergonomics
- **WHEN** a user instantiates `const game = new Chess()` and calls `game.move("e4")`
- **THEN** the internal state advances, `game.fen()` returns the new FEN, `game.turn()` returns `"b"`, and `game.history()` returns `["e4"]` with zero intermediate wrapper object overhead

#### Scenario: Integrated tree export from live game state
- **WHEN** a game is played through multiple moves and `const tree = game.toTree()` is called
- **THEN** the resulting tree wrapper provides recursive variation navigation (`nodeAtPath`, `getNodeList`, `addNode`, `setCommentAt`) and `tree.pgn()` renders full recursive PGN text with comments and glyphs

### Requirement: Package Exports SHALL Alias `turbochess/chessjs` Directly to the Root Module

The system SHALL configure `package.json` exports such that `"turbochess/chessjs"` resolves directly to the root `Chess` class distribution, deprecating and eliminating the standalone `src/chessjs.ts` wrapper file.

#### Scenario: Drop-in 1-line swap for chess.js consumers
- **WHEN** an external project replaces `import { Chess } from 'chess.js'` with `import { Chess } from 'turbochess/chessjs'` or `import { Chess } from 'turbochess'`
- **THEN** all existing method calls (`load`, `fen`, `move`, `moves({ verbose: true })`, `history({ verbose: true })`, `undo`) work identically with zero code modifications and run at ≥2.5x higher throughput

### Requirement: Chessops Compatibility Layer SHALL Expose Integrated Tree Analysis

The system SHALL expose `turbochess/chessops` maintaining 100% exact API parity with `chessops@0.15.1` while re-exporting integrated `buildTree` and `pgnImport` methods from the same package.

#### Scenario: Workstation uses single dependency for chessops and chesstree
- **WHEN** `blind-base` imports `{ Chess, parseFen, makeFen }` and `{ buildTree, pgnImport }` from `turbochess/chessops` (or `turbochess`)
- **THEN** typecheck exits 0, all vitest tests pass, and the standalone `@itshak/chesstree` package dependency is eliminated
