/**
 * Open /play and save a full-page screenshot to artifacts/play-check.png
 * Usage: node scripts/screenshot-play.mjs
 * Requires: npm run dev (http://localhost:3000)
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "artifacts");
const outFile = path.join(outDir, "play-check.png");
const url = process.env.PLAY_URL || "http://localhost:3000/play";

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 1600 },
  deviceScaleFactor: 1,
});

try {
  console.log(`Navigating ${url} …`);
  // Next.js / wallet adapters keep connections open — never wait for networkidle.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  // Wait for claw machine mount or play chrome
  await page
    .waitForSelector(
      '[data-claw-machine], [data-claw-webgl], [data-play-controls], canvas, main',
      { timeout: 45_000 }
    )
    .catch(() => {
      console.warn("Machine selector not found — still capturing page");
    });

  // Allow WebGL / R3F to paint a few frames
  await page.waitForTimeout(4000);

  await page.screenshot({
    path: outFile,
    fullPage: true,
    type: "png",
  });

  console.log(`Saved ${outFile}`);
} finally {
  await browser.close();
}
