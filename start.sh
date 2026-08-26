#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

if [ ! -d node_modules ]; then
  echo "首次运行，正在安装依赖…"
  npm install
fi

echo "迎新生源轨迹系统将运行在：http://127.0.0.1:4173"
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
