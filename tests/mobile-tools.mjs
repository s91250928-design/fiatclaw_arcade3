// Телефон: кнопка инструментов → каталог под позициями → скальпинг открывается там же.
// Лендинг: карточка инструмента открывает инструмент; «Торговать» по монете — экран сделки без кошелька.
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
import { URL0, makeResults } from "./harness.mjs";
const R = makeResults(); const b = await pw.chromium.launch();
const mk = async (opt) => { const ctx = await b.newContext(opt); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.TERM_CONFIG={isTestnet:false,builder:"0xa02a1872ebbf3a5d2f0d8b236ef16f0fe62b16d0",feeTenthBps:25,debug:true};` }));
  await p.addInitScript(() => { try { localStorage.setItem("totum.consent", "1"); localStorage.setItem("totum.theme", "dark"); } catch {} }); return { p, errs, ctx }; };
{ const { p, errs, ctx } = await mk({ ...pw.devices["iPhone 13"] });
  await p.goto(URL0 + "/trade"); await p.waitForTimeout(6000);
  await p.evaluate(() => document.querySelector('#mnav [data-app="futures"]').click()); await p.waitForTimeout(1200);
  await p.click("#btnTools"); await p.waitForTimeout(900);
  R.ok("телефон: каталог инструментов открылся", await p.isVisible("#mtCat") && (await p.locator(".mt-card").count()) === 6);
  await p.screenshot({ path: "tests/out-mtools-cat.png" });
  await p.click('[data-mtool="scalp"]'); await p.waitForTimeout(2500);
  const st = await p.evaluate(() => ({ cp: document.body.dataset.cp, inHost: !!document.querySelector("#mtHost #paneScalp"), rows: document.querySelectorAll("#scLadder .sc-row").length }));
  R.ok("телефон: скальпинг открылся под позициями", st.cp === "scalp" && st.inHost && st.rows > 5, JSON.stringify(st));
  await p.screenshot({ path: "tests/out-mtools-scalp.png", fullPage: false });
  console.log("before back", await p.evaluate(() => ({ back: document.getElementById("mtBack").hidden, title: document.getElementById("mtTitle").textContent, host: document.getElementById("mtHost").children.length })));
  await p.click("#mtBack"); await p.waitForTimeout(500);
  R.ok("телефон: назад к каталогу, панель вернулась на место", (await p.evaluate(() => !document.querySelector("#mtHost #paneScalp") && document.body.dataset.cp === "chart")));
  R.ok("телефон: без ошибок", errs.length === 0, errs.join(" | ").slice(0, 300)); await ctx.close(); }
{ const { p, errs, ctx } = await mk({ viewport: { width: 1440, height: 900 } });
  await p.goto(URL0 + "/"); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-ln-tool="funding"]').click()); await p.waitForTimeout(1500);
  R.ok("лендинг: «Сканер фандинга» открывает сканер", await p.evaluate(() => document.body.dataset.view === "app" && document.body.dataset.cp === "tools"));
  R.ok("лендинг: без ошибок", errs.length === 0, errs.join(" | ").slice(0, 300)); await ctx.close(); }
{ const { p, errs, ctx } = await mk({ ...pw.devices["iPhone 13"] });
  await p.goto(URL0 + "/"); await p.waitForTimeout(6000);
  await p.evaluate(() => document.querySelector('#lnRows [data-ln-coin]').click()); await p.waitForTimeout(1500);
  const st = await p.evaluate(() => ({ view: document.body.dataset.view, app: document.body.dataset.app, pick: !!document.querySelector("#walletPick[open], dialog[open]") }));
  R.ok("лендинг (телефон): «Торговать» → экран сделки, кошелёк не спрашивает", st.view === "app" && ["futures", "trade"].includes(st.app) && !st.pick, JSON.stringify(st));
  R.ok("без ошибок", errs.length === 0, errs.join(" | ").slice(0, 300)); await ctx.close(); }
await b.close(); R.print();
