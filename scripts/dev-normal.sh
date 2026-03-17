#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"

run_wails() {
  if command -v wails >/dev/null 2>&1; then
    wails "$@"
    return
  fi
  go run github.com/wailsapp/wails/v2/cmd/wails@v2.11.0 "$@"
}

cd "$DESKTOP_DIR"
echo "Starting Wails dev with default app data location"
env -u ORBIT_DATA_DIR run_wails dev -s
