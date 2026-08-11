import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto("http://localhost:3000/play", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(8000);
const canvasCount = await page.locator("canvas").count();
const loading = await page.locator("[data-claw-loading]").count();
console.log("canvasCount", canvasCount, "loading", loading);
console.log("--- all logs ---");
console.log(logs.join("\n"));
const failed = await page.evaluate(() =>
  performance
    .getEntriesByType("resource")
    .filter((r) => (r).responseStatus === 404 || (r.name && r.name.includes("404")))
    .map((r) => r.name)
);
// also collect network 404 via response listener - re-run check
console.log("failed resources heuristic", failed);
await browser.close();

