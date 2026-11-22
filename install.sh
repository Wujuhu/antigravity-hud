#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[AGY HUD] 未检测到 Node.js，请先安装 Node.js >= 22.5.0 (https://nodejs.org)"
  exit 1
fi

node scripts/install.mjs "$@"
