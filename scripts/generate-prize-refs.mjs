/**
 * Generate prize billboard PNGs into public/refs via headless canvas.
 * node scripts/generate-prize-refs.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "refs");
fs.mkdirSync(outDir, { recursive: true });

const SIZE = 256;

const draws = {
  "fiatclaw-token.png": (ctx) => {
    const g = ctx.createRadialGradient(128, 100, 20, 128, 128, 110);
    g.addColorStop(0, "#2a1018");
    g.addColorStop(1, "#0a0b10");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#FF3E5C";
    ctx.lineWidth = 10;
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(128, 128, 100, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#FF3E5C";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(128, 170);
    ctx.lineTo(90, 100);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(128, 170);
    ctx.lineTo(128, 88);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(128, 170);
    ctx.lineTo(166, 100);
    ctx.stroke();
    ctx.fillStyle = "#EDEEF2";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("$FIATCLAW", 128, 210);
  },
  "crystal.png": (ctx) => {
    const pts = [
      [128, 28],
      [192, 88],
      [172, 200],
      [128, 232],
      [84, 200],
      [64, 88],
    ];
    const grad = ctx.createLinearGradient(80, 40, 180, 220);
    grad.addColorStop(0, "#e9d5ff");
    grad.addColorStop(0.35, "#9945FF");
    grad.addColorStop(1, "#2e1065");
    ctx.fillStyle = grad;
    ctx.shadowColor = "#9945FF";
    ctx.shadowBlur = 28;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(128, 28);
    ctx.lineTo(128, 232);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(64, 88);
    ctx.lineTo(192, 88);
    ctx.stroke();
    // cyan edge accent
    ctx.strokeStyle = "#22D3FF";
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(128, 28);
    ctx.lineTo(192, 88);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },
  "sol-token.png": (ctx) => {
    const g = ctx.createRadialGradient(128, 110, 10, 128, 128, 110);
    g.addColorStop(0, "#2a1040");
    g.addColorStop(1, "#0a0614");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#22D3FF";
    ctx.lineWidth = 9;
    ctx.shadowColor = "#22D3FF";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(128, 128, 100, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate(-0.4);
    const cols = ["#22D3FF", "#9945FF", "#14F195"];
    [-36, 0, 36].forEach((y, i) => {
      ctx.fillStyle = cols[i];
      ctx.shadowColor = cols[i];
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(-48, y - 10);
      ctx.lineTo(48, y - 10);
      ctx.lineTo(40, y + 10);
      ctx.lineTo(-40, y + 10);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  },
  "jackpot-cube.png": (ctx) => {
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#0a0c12";
    ctx.fillRect(58, 58, 140, 140);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#FF3E5C";
    ctx.lineWidth = 6;
    ctx.strokeRect(58, 58, 140, 140);
    ctx.strokeStyle = "#22D3FF";
    ctx.lineWidth = 3;
    ctx.strokeRect(70, 70, 116, 116);
    ctx.fillStyle = "#FF3E5C";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("JP", 128, 128);
  },
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });

await page.setContent(`<!DOCTYPE html><html><body style="margin:0;background:transparent">
<canvas id="c" width="${SIZE}" height="${SIZE}"></canvas>
</body></html>`);

for (const [file, drawFn] of Object.entries(draws)) {
  await page.evaluate(() => {
    const c = document.getElementById("c");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
  });
  await page.evaluate((name) => {
    // draw functions injected below via Function
    window.__drawName = name;
  }, file);

  // Serialize draw by re-running from node-side code string map
  const drawSource = draws[file].toString();
  await page.evaluate((src) => {
    const c = document.getElementById("c");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    const fn = eval("(" + src + ")");
    fn(ctx);
  }, drawSource);

  const buf = await page.locator("#c").screenshot({
    type: "png",
    omitBackground: true,
  });
  const out = path.join(outDir, file);
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length);
}

await browser.close();
console.log("done");
