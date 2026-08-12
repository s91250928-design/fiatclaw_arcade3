/**
 * Generate etalon neon vault signage: FIATCLAW (red) + ARCADE (cyan) + claw emblem.
 * Writes public/refs/sign-fiatclaw-arcade.png, sign-win.png, sign-claw.png
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "refs");
fs.mkdirSync(outDir, { recursive: true });

const W = 1024;
const H = 320;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
});

await page.setContent(`<!DOCTYPE html>
<html><body style="margin:0;background:transparent">
<canvas id="c" width="${W}" height="${H}"></canvas>
</body></html>`);

async function writeCanvas(file) {
  const buf = await page.locator("#c").screenshot({
    type: "png",
    omitBackground: true,
  });
  fs.writeFileSync(path.join(outDir, file), buf);
  console.log("wrote", file, buf.length);
}

// Main crown sign: claw hex + FIATCLAW + ARCADE
await page.evaluate(() => {
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  const W = c.width;
  const H = c.height;
  ctx.clearRect(0, 0, W, H);

  // Soft red under-glow plate
  const plate = ctx.createLinearGradient(0, 40, 0, H - 20);
  plate.addColorStop(0, "rgba(40,8,14,0.55)");
  plate.addColorStop(1, "rgba(8,6,12,0.15)");
  ctx.fillStyle = plate;
  ctx.beginPath();
  ctx.roundRect(40, 28, W - 80, H - 56, 28);
  ctx.fill();

  // Hex claw emblem (left of wordmark)
  function drawHexClaw(cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);
    // outer hex ring
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = "#FF3E5C";
    ctx.lineWidth = 5;
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 22;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // inner dark fill
    ctx.fillStyle = "rgba(10,12,18,0.85)";
    ctx.fill();
    // 3-blade mini claw
    ctx.strokeStyle = "#FF3E5C";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 14;
    // motor
    ctx.beginPath();
    ctx.arc(0, -r * 0.22, r * 0.18, 0, Math.PI * 2);
    ctx.stroke();
    // blades
    const opens = [-0.55, 0, 0.55];
    for (const o of opens) {
      ctx.beginPath();
      ctx.moveTo(Math.sin(o) * 6, -r * 0.05);
      ctx.quadraticCurveTo(
        Math.sin(o) * r * 0.55,
        r * 0.15,
        Math.sin(o) * r * 0.35,
        r * 0.48
      );
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  drawHexClaw(118, H / 2 - 4, 52);

  // FIATCLAW wordmark (red neon)
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "900 92px Impact, Arial Black, Arial, sans-serif";
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 28;
  ctx.fillStyle = "#FF3E5C";
  ctx.fillText("FIATCLAW", 190, H / 2 - 28);
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#FF6B82";
  ctx.fillText("FIATCLAW", 190, H / 2 - 28);

  // ARCADE under (cyan neon, letter-spaced)
  ctx.font = "800 42px Arial, sans-serif";
  ctx.letterSpacing = "18px";
  ctx.shadowColor = "#22D3FF";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#22D3FF";
  ctx.fillText("A R C A D E", 196, H / 2 + 42);
  ctx.shadowBlur = 0;

  // Bottom cyan trim line
  ctx.strokeStyle = "rgba(34,211,255,0.55)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#22D3FF";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(190, H / 2 + 72);
  ctx.lineTo(W - 90, H / 2 + 72);
  ctx.stroke();
  ctx.shadowBlur = 0;
});

await writeCanvas("sign-fiatclaw-arcade.png");

// Compact side plate: red FIATCLAW
await page.setViewportSize({ width: 512, height: 256 });
await page.setContent(`<!DOCTYPE html>
<html><body style="margin:0;background:transparent">
<canvas id="c" width="512" height="256"></canvas>
</body></html>`);
await page.evaluate(() => {
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 512, 256);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 72px Impact, Arial Black, Arial, sans-serif";
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#FF3E5C";
  ctx.fillText("FIATCLAW", 256, 110);
  ctx.font = "800 36px Arial, sans-serif";
  ctx.shadowColor = "#22D3FF";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#22D3FF";
  ctx.fillText("ARCADE", 256, 175);
  ctx.shadowBlur = 0;
});
await writeCanvas("sign-win.png");

// Compact side plate: cyan ACCENT
await page.evaluate(() => {
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 512, 256);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 64px Impact, Arial Black, Arial, sans-serif";
  ctx.shadowColor = "#22D3FF";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#22D3FF";
  ctx.fillText("ON-CHAIN", 256, 100);
  ctx.font = "800 40px Arial, sans-serif";
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#FF3E5C";
  ctx.fillText("VAULT", 256, 165);
  ctx.shadowBlur = 0;
});
await writeCanvas("sign-claw.png");

await browser.close();
console.log("vault signs done");
