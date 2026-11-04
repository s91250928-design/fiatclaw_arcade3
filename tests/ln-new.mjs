// Лендинг: новые живые разделы — снимки на компьютере и телефоне, без ошибок.
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
import { URL0, makeResults } from "./harness.mjs";
const R = makeResults(); const b = await pw.chromium.launch();
for (const [name, opt] of [["desk", { viewport: { width: 1440, height: 900 } }], ["mob", { ...pw.devices["iPhone 13"] }]]) {
  const ctx = await b.newContext(opt); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.TERM_CONFIG={isTestnet:false,builder:"0xa02a1872ebbf3a5d2f0d8b236ef16f0fe62b16d0",feeTenthBps:25};` }));
  await p.goto(URL0 + "/"); await p.waitForTimeout(4000);
  for (const [id, wait] of [["lnSafe", 4200], ["lnFast", 4000], ["lnStart", 2400], ["lnFinal", 2500]]) {
    await p.evaluate((i) => document.getElementById(i).scrollIntoView({ block: "center" }), id); await p.waitForTimeout(wait);
    const bb = await p.locator("#" + id).boundingBox();
    await p.screenshot({ path: `tests/out-ln-${name}-${id}.png`, clip: { x: 0, y: Math.max(0, bb.y), width: opt.viewport?.width || 390, height: Math.min(bb.height, 1300) }, timeout: 45000 });
  }
  const st = await p.evaluate(() => ({ kf: document.querySelector(".kf-viz").dataset.st, ping: document.getElementById("puPing").textContent, gs: document.getElementById("gs").dataset.step, fin: document.getElementById("lnFinal").classList.contains("in") }));
  console.log(name, st);
  R.ok(`${name}: схема ключа меняет этапы`, st.kf !== undefined); R.ok(`${name}: задержка измерена`, /^\d+$/.test(st.ping), st.ping);
  R.ok(`${name}: финал проявился`, st.fin); R.ok(`${name}: без ошибок`, errs.length === 0, errs.join(" | ").slice(0, 300));
  const ow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); R.ok(`${name}: нет прокрутки вбок`, ow <= 1, String(ow));
  await ctx.close();
}
await b.close(); R.print();
