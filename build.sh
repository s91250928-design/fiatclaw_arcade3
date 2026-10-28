#!/usr/bin/env bash
# Сборка Totum в dist/: один JS-файл приложения + отдельные куски (WalletConnect, 3D-знак) в dist/chunks.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist
npx esbuild src/app.js --bundle --splitting --format=esm --minify --target=es2020 \
  --outdir=dist --chunk-names=chunks/[name]-[hash] --legal-comments=eof --log-level=warning
cp src/index.html src/style.css src/config.js src/favicon.png src/icon.png dist/
cp -r src/brand src/fonts src/sounds dist/
echo '[]' > dist/icons.json            # на Vercel заменяется скриптом deploy/scripts/fetch-icons.mjs
echo "⚡ Готово: dist/"
