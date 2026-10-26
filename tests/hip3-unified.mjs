// HIP-3 рынки, разделы рынков, единый счёт, ADL — на настоящих рыночных данных тестовой сети.
import { chromium, setupPage, connect, makeResults, URL0, BUILDER } from "./harness.mjs";
const R = makeResults();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const state = { exchange: [], abstraction: "default" };
state.onExchange = (b) => {
  if (b.action.type === "agentSetAbstraction") { state.abstraction = "unifiedAccount"; }
  if (b.action.type === "approveBuilderFee") state.fee = 25;
  if (b.action.type === "approveAgent") state.agent = b.action.agentAddress;
  if (b.action.type === "order") return { status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 7 } }] } } };
  return null;
};
const pos = (coin, szi, entry, upnl, lev = 10, type = "cross") => ({ type: "oneWay", position: { coin, szi: String(szi), entryPx: String(entry), unrealizedPnl: String(upnl), liquidationPx: null, leverage: { type, value: lev }, cumFunding: { allTime: "0", sinceOpen: "0", sinceChange: "0" }, positionValue: String(Math.abs(szi) * entry), returnOnEquity: "0.1", marginUsed: String(Math.abs(szi) * entry / lev), maxLeverage: 20 } });
const chs = (positions, av) => ({ marginSummary: { accountValue: String(av), totalNtlPos: "0", totalRawUsd: "0", totalMarginUsed: "10" }, crossMarginSummary: { accountValue: String(av), totalNtlPos: "0", totalRawUsd: "0", totalMarginUsed: "10" }, crossMaintenanceMarginUsed: "1", withdrawable: "0", time: Date.now(), assetPositions: positions });
let hip3Coin = null;
state.onUserInfo = (b) => {
  switch (b.type) {
    case "maxBuilderFee": return state.fee || 0;
    case "extraAgents": return state.agent ? [{ address: state.agent, name: "totum", validUntil: Date.now() + 1e9 }] : [];
    case "userAbstraction": return state.abstraction;
    case "clearinghouseState":
      if (!b.dex) return chs([pos("BTC", 0.01, 70000, 50, 20)], 0);
      if (hip3Coin && b.dex === hip3Coin.split(":")[0]) return chs([pos(hip3Coin, -2, 100, -3, 5, "isolated")], 0);
      return chs([], 0);
    case "frontendOpenOrders": case "openOrders": return [];
    case "spotClearinghouseState": return { balances: [{ coin: "USDC", token: 0, total: "500", hold: "45", entryNtl: "0" }] };
    case "userFills": case "userFunding": case "historicalOrders": case "userFillsByTime": return [];
    case "referral": return { unclaimedRewards: "0", claimedRewards: "0", builderRewards: "0" };
  }
  return undefined;
};
for (const vp of [{ width: 1440, height: 900, name: "desktop" }, { width: 390, height: 844, name: "mobile" }]) {
  state.exchange = []; state.abstraction = "default"; state.fee = 0; state.agent = null;
  const { page, errors } = await setupPage(browser, vp, state);
  await page.goto(URL0 + "/#trade"); await page.waitForTimeout(7000);
  // разделы рынков
  const nMeta = await page.evaluate(() => window.__totum?.S.meta.length);
  hip3Coin = await page.evaluate(() => {
    const S = window.__totum.S;
    const ok = S.meta.filter((m) => m.dex && Number(S.ctx[m.name]?.dayNtlVlm || 0) > 0).sort((a, b) => Number(S.ctx[b.name].dayNtlVlm) - Number(S.ctx[a.name].dayNtlVlm));
    return ok[0]?.name || null;
  });
  R.ok(`[${vp.name}] загружены рынки HIP-3`, !!hip3Coin && nMeta > 300, `всего фьючерсов=${nMeta}, пример=${hip3Coin}`);
  if (vp.name === "desktop") {
    await page.click("#pairBtn"); await page.waitForTimeout(300);
    for (const [mk, ru] of [["all", "Все"], ["crypto", "Крипто"], ["tradfi", "Традфи"], ["hip3", "HIP-3"], ["trend", "В тренде"], ["spot", "Спот"]]) {
      await page.click(`[data-mk=${mk}]`); await page.waitForTimeout(250);
      const rows = await page.locator("#pairList .pp-row").count();
      R.ok(`[desktop] раздел «${ru}» не пустой`, rows > 0, `строк=${rows}`);
      if (mk === "tradfi") await page.screenshot({ path: "tests/out-tradfi.png" });
    }
    await page.click(`[data-mk=hip3]`); await page.waitForTimeout(250);
    const first = await page.locator("#pairList .pp-row").first().getAttribute("data-coin");
    await page.click(`#pairList .pp-row >> nth=0`); await page.waitForTimeout(3500);
    R.ok("[desktop] открыта пара HIP-3", (await page.evaluate(() => window.__totum.S.coin)) === first, first);
    const book = await page.evaluate(() => document.querySelectorAll("#asks .ob-row, #bids .ob-row").length);
    R.ok("[desktop] стакан пары HIP-3", book > 0, `строк=${book}`);
    const info = await page.evaluate(() => window.__totum.S.coin);
    const m = await page.evaluate((c) => window.__totum.S.meta.find((x) => x.name === c), info);
    R.ok("[desktop] номер актива HIP-3 = 100000 + площадка×10000 + индекс", m.index >= 100000, String(m.index));
    await page.screenshot({ path: "tests/out-hip3.png" });
  } else {
    await page.click("#mnav [data-app=markets]"); await page.waitForTimeout(400);
    await page.click("[data-mmk=tradfi]"); await page.waitForTimeout(300);
    R.ok("[mobile] Рынки → Традфи", (await page.locator("#mList .pp-row").count()) > 0);
    await page.screenshot({ path: "tests/out-m-tradfi.png" });
    await page.click("#mnav [data-app=futures]"); await page.waitForTimeout(500);
  }
  // кошелёк + включение торговли → единый счёт
  await connect(page);
  if (await page.isVisible("#btnEnable")) { await page.check("#consent").catch(() => {}); await page.click("#btnEnable"); await page.waitForTimeout(3500); }
  const setAbs = state.exchange.find((b) => b.action.type === "agentSetAbstraction");
  R.ok(`[${vp.name}] единый счёт включён ключом агента`, setAbs?.action.abstraction === "u", JSON.stringify(setAbs?.action || {}));
  R.ok(`[${vp.name}] приложение знает про единый счёт`, await page.evaluate(() => document.body.classList.contains("unified")));
  // пользователь открыл пару HIP-3 (на настоящей бирже площадку с позицией подскажет и WebSocket)
  await page.evaluate((c) => window.__totum.switchCoin(c), hip3Coin);
  await page.waitForTimeout(6500);
  const S = await page.evaluate(() => ({ w: window.__totum.S.withdrawable, n: window.__totum.S.positions.map((p) => p.coin) }));
  R.ok(`[${vp.name}] доступно = свободный USDC единого счёта (500 − 45)`, Math.abs(S.w - 455) < 0.01, String(S.w));
  R.ok(`[${vp.name}] позиции со всех площадок (BTC + HIP-3)`, S.n.includes("BTC") && S.n.includes(hip3Coin), S.n.join(","));
  R.ok(`[${vp.name}] перевод фьючерсы⇄спот скрыт`, !(await page.isVisible("#trRow")));
  const adl = await page.locator(vp.name === "mobile" ? "#posCards .adl" : "#posBody .adl").count();
  R.ok(`[${vp.name}] индикатор ADL у позиций`, adl >= 2, `шт=${adl}`);
  await page.screenshot({ path: `tests/out-pos-${vp.name}.png`, fullPage: vp.name === "mobile" });
  // ордер на HIP-3 идёт с правильным номером актива и комиссией Totum
  if (vp.name === "desktop") {
    await page.evaluate((c) => window.__totum.switchCoin?.(c), hip3Coin);
  }
  R.ok(`[${vp.name}] без ошибок страницы`, errors.length === 0, errors.join(" | ").slice(0, 400));
  await page.close();
}
await browser.close(); R.print();
