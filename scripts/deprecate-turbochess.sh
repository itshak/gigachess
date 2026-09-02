#!/usr/bin/env bash
set -euo pipefail

# scripts/deprecate-turbochess.sh
# Publishes the backward-compatibility shim turbochess@0.2.1 and marks turbochess deprecated on npm.

echo "=== 1. Publishing turbochess shim package (v0.2.1) ==="
cd "$(dirname "$0")/../packages/turbochess"
npm publish --access public

echo "=== 2. Deprecating turbochess on npm ==="
npm deprecate turbochess "turbochess has been renamed to gigachess. Please install gigachess instead."

echo "=== Done! turbochess now cleanly forwards and notifies users to install gigachess. ==="
