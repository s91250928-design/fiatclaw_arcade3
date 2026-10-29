// Баланс: график и PnL за период; календарь PnL по дням.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now(); let agent = null;
const D = (daysAgo, h = 12) => { const d = new Date(); d.setHours(h, 0, 0, 0); d.setDate(d.getDate() - daysAgo); return d.getTime(); };
const series = (n, step, v0, dv) => Array.from({ length: n }, (_, k) => [now - (n - 1 - k) * step, String(v0 + dv * k)]);
const pf = [
  ["day", { accountValueHistory: series(12, 2 * 36e5, 700, 2), pnlHistory: series(12, 2 * 36e5, 0, 1.5), vlm: "1000" }],
  ["week", { accountValueHistory: series(40, 4 * 36e5, 800, -2), pnlHistory: series(40, 4 * 36e5, 0, -2.5), vlm: "1000" }],
  ["month", { accountValueHistory: series(20, 36 * 36e5, 600, 6), pnlHistory: series(20, 36 * 36e5, 0, 5), vlm: "1000" }],
  ["allTime", { accountValueHistory: series(20, 36 * 36e5, 600, 6), pnlHistory: series(20, 36 * 36e5, 0, 5), vlm: "1000" }],
];
// вчера: +50 сделка −2 комиссия; позавчера: −30 −1; 3 дня назад: только фандинг −0.5
const fills = [
  { coin: "BTC", px: "80000", sz: "0.01", side: "A", dir: "Close Long", time: D(1), closedPnl: "50", fee: "2", feeToken: "USDC", oid: 1, tid: 1, startPosition: "0.01", crossed: true, hash: "0x" },
  { coin: "ETH", px: "3000", sz: "1", side: "B", dir: "Close Short", time: D(2), closedPnl: "-30", fee: "1", feeToken: "USDC", oid: 2, tid: 2, startPosition: "-1", crossed: true, hash: "0x" },
];
const funding = [{ time: D(3), hash: "0x", delta: { type: "funding", coin: "BTC", usdc: "-0.5", szi: "0.01", fundingRate: "0.0001" } }];
const state = { exchange: [], onExchange: (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; return null; },
  onUserInfo: (b) => { switch (b.type) { case "maxBuilderFee": return 25; case "extraAgents": return agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [];
    case "userAbstraction": return "unifiedAccount"; case "clearinghouseState": return { marginSummary: { accountValue: "0", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "0" }, crossMaintenanceMarginUsed: "0", withdrawable: "0", assetPositions: [] };
    case "spotClearinghouseState": return { balances: [{ coin: "USDC", token: 0, total: "722", hold: "0", entryNtl: "0" }] };
    case "portfolio": return pf;
    case "userNonFundingLedgerUpdates": return [
      { time: now - 5 * 864e5, hash: "0x", delta: { type: "deposit", usdc: "800" } },
      { time: now - 2 * 864e5, hash: "0x", delta: { type: "rewardsClaim", amount: "36.26", token: "USDC" } },
      { time: now - 1 * 864e5, hash: "0x", delta: { type: "withdraw", usdc: "50", nonce: 1, fee: "1" } },
      { time: now - 36e5, hash: "0x", delta: { type: "accountClassTransfer", usdc: "100", toPerp: false } } ];
    case "userFillsByTime": return fills.filter((f) => f.time >= b.startTime && f.time <= (b.endTime || 9e15));
    case "userFunding": return funding.filter((f) => f.time >= b.startTime && f.time <= (b.endTime || 9e15));
    case "frontendOpenOrders": case "openOrders": case "historicalOrders": case "userFills": return []; } } };
const { page, errors } = await setupPage(browser, { width: 390, height: 844 }, state, { theme: "dark" });
await page.addInitScript(() => { localStorage.setItem("totum.theme", "dark"); localStorage.removeItem("totum.pfwin"); });
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000); await connect(page); await page.waitForTimeout(4000);
await page.click("#mnav [data-app=home]"); await page.waitForTimeout(2500);
R.ok("на карточке баланса график и PnL за день +16,50 $", await page.isVisible("#pgHome svg.hc-spark") && /PnL за день\s*\+16,5/.test(await page.textContent("#pgHome .hc-pnl")), await page.textContent("#pgHome .hc-pnl"));
await page.locator("#pgHome .hero-card").screenshot({ path: "tests/out-hero-day.png" });
await page.click('#pgHome [data-pfwin="week"]'); await page.waitForTimeout(1200);
R.ok("неделя: PnL −97,50 $ и красный график", /за неделю\s*−97,5/.test(await page.textContent("#pgHome .hc-pnl")) && (await page.getAttribute("#pgHome .hc-pnl", "class")).includes("down"), await page.textContent("#pgHome .hc-pnl"));
await page.locator("#pgHome .hero-card").screenshot({ path: "tests/out-hero-week.png" });
await page.click("#pgHome [data-act=calendar]"); await page.waitForTimeout(2500);
R.ok("календарь открылся", await page.isVisible("#calDialog .cal-grid"));
const cell = async (n) => (await page.textContent(`[data-day="${new Date(D(n)).toISOString().slice(0, 10).replace(/T.*/, "")}"]`).catch(() => "")) || "";
const k1 = await page.evaluate((t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }, D(1));
const k2 = await page.evaluate((t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }, D(2));
const sameMonth = (n) => new Date(D(n)).getMonth() === new Date().getMonth();
if (sameMonth(1)) R.ok("вчерашний день: +48", /\+48/.test(await page.textContent(`[data-day="${k1}"]`)), await page.textContent(`[data-day="${k1}"]`));
await page.click('[data-calp="yday"]'); await page.waitForTimeout(2000);
R.ok("«Вчера»: PnL +48,00 $ (сделки +50, комиссии −2)", /\+48/.test(await page.textContent(".cal-sum-h b")) && /−2/.test(await page.textContent(".cal-sum-g")), await page.textContent(".cal-sum"));
await page.click('[data-calp="custom"]'); await page.waitForTimeout(500);
R.ok("«Свой период» просит выбрать первый день", /первый день/.test(await page.textContent(".cal-sum")));
// выбираем период с позавчера по вчера (если оба в этом месяце)
if (sameMonth(2) && sameMonth(1)) {
  await page.click(`[data-day="${k2}"]`); await page.waitForTimeout(300);
  R.ok("после первого дня просит последний", /последний день/.test(await page.textContent(".cal-sum")));
  await page.click(`[data-day="${k1}"]`); await page.waitForTimeout(1500);
  R.ok("период 2 дня: +17 $", /\+17/.test(await page.textContent(".cal-sum-h b")), await page.textContent(".cal-sum-h"));
}
await page.click('[data-calp="month"]'); await page.waitForTimeout(1500);
await page.screenshot({ path: "tests/out-calendar.png" });
await page.keyboard.press("Escape"); await page.waitForTimeout(400);
// линия на карточке — PnL: за неделю PnL падает → линия идёт вниз (последняя точка ниже первой)
await page.click("#mnav [data-app=assets]"); await page.waitForTimeout(1500);
const dir = await page.evaluate(() => { const d = document.querySelector("#pgAssets svg.hc-spark path:last-child").getAttribute("d"); const pts = d.match(/[\d.]+,[\d.]+/g).map((p) => Number(p.split(",")[1])); return pts.at(-1) - pts[0]; });
R.ok("линия PnL за неделю идёт вниз (убыток)", dir > 0, String(dir));
await page.click('#pgAssets [data-act="acchist"]'); await page.waitForTimeout(2600);
R.ok("«История счёта»: анимированная линия и 4 операции", await page.isVisible("#histDialog .ah-line") && (await page.locator("#ahList .ah-row").count()) === 4);
const txt = await page.textContent("#ahList");
R.ok("пополнение +800, вывод −50, награды +36,26, перевод без суммы", /Пополнение[\s\S]*\+800/.test(txt) && /Вывод[\s\S]*−50/.test(txt) && /Награды/.test(txt) && /спот/.test(txt), txt.slice(0, 200));
await page.screenshot({ path: "tests/out-acchist.png" });
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
