import {build} from 'esbuild';
await build({stdin:{contents:`
export {default as parse} from "./ci-benchmark/drumevp/src/engine/fen/fenToPosition/generateFenToPosition.ts";
export {default as generate} from "./ci-benchmark/drumevp/src/engine/movegen/generateLegalMoves.ts";
export {default as perft} from "./ci-benchmark/drumevp/src/engine/perft/main.ts";
`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'neutral',target:'es2022',outfile:'ci-benchmark/drumevp-core.mjs'});
