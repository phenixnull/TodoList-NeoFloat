#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/todo-sync.env"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
if [[ -z "${NODE_BIN}" ]]; then
  echo "node executable not found" >&2
  exit 1
fi

export TODO_SYNC_DIST_DIR="${TODO_SYNC_DIST_DIR:-${SCRIPT_DIR}/dist}"
export TODO_SYNC_DATA_DIR="${TODO_SYNC_DATA_DIR:-${SCRIPT_DIR}/data}"
export TODO_SYNC_HOST="${TODO_SYNC_HOST:-0.0.0.0}"
export TODO_SYNC_PORT="${TODO_SYNC_PORT:-8787}"

exec "${NODE_BIN}" "${SCRIPT_DIR}/server/index.js"
