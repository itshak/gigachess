# Competitive benchmark suite — added requirements

### Requirement: speed claims SHALL be correctness-gated

#### Scenario: competing standard-chess engine
- **GIVEN** the pinned existing perftsuite/WAC FENs and random legal games
- **WHEN** an external competitor is benchmarked
- **THEN** every timed perft lane has first passed independent reference node
  counts for all its FENs and legal-move parity on sampled positions
- **AND** move replay and undo results are checked against chess.js
- **AND** malformed FEN and illegal UCI results are reported separately
- **AND** no operation on failing test data is presented as a performance win

### Requirement: different work SHALL NOT be falsely equated

#### Scenario: optimized perft skips hashes
- **GIVEN** a competitor perft that explicitly disables Zobrist updates
- **WHEN** comparing it to a fully state-maintaining GigaChess operation
- **THEN** both perft node correctness and a competitor full-hash diagnostic
  shall be reported; this is not evidence of superior game replay speed

#### Scenario: cached repeated legal-move lookup
- **GIVEN** cached legal moves in a competitor facade
- **WHEN** timed repeatedly on one board
- **THEN** label the result cached getter, not move generation; also benchmark
  uncached movegen on preconstructed, equivalent standard-chess boards

### Requirement: bench results SHALL be reproducible and opt-in

#### Scenario: researcher runs the full suite
- **GIVEN** a pinned competitor SHA, npm release and local repository
- **WHEN** explicitly calling bench:competitive or bench:real --suite competitive
- **THEN** use exact source/npm inputs, seeded corpora, warmups, rotated timings,
  medians/p10/p90 and raw JSON samples with Node/CPU metadata
- **AND** the original bench:real default/CI suites do not run external models
- **AND** no GitHub Actions minutes or production WASM dependencies are added
