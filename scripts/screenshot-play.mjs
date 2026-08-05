/**
 * Screenshot lobby or game scene.
 * Usage:
 *   node scripts/screenshot-play.mjs              → /play lobby → play-check.png
 *   PLAY_URL=http://localhost:3000/play/game node scripts/screenshot-play.mjs
 * Requires: npm run dev
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "artifacts");
const url = process.env.PLAY_URL || "http://localhost:3000/play";
const isGame = url.includes("/play/game");
const outFile = path.join(
  outDir,
  process.env.PLAY_OUT || (isGame ? "game-check.png" : "play-check.png")
);

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});

try {
  console.log(`Navigating ${url} …`);
  // Next.js / wallet adapters keep connections open — never wait for networkidle.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  // Lobby chrome or full-screen game / WebGL canvas
  await page
    .waitForSelector(
      '[data-arcade-lobby], [data-game-scene], [data-claw-machine], [data-claw-webgl], [data-play-now], canvas, main',
      { timeout: 45_000 }
    )
    .catch(() => {
      console.warn("Machine/lobby selector not found — still capturing page");
    });

  // Wait for WebGL canvas (not just loading text)
  await page
    .waitForFunction(
      () => {
        const c = document.querySelector("canvas");
        return c && c.width > 100 && c.height > 100;
      },
      { timeout: 45_000 }
    )
    .catch(() => console.warn("canvas size wait timed out"));
  // Allow WebGL / R3F to paint
  await page.waitForTimeout(5000);

  await page.screenshot({
    path: outFile,
    fullPage: true,
    type: "png",
  });

  console.log(`Saved ${outFile}`);
} finally {
  await browser.close();
}
