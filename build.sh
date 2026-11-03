#!/usr/bin/env bash
# Сборка Totum в dist/: один JS-файл приложения + отдельные куски (WalletConnect, 3D-знак) в dist/chunks.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist
npx esbuild src/app.js --bundle --splitting --format=esm --minify --target=es2020 \
  --outdir=dist --chunk-names=chunks/[name]-[hash] --legal-comments=eof --log-level=warning
cp src/index.html src/style.css src/config.js src/favicon.png src/icon.png dist/
cp -r src/brand src/fonts src/sounds dist/
# метка версии: страница меняется при каждой сборке, и браузер берёт свежие
# заголовки безопасности (иначе он мог держать старые и блокировать новые подключения)
V=$(date +%s)
sed -i "s|href=\"style.css\"|href=\"style.css?v=$V\"|; s|src=\"app.js\"|src=\"app.js?v=$V\"|" dist/index.html
echo '[]' > dist/icons.json            # на Vercel заменяется скриптом deploy/scripts/fetch-icons.mjs
# сервер выплат: один файл со всем нужным (на Vercel пакеты не ставятся)
npx esbuild server/payout.src.mjs --bundle --platform=node --format=esm --target=node20 --minify \
  --outfile=deploy/api/payout.mjs --log-level=warning
echo "⚡ Готово: dist/"
