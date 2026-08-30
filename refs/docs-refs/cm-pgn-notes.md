# cm-pgn — PGN streaming reference (docs snapshot)

Upstream: https://github.com/kepler-62b/cm-pgn (npm `cm-pgn@0.3.9`)
PGN Standard: http://www.saremba.de/chessgml/standards/pgn/pgn-complete.htm (Steven Edwards)

## Grammar (EBNF summary)
```
PGN = header* movetext
header = "[" key "\"" value "\"" "]" NEWLINE
movetext = element* "*"|"1-0"|"0-1"|"1/2-1/2"
element = move-number | san | nag | comment | variation | annotation
variation = "(" element* ")"
comment = "{" text "}" | ";" line
string = "\"" ("\\\"" | [^"])* "\""
```

## Streaming requirements for purechess (Phase 2 spec)
- Chunked parser: feed `Uint8Array`/`string` slices, emit `GameTree` nodes incrementally (vs whole-file load) — re-specified from pgn-chess-tree behavior, not copied.
- Headers: STag, Seven Tag Roster (Event/Site/Date/Round/White/Black/Result), plus 960 FEN/SetUp.
- GameTree shape: `{headers:Map, moves:[{san, nags: [], comments:[], variations:[GameTree]}]}`
- Performance: bench measures `games/s`, `MB/s`, peak heap vs chessops.

Derived from docs only; implementation is clean-room.
