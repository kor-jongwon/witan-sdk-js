#!/usr/bin/env sh
# The published types (dist/index.d.ts, after npm run build) compile with the oldest TypeScript that
# Requirements names (TS_MIN): with the DOM library, as bundler projects have, and with @types/node alone.
set -eu
TS_MIN=${TS_MIN:-5.7}
cd "$(dirname "$0")/types"
npm install --prefix . --no-save --no-audit --no-fund --silent "typescript@$TS_MIN" "@types/node@22" >/dev/null
TSC=./node_modules/.bin/tsc
$TSC --version
$TSC -p tsconfig.dom.json && echo "lib DOM: ok"
$TSC -p tsconfig.node.json && echo "@types/node only: ok"
