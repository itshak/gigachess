# Tasks — benchmark framework only

- [x] Inspect legacy real-workload suites and existing chessops/chess.js gates
- [x] Audit pinned drumevp source, perft hash-skipping, movegen cache and APIs
- [x] Add pinned EPD/perft corpus and seeded legal-move/FEN/replay/undo gates
- [x] Compare invalid FEN and UCI rejection against independent reference
- [x] Differentiate raw movegen from cached repeated-move lookup
- [x] Add perft source hash-skipping AND full-hash diagnostic lanes
- [x] Verify independently compiled npm 1.3.2 against source / chess.js / chessops
- [x] Add cold import+first move in independent Node processes
- [x] Integrate into existing bench:real as opt-in only; CI defaults unchanged
- [x] Pin dev-only tsx and document external competitor checkout / no postinstall
- [x] Run 7-round full 276-position corpus benchmark and save JSON + analysis
- [ ] Add formal confidence intervals from multiple isolated host processes
- [ ] Add correctness-gated browser parity and warmup benchmark where relevant
- [ ] Add additional appropriately licensed, comparable TS competitor(s)
- [ ] Revisit public fastest claims only after cross-machine findings
