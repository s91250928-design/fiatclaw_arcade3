/* Totum: скачивание иконок токенов при деплое на Vercel.
   Берёт список монет фьючерсов и спота Hyperliquid (основная и тестовая сеть),
   скачивает иконки с app.hyperliquid.xyz в папку icons/ и пишет icons.json —
   список монет, у которых иконка есть. Сайт берёт иконки со своего домена
   (кеш на год), а для монет без иконки сразу рисует букву.
   Скрипт никогда не ломает деплой: при любой ошибке сайт просто
   продолжит брать иконки напрямую с Hyperliquid. */
import { mkdir, writeFile } from "node:fs/promises";

const APIS = (process.env.TOTUM_HL_APIS || "https://api.hyperliquid.xyz/info,https://api.hyperliquid-testnet.xyz/info").split(",");
const CDN = process.env.TOTUM_ICON_CDN || "https://app.hyperliquid.xyz/coins/";   // для проверки можно подменить
const MAX_NAMES = 4000, CONCURRENCY = 8, TIMEOUT = 8000, BUDGET_MS = 150000;
const started = Date.now();

async function post(url, body) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

async function get(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "";
    const buf = Buffer.from(await r.arrayBuffer());
    if (!/svg|image/.test(type) && !buf.slice(0, 200).toString().includes("<svg")) return null;
    return buf;
  } catch { return null; } finally { clearTimeout(t); }
}

async function main() {
  const names = new Set();
  for (const api of APIS) {
    const meta = await post(api, { type: "meta" });
    (meta?.universe || []).forEach((u) => u?.name && names.add(u.name));
    const spot = await post(api, { type: "spotMeta" });
    (spot?.tokens || []).forEach((t) => t?.name && names.add(t.name));
  }
  const list = [...names].filter((n) => /^[A-Za-z0-9._-]{1,30}$/.test(n)).slice(0, MAX_NAMES);
  console.log(`[icons] монет в списках: ${list.length}`);
  await mkdir("icons", { recursive: true });
  const have = [];
  let i = 0;
  async function worker() {
    while (i < list.length && Date.now() - started < BUDGET_MS) {
      const name = list[i++];
      const svg = (await get(`${CDN}${encodeURIComponent(name)}.svg`)) || (await get(`${CDN}${encodeURIComponent(name)}_spot.svg`));
      if (svg) { await writeFile(`icons/${name}.svg`, svg); have.push(name); }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  have.sort();
  await writeFile("icons.json", JSON.stringify({ v: Date.now(), names: have }));
  console.log(`[icons] скачано иконок: ${have.length} из ${list.length} за ${Math.round((Date.now() - started) / 1000)} с`);
}

main().catch(async (e) => {
  console.log("[icons] не получилось, сайт будет брать иконки с Hyperliquid напрямую:", e?.message || e);
  try { await writeFile("icons.json", JSON.stringify({ v: Date.now(), names: [] })); } catch { /* ничего */ }
}).finally(() => process.exit(0));
