#!/usr/bin/env bash
set -euo pipefail
mkdir -p benchmark-results ci-benchmark
node bench/matrix/machine.mjs
node --input-type=module -e 'import fs from "node:fs";import crypto from "node:crypto";const h=crypto.createHash("sha256").update(fs.readFileSync("ci-benchmark/corpus.json")).digest("hex");if(h!==fs.readFileSync("ci-benchmark/corpus.sha256","utf8").trim())throw Error("corpus hash mismatch");console.log("corpus SHA-256",h)'
npm ci
npm run build
git worktree add --detach ci-benchmark/baseline 4fef578b5282eb64ab8d6193b429761333731149
(cd ci-benchmark/baseline && npm ci && npm run build)
git init ci-benchmark/drumevp
git -C ci-benchmark/drumevp remote add origin https://github.com/drumevp/chess-engine.git
git -C ci-benchmark/drumevp fetch --depth=1 origin 0bfd032c197dde4dddfcf0810f036cdf78bb8b45
git -C ci-benchmark/drumevp checkout --detach FETCH_HEAD
test "$(git -C ci-benchmark/drumevp rev-parse HEAD)" = 0bfd032c197dde4dddfcf0810f036cdf78bb8b45
npm install --prefix ci-benchmark/tools --ignore-scripts --no-audit --no-fund tsx@4.22.3
npm pack --ignore-scripts --pack-destination ci-benchmark @drumevp/chess-engine@1.3.2
node --input-type=module -e 'import fs from "node:fs";import crypto from "node:crypto";const hash=crypto.createHash("sha512").update(fs.readFileSync("ci-benchmark/drumevp-chess-engine-1.3.2.tgz")).digest("base64");if(hash!=="jPV79hx+LEX4t34Sw1IQf0P1AbpK8D/NpnOOwc6Hn3fGUftXtv5CS9VMB0lnhi3EM77cGn1nDCFwawLXRo/Xhw==")throw Error("published integrity mismatch");'
tar -xzf ci-benchmark/drumevp-chess-engine-1.3.2.tgz -C ci-benchmark
