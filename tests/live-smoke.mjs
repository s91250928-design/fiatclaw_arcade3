// Проверка на настоящей тестовой сети Hyperliquid: страница грузится, рынки, график, стакан, без ошибок.
import pw from "/opt/npm-tools/node_modules/playwright/index.js"; const { chromium } = pw;
const URL0 = process.env.URL0 || "http://127.0.0.1:8765";
const out = []; const ok = (n, c, x = "") => out.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const vp of [{ w: 1440, h: 900, n: "desktop" }, { w: 390, h: 844, n: "mobile" }]) {
  const p = await b.newPage({ viewport: { width: vp.w, height: vp.h } });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(URL0 + "/trade"); await p.waitForTimeout(9000);
  const n = await p.evaluate(() => document.querySelectorAll("#asks .ob-row, #bids .ob-row").length);
  ok(`[${vp.n}] стакан BTC заполнен`, n > 5, `строк=${n}`);
  ok(`[${vp.n}] цена в шапке`, /\d/.test(await p.textContent("#mkPrice")), await p.textContent("#mkPrice"));
  if (vp.n === "desktop") {
    const h = await p.evaluate(() => document.querySelector(".chart-wrap canvas")?.getBoundingClientRect().height || 0);
    ok("[desktop] график нарисован", h > 100, `h=${h}`);
    await p.click("#pairBtn"); await p.waitForTimeout(500);
    const rows = await p.locator("#pairList .pp-row").count();
    ok("[desktop] список пар", rows > 20, `пар=${rows}`);
    await p.screenshot({ path: "tests/out-desktop.png" });
    await p.goto(URL0 + "/"); await p.waitForTimeout(6000);
    ok("[desktop] лендинг с живыми рынками", (await p.locator("#lnRows tr[data-ln-coin]").count()) >= 5);
    ok("[desktop] 3D-знак", (await p.locator("#lnMark canvas").count()) === 1);
    await p.screenshot({ path: "tests/out-landing.png" });
  } else await p.screenshot({ path: "tests/out-mobile.png" });
  ok(`[${vp.n}] без ошибок страницы`, errs.length === 0, errs.join(" | ").slice(0, 300));
  await p.close();
}
await b.close(); console.log(out.join("\n"));
