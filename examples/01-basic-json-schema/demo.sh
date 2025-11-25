#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SCHEMA_PATH="${REPO_ROOT}/examples/user.schema.json"

COUNT="${1:-10}"
SEED="${2:-42}"

echo "👉 Generating ${COUNT} items with seed ${SEED} from ${SCHEMA_PATH}..." >&2

TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'foundrydata-demo')"
DATA_PATH="${TMP_DIR}/data.json"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

npx --yes foundrydata generate \
  --schema "${SCHEMA_PATH}" \
  --n "${COUNT}" \
  --seed "${SEED}" \
  --out json > "${DATA_PATH}"

echo "👉 Sample items (first up to 3 of ${COUNT}):" >&2
DATA_PATH_ENV="${DATA_PATH}" node - <<'NODE'
const fs = require('node:fs');
const dataPath = process.env.DATA_PATH_ENV;
const raw = fs.readFileSync(dataPath, 'utf8');
const data = JSON.parse(raw);

if (Array.isArray(data) && data.length > 0) {
  const slice = data.slice(0, 3);
  console.log(JSON.stringify(slice, null, 2));
} else {
  console.log('(no items)');
}
NODE

echo "👉 Validating generated data with AJV (Node + ajv)..." >&2

node "${SCRIPT_DIR}/validate-with-ajv.mjs" "${SCHEMA_PATH}" "${DATA_PATH}" "${COUNT}"
