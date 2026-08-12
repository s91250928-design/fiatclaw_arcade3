/**
 * Capture /play/game using system Chrome (channel: chrome).
 * Avoids Playwright CDN browser download when geo-blocked.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "artifacts");
const outFile = path.join(outDir, process.env.PLAY_OUT || "game-check.png");
const url = process.env.PLAY_URL || "http://localhost:3000/play/game";
const scratch =
  process.env.SCRATCH ||
  path.join(
    process.env.LOCALAPPDATA || "",
    "Temp",
    "grok-goal-093f9da9b985",
    "implementer"
  );

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(scratch, { recursive: true });

const lines = [];
const log = (s) => {
  console.log(s);
  lines.push(s);
};

try {
  log(`Launching system Chrome channel…`);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  log(`Navigating ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page
    .waitForSelector(
      "[data-claw-machine], [data-claw-webgl], canvas, [data-game-scene]",
      { timeout: 60_000 }
    )
    .catch((e) => log(`selector: ${e.message}`));
  await page
    .waitForFunction(
      () => {
        const c = document.querySelector("canvas");
        return c && c.width > 100 && c.height > 100;
      },
      { timeout: 60_000 }
    )
    .catch((e) => log(`canvas: ${e.message}`));
  // Allow R3F / WebGL materials + prize textures to settle
  await page.waitForTimeout(8000);
  await page.screenshot({ path: outFile, fullPage: true, type: "png" });
  const st = fs.statSync(outFile);
  log(`Saved ${outFile} size=${st.size}`);
  await browser.close();
  fs.writeFileSync(path.join(scratch, "screenshot.log"), lines.join("\n"));
} catch (err) {
  log(`FAIL: ${err?.stack || err}`);
  fs.writeFileSync(path.join(scratch, "screenshot.log"), lines.join("\n"));
  process.exit(1);
}
