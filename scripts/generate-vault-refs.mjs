/**
 * Extra prize billboards: NFT capsule, mystery box (for dense vault floor).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "refs");
fs.mkdirSync(outDir, { recursive: true });

const draws = {
  "nft-box.png": (ctx) => {
    // purple NFT cube face
    ctx.shadowColor = "#9945FF";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#1a0a2e";
    ctx.fillRect(48, 48, 160, 160);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#9945FF";
    ctx.lineWidth = 8;
    ctx.strokeRect(48, 48, 160, 160);
    ctx.fillStyle = "#c4b5fd";
    ctx.font = "bold 42px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("NFT", 128, 128);
  },
  "mystery-box.png": (ctx) => {
    ctx.shadowColor = "#22D3FF";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#0a1520";
    ctx.beginPath();
    ctx.roundRect(52, 52, 152, 152, 16);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#22D3FF";
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.fillStyle = "#22D3FF";
    ctx.font = "bold 96px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", 128, 135);
  },
  "claw-industrial.png": (ctx) => {
    // Dark industrial 3-blade claw product shot (etalon-like)
    const W = 512;
    const H = 640;
    ctx.clearRect(0, 0, W, H);

    // cable
    ctx.strokeStyle = "#1a1c20";
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(256, 30);
    ctx.lineTo(256, 120);
    ctx.stroke();

    // motor housing dark metal
    const g = ctx.createLinearGradient(170, 120, 340, 320);
    g.addColorStop(0, "#3a4250");
    g.addColorStop(0.4, "#1a1e28");
    g.addColorStop(1, "#0a0c10");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(168, 130, 176, 170, 24);
    ctx.fill();
    ctx.strokeStyle = "#6a7388";
    ctx.lineWidth = 3;
    ctx.stroke();

    // red/gold trim rings
    ctx.strokeStyle = "#FF3E5C";
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 14;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(256, 185, 78, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#F5C542";
    ctx.shadowColor = "#F5C542";
    ctx.beginPath();
    ctx.ellipse(256, 220, 80, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // hub
    ctx.fillStyle = "#2a3040";
    ctx.beginPath();
    ctx.arc(256, 340, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c8d0e0";
    ctx.lineWidth = 4;
    ctx.stroke();

    function blade(deg, open = 1) {
      ctx.save();
      ctx.translate(256, 350);
      ctx.rotate((deg * Math.PI) / 180);
      // thick dark chrome body
      ctx.strokeStyle = "#2a303c";
      ctx.lineWidth = 34;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.bezierCurveTo(60 * open, 35, 75 * open, 100, 62 * open, 180);
      ctx.bezierCurveTo(52 * open, 220, 38 * open, 245, 24 * open, 265);
      ctx.stroke();
      // lighter metal highlight
      ctx.strokeStyle = "#8a93a8";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(6, 8);
      ctx.bezierCurveTo(52 * open, 40, 65 * open, 105, 54 * open, 175);
      ctx.stroke();
      // red edge
      ctx.strokeStyle = "#FF3E5C";
      ctx.shadowColor = "#FF3E5C";
      ctx.shadowBlur = 10;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(20, 5);
      ctx.bezierCurveTo(72 * open, 40, 85 * open, 105, 72 * open, 185);
      ctx.bezierCurveTo(60 * open, 225, 42 * open, 250, 28 * open, 270);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    blade(-52, 1.05);
    blade(52, 1.05);
    blade(180, 0.95);
  },
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 256, height: 256 } });

for (const [file, draw] of Object.entries(draws)) {
  const size = file.includes("claw") ? 512 : 256;
  const h = file.includes("claw") ? 640 : 256;
  await page.setViewportSize({ width: size, height: h });
  await page.setContent(
    `<!DOCTYPE html><canvas id="c" width="${size}" height="${h}"></canvas>`
  );
  await page.evaluate((src) => {
    const c = document.getElementById("c");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    const fn = eval("(" + src + ")");
    fn(ctx);
  }, draw.toString());
  const buf = await page.locator("#c").screenshot({
    type: "png",
    omitBackground: true,
  });
  const out = path.join(outDir, file);
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length);
}

await browser.close();
