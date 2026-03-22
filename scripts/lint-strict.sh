#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if command -v golangci-lint >/dev/null 2>&1; then
  LINT_BIN="$(command -v golangci-lint)"
elif [[ -x "${HOME}/go/bin/golangci-lint" ]]; then
  LINT_BIN="${HOME}/go/bin/golangci-lint"
else
  echo "ERROR: golangci-lint not found in PATH or at ${HOME}/go/bin/golangci-lint" >&2
  exit 1
fi

echo "[lint] enforcing no //nolint directives"
if rg -n --glob '*.go' '//[[:space:]]*nolint' .; then
  echo "ERROR: //nolint directives are forbidden in this repository." >&2
  exit 1
fi

echo "[lint] running ${LINT_BIN} run ./..."
"${LINT_BIN}" run ./...
