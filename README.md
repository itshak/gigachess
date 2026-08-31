# turbochess

Fast, clean-room, MIT-licensed chess engine library for TypeScript.
Functional at the public API boundary (immutable userdata), imperative inside
for maximum speed — see `openspec/adr/012-purechess-toolchain.md`.

> **Rename note (ADR-015):** this library was previously distributed as
> `purechess`. It is now **`turbochess`** — the name matches the actual value
> (turbo speed: 3.36× sliding, +19% perft, 2.1× PGN, 2× FEN vs `chessops`).
> `purechess` remains available as an alias re-export package for **one
> release** (`alias/purechess/` in this repo), then will be removed.

## Install

```bash
npm install turbochess
```

## Usage

```ts
// Engine entry (native, non-mutable public API)
import { Chess, perft } from "turbochess";

// chessops-compatible API (drop-in surface: Chess, parseFen/makeFen,
// parseSan/makeSan, parseUci/makeUci, SquareSet, Board, Setup, debug)
import { Chess, parseFen, makeFen, parseSan, makeSan } from "turbochess/chessops";
// deep subpaths mirror chessops: "turbochess/chessops/chess", "/fen", "/san", ...
```

## Exports map

| Specifier | Entry |
|-----------|-------|
| `turbochess` | full engine (`dist/index.js`) |
| `turbochess/core` | core re-export (`dist/core.js`) |
| `turbochess/pgn` | PGN streaming parser/writer |
| `turbochess/chess960` | Chess960 helpers |
| `turbochess/chessops` | chessops-compatible façade (ADR-014) |
| `turbochess/chessops/<mod>` | deep subpaths: `board`, `chess`, `debug`, `fen`, `san`, `setup`, `squareSet`, `types`, `util` |
| `turbochess/chessjs` | mutable chess.js-style façade |

`sideEffects: false` — full tree-shaking support.

## Migration from `purechess`

```diff
-import { Chess } from "purechess";
+import { Chess } from "turbochess";
```

## Development

```bash
npm run typecheck        # TypeScript strict check
npm run test             # perft, castling, parity, purity, compat-chessops, chessjs-parity
npm run bench:real -- --quick   # 13 real-world perf gates vs chessops
npm run build            # tsc -> dist/
```

## License

MIT for the library. Bench baselines (`chessops`, `chess.js`) are dev-only
dependencies and are **never** imported from `src/` (clean-room requirement:
`rg "GPL" src/` stays empty).
