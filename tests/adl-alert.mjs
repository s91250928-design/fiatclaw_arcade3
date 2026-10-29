// Предупреждение ADL: при уровне 4–5 из 5 — уведомление на сайте (один раз за 30 мин).
import { chromium, setupPage, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch();
const { page, errors } = await setupPage(browser, { width: 1440, height: 900 }, { exchange: [] });
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(4500);
const n = await page.evaluate(() => {
  const S = window.__totum.S, mark = Number(S.ctx.BTC.markPx);
  S.accountValue = 1000;
  S.positions = [{ coin: "BTC", szi: "0.3", entryPx: String(mark * 0.8), positionValue: String(0.3 * mark), leverage: { type: "cross", value: 20 }, marginUsed: "900", unrealizedPnl: "0" }];
  S.adlMove.BTC = { up: 0.05, down: 0, at: Date.now() };
  window.__totum.adlCheck(); window.__totum.adlCheck();
  return document.querySelectorAll(".adl-toast").length;
});
R.ok("при высоком риске ADL — одно предупреждение (повтор не спамит)", n === 1, String(n));
R.ok("в предупреждении есть кнопка «Подробнее»", /Риск ADL[\s\S]*Подробнее/.test(await page.textContent(".adl-toast")));
await page.locator(".adl-toast").screenshot({ path: "tests/out-adl-toast.png" });
await page.click(".adl-toast button"); await page.waitForTimeout(400);
R.ok("«Подробнее» открывает пояснение ADL", await page.isVisible("#adlDialog"));
const calm = await page.evaluate(() => { const S = window.__totum.S; S.adlMove.BTC = { up: 0, down: 0, at: Date.now() }; S.positions[0].coin = "ETH"; S.adlMove.ETH = { up: 0, down: 0 }; window.__totum.adlCheck(); return document.querySelectorAll(".adl-toast").length; });
R.ok("на спокойном рынке предупреждения нет", calm === 0, String(calm));
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
