#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

if [ ! -d node_modules ]; then
  echo "首次运行，正在安装依赖…"
  npm install
fi

if [ ! -f .env ]; then
  echo "提示：未找到 .env，AI 生成功能将不可用，简单捏脸仍可正常使用。"
  echo "如需启用 AI，请复制 .env.example 为 .env 并填写百度 API 密钥。"
fi

echo "前端：http://127.0.0.1:5173"
echo "头像服务：http://127.0.0.1:3001"
npm run dev
