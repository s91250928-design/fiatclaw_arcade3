# Totum — исходник терминала

Торговый терминал на Hyperliquid (фьючерсы, спот), сайт fiatclaw.xyz.

- `src/` — исходник: `app.js` (приложение), `mobius.js` (3D-знак лендинга), `index.html`, `style.css`, `config.js`, картинки и шрифты.
- `./build.sh` — сборка в `dist/` (esbuild). Содержимое `dist/` копируется в ветку `main`, оттуда Vercel публикует сайт.
- `deploy/` — `vercel.json` и скрипт загрузки иконок, которые лежат в `main`.
- `tests/` — проверки (Playwright). `node tests/serve.mjs dist 8765` и затем `node tests/live-smoke.mjs`.

Ветка `source` — только исходник, сайт из неё не собирается.
