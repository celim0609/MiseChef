#!/usr/bin/env bash
set -euo pipefail
candidate=$(cd "${1:?candidate directory}" && pwd)
evidence=${2:?evidence directory}
controller=$(cd "$(dirname "$0")" && pwd)
expected=a00cd7fd7d16d3e898bc2e763619d526e5b849e1
test "$(git -C "$candidate" rev-parse HEAD)" = "$expected"
test -z "$(git -C "$candidate" status --porcelain)"
: "${QA_TOOLS:?path to pinned QA dependencies}"
# Fail before starting if a local run would reuse any existing service.
node --input-type=module <<'JS'
import { createServer } from 'node:net';
for (const port of [5179, 8080, 9099, 5001]) {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
  await new Promise(resolve => server.close(resolve));
}
JS
scratch=$(mktemp -d)
entry=$(mktemp -d "$candidate/store-hotfix-qa.XXXXXX")
cleanup() {
  if [[ -n "${emulator_pid:-}" ]] && kill -0 "$emulator_pid" 2>/dev/null; then
    kill -INT "$emulator_pid" 2>/dev/null || true
    wait "$emulator_pid" || true
  fi
  rm -rf "$entry" "$scratch"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$evidence" "$scratch/home" "$scratch/functions"
cp "$controller/"{fixture.mjs,browser.mjs,entry.tsx,index.html} "$entry/"
cp "$candidate/firestore.rules" "$candidate/firestore.indexes.json" "$scratch/"
cp "$controller/emulator-functions.cjs" "$scratch/functions/index.js"
printf '{"name":"store-hotfix-qa","private":true,"engines":{"node":"22"}}\n' > "$scratch/functions/package.json"
ln -s "$candidate/functions/node_modules" "$scratch/functions/node_modules"
cat > "$scratch/firebase.json" <<'JSON'
{
  "functions": {"source": "functions"},
  "firestore": {"rules": "firestore.rules", "indexes": "firestore.indexes.json"},
  "emulators": {
    "auth": {"host": "127.0.0.1", "port": 9099},
    "firestore": {"host": "127.0.0.1", "port": 8080},
    "functions": {"host": "127.0.0.1", "port": 5001},
    "ui": {"enabled": false},
    "singleProjectMode": true
  }
}
JSON
cd "$scratch"
# env -i prevents cloud credentials and project overrides reaching the emulators.
env -i PATH="$PATH" HOME="$scratch/home" JAVA_HOME="${JAVA_HOME:-}" CI=true \
  PLAYWRIGHT_BROWSERS_PATH="$QA_TOOLS/browsers" QA_CHROMIUM="${QA_CHROMIUM:-}" \
  QA_CANDIDATE="$candidate" QA_TOOLS="$QA_TOOLS" QA_ENTRY="$entry" QA_EVIDENCE="$evidence" QA_SHA="$expected" \
  "$QA_TOOLS/node_modules/.bin/firebase" emulators:exec --project demo-misechef-preview \
  --only auth,firestore,functions 'cd "$QA_CANDIDATE" && node "$QA_ENTRY/browser.mjs"' > "$scratch/emulators.log" 2>&1 &
emulator_pid=$!
if ! wait "$emulator_pid"; then
    tail -60 "$scratch/emulators.log" >&2
    exit 1
fi
