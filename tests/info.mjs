// Раздел «Информация»: подразделы, таблица уровней маржи, история фандинга и премии.
import { chromium, setupPage, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const state = { exchange: [] };
for (const vp of [{ width: 1440, height: 1000, name: "desktop", theme: "light" }, { width: 390, height: 844, name: "mobile", theme: "dark" }]) {
  const { page, errors } = await setupPage(browser, vp, state, { theme: vp.theme });
  await page.addInitScript((t) => { localStorage.setItem("totum.theme", t); localStorage.removeItem("totum.inftab"); }, vp.theme);
  await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000);
  if (vp.name === "mobile") { await page.click("#btnFull"); await page.waitForTimeout(800); }
  await page.click('[data-cp="info"]'); await page.waitForTimeout(1200);
  const tabs = await page.locator("#infTabs button").allTextContents();
  R.ok(`[${vp.name}] 5 подразделов`, tabs.length === 5, tabs.join(" | "));
  R.ok(`[${vp.name}] обзор: цена, фандинг с таймером`, await page.isVisible(".inf-price") && /\d\d:\d\d/.test(await page.textContent(".inf-fund .inf-cd")));
  await page.locator("#paneInfo").screenshot({ path: `tests/out-info-overview-${vp.name}.png` });
  await page.click('[data-inf="contract"]'); await page.waitForTimeout(500);
  R.ok(`[${vp.name}] детали контракта`, /Предел ставки фандинга/.test(await page.textContent("#infoBody")));
  await page.locator("#paneInfo").screenshot({ path: `tests/out-info-contract-${vp.name}.png` });
  await page.click('[data-inf="margin"]'); await page.waitForTimeout(500);
  const rows = await page.locator(".inf-table:not(.lev) > div:not(.th)").count();
  R.ok(`[${vp.name}] уровни плеча BTC из Hyperliquid (40x → 25x → 10x)`, rows === 3 && /40x[\s\S]*25x[\s\S]*10x/.test(await page.textContent(".inf-table")), String(rows));
  const lev = await page.locator(".inf-table.lev > div:not(.th)").allTextContents();
  R.ok(`[${vp.name}] таблица плеч 1x…40x: 40x до 10 тыс, 20x до 50 тыс, 10x без ограничения`, lev.length === 11 && /^40x.*10\.0 тыс/.test(lev.at(-1)) && /^20x.*50\.0 тыс/.test(lev[6]) && /^10x.*без ограничения/.test(lev[4]), lev.join(" | "));
  await page.locator("#paneInfo").screenshot({ path: `tests/out-info-margin-${vp.name}.png` });
  await page.click('[data-inf="funding"]'); await page.waitForTimeout(3500);
  R.ok(`[${vp.name}] история фандинга: график и средняя`, (await page.locator("#infChart canvas").count()) > 0 && !/—/.test(await page.textContent('[data-stat="avg"] b')));
  await page.locator("#paneInfo").screenshot({ path: `tests/out-info-funding-${vp.name}.png` });
  R.ok(`[${vp.name}] по умолчанию последние 40 выплат`, await page.isVisible('[data-rng="40"].on'));
  await page.click('[data-rng="30"]'); await page.waitForTimeout(3500);
  R.ok(`[${vp.name}] 30 дней загружается`, (await page.locator("#infChart canvas").count()) > 0);
  await page.click('[data-inf="index"]'); await page.waitForTimeout(3000);
  R.ok(`[${vp.name}] индекс и справедливая цена: график и объяснение`, (await page.locator("#infChart canvas").count()) > 0 && /Что такое индекс и справедливая цена/.test(await page.textContent("#infoBody")));
  await page.locator("#paneInfo").screenshot({ path: `tests/out-info-index-${vp.name}.png` });
  await page.waitForTimeout(3000);
  R.ok(`[${vp.name}] график не пересоздаётся при обновлении цен`, (await page.locator("#infChart canvas").count()) > 0 && (await page.locator("#infChart > div").count()) === 1);
  R.ok(`[${vp.name}] без ошибок`, errors.length === 0, errors.join(" | ").slice(0, 300));
  await page.close();
}
await browser.close(); R.print();
