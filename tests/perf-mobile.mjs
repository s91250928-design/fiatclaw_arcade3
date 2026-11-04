// Телефон (процессор ×4 медленнее): сколько главный поток занят, пока человек листает «Главную».
import { chromium, setupPage, URL0 } from "./harness.mjs";
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...pw.devices["iPhone 13"] });
const page = await ctx.newPage();
await page.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.TERM_CONFIG={isTestnet:false,builder:"0xa02a1872ebbf3a5d2f0d8b236ef16f0fe62b16d0",feeTenthBps:25,debug:true};` }));
await page.addInitScript(() => { try { localStorage.setItem("totum.consent", "1"); } catch {} });
await page.goto(URL0 + "/trade"); await page.waitForTimeout(8000);
await page.evaluate(() => document.querySelector('#mnav [data-app="home"]')?.click()); await page.waitForTimeout(2000);
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await cdp.send("Profiler.enable"); await cdp.send("Profiler.start");
await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: "longtask", buffered: false }); window.__fr = 0; const f = () => { window.__fr++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const t0 = Date.now();
for (let k = 0; k < 20; k++) { await page.mouse.wheel(0, k % 10 < 5 ? 220 : -220); await page.waitForTimeout(400); }
const sec = (Date.now() - t0) / 1e3;
const r = await page.evaluate(() => ({ lt: window.__lt, fr: window.__fr }));
const { profile } = await cdp.send("Profiler.stop");
const self = {}; const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop().split("?")[0]}:${n.callFrame.lineNumber}`; self[k] = (self[k] || 0) + (dt[i] || 0) / 1e3; });
console.log(`кадров/с ${(r.fr / sec).toFixed(0)}, длинных задач ${r.lt.length}, сумма ${r.lt.reduce((a, b) => a + b, 0).toFixed(0)} мс за ${sec.toFixed(1)} с`);
console.log(Object.entries(self).filter(([k]) => !/^\((idle|program|garbage)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${v.toFixed(0).padStart(6)} мс  ${k}`).join("\n"));
await browser.close();
