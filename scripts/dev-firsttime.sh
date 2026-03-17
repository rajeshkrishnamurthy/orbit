#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"
PROFILE_DIR="${ORBIT_FIRSTTIME_PROFILE_DIR:-$HOME/.orbit-profiles/firsttime}"

run_wails() {
  if command -v wails >/dev/null 2>&1; then
    wails "$@"
    return
  fi
  go run github.com/wailsapp/wails/v2/cmd/wails@v2.11.0 "$@"
}

echo "Resetting first-time profile at: $PROFILE_DIR"
rm -rf "$PROFILE_DIR"
mkdir -p "$PROFILE_DIR"

cd "$DESKTOP_DIR"
echo "Starting Wails dev with ORBIT_DATA_DIR=$PROFILE_DIR"
ORBIT_DATA_DIR="$PROFILE_DIR" run_wails dev -s
