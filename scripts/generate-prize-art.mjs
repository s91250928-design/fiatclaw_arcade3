/**
 * Readable prize art: embossed coins, crystal, 3D-looking boxes (not letter flats).
 * Uses function expressions so page.evaluate(eval) can parse draw.toString().
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "refs");
fs.mkdirSync(outDir, { recursive: true });

const S = 256;

/** @type {Record<string, (ctx: CanvasRenderingContext2D) => void>} */
const arts = {
  "fiatclaw-token.png": function (ctx) {
    const g = ctx.createRadialGradient(128, 110, 20, 128, 128, 115);
    g.addColorStop(0, "#1a1018");
    g.addColorStop(1, "#050608");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 112, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a3040";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(128, 128, 105, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#FF3E5C";
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 16;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(128, 128, 100, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#FF3E5C";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(128, 175);
    ctx.lineTo(95, 105);
    ctx.moveTo(128, 175);
    ctx.lineTo(128, 95);
    ctx.moveTo(128, 175);
    ctx.lineTo(161, 105);
    ctx.stroke();
    ctx.fillStyle = "#EDEEF2";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("$FIATCLAW", 128, 210);
  },
  "sol-token.png": function (ctx) {
    const g = ctx.createRadialGradient(128, 110, 15, 128, 128, 115);
    g.addColorStop(0, "#1a0a30");
    g.addColorStop(1, "#060412");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 112, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#22D3FF";
    ctx.shadowColor = "#22D3FF";
    ctx.shadowBlur = 14;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(128, 128, 100, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate(-0.4);
    const cols = ["#22D3FF", "#9945FF", "#14F195"];
    [-34, 0, 34].forEach((y, i) => {
      ctx.fillStyle = cols[i];
      ctx.shadowColor = cols[i];
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(-50, y - 9);
      ctx.lineTo(50, y - 9);
      ctx.lineTo(42, y + 9);
      ctx.lineTo(-42, y + 9);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  },
  "crystal.png": function (ctx) {
    const pts = [
      [128, 22],
      [198, 85],
      [175, 195],
      [128, 235],
      [81, 195],
      [58, 85],
    ];
    const g = ctx.createLinearGradient(70, 30, 180, 230);
    g.addColorStop(0, "#f3e8ff");
    g.addColorStop(0.35, "#a78bfa");
    g.addColorStop(0.7, "#7c3aed");
    g.addColorStop(1, "#2e1065");
    ctx.fillStyle = g;
    ctx.shadowColor = "#9945FF";
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(128, 22);
    ctx.lineTo(128, 235);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(58, 85);
    ctx.lineTo(198, 85);
    ctx.stroke();
    ctx.strokeStyle = "#22D3FF";
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(128, 22);
    ctx.lineTo(198, 85);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },
  "jackpot-cube.png": function (ctx) {
    // isometric gold cube — not flat JP letters
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(128, 210, 70, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#F5C542";
    ctx.beginPath();
    ctx.moveTo(128, 40);
    ctx.lineTo(200, 80);
    ctx.lineTo(128, 120);
    ctx.lineTo(56, 80);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#8a6010";
    ctx.beginPath();
    ctx.moveTo(56, 80);
    ctx.lineTo(128, 120);
    ctx.lineTo(128, 200);
    ctx.lineTo(56, 160);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#c99420";
    ctx.beginPath();
    ctx.moveTo(200, 80);
    ctx.lineTo(128, 120);
    ctx.lineTo(128, 200);
    ctx.lineTo(200, 160);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#FF3E5C";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(128, 40);
    ctx.lineTo(200, 80);
    ctx.lineTo(128, 120);
    ctx.lineTo(56, 80);
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0a0c10";
    ctx.beginPath();
    ctx.arc(128, 100, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#22D3FF";
    ctx.lineWidth = 2;
    ctx.stroke();
  },
  "nft-box.png": function (ctx) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(128, 215, 65, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c4b5fd";
    ctx.beginPath();
    ctx.moveTo(128, 48);
    ctx.lineTo(195, 88);
    ctx.lineTo(128, 128);
    ctx.lineTo(61, 88);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5b21b6";
    ctx.beginPath();
    ctx.moveTo(61, 88);
    ctx.lineTo(128, 128);
    ctx.lineTo(128, 200);
    ctx.lineTo(61, 160);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7c3aed";
    ctx.beginPath();
    ctx.moveTo(195, 88);
    ctx.lineTo(128, 128);
    ctx.lineTo(128, 200);
    ctx.lineTo(195, 160);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#e9d5ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(195, 88);
    ctx.lineTo(128, 128);
    ctx.lineTo(128, 200);
    ctx.lineTo(195, 160);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(34,211,255,0.85)";
    ctx.beginPath();
    ctx.roundRect(100, 105, 56, 28, 6);
    ctx.fill();
    ctx.fillStyle = "#0a0c10";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("NFT", 128, 124);
  },
  "mystery-box.png": function (ctx) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(128, 215, 68, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0c1824";
    ctx.beginPath();
    ctx.roundRect(55, 70, 146, 130, 12);
    ctx.fill();
    ctx.fillStyle = "#143044";
    ctx.beginPath();
    ctx.roundRect(50, 55, 156, 35, 10);
    ctx.fill();
    ctx.strokeStyle = "#22D3FF";
    ctx.lineWidth = 5;
    ctx.shadowColor = "#22D3FF";
    ctx.shadowBlur = 12;
    ctx.strokeRect(55, 70, 146, 130);
    ctx.strokeRect(50, 55, 156, 35);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FF3E5C";
    ctx.beginPath();
    ctx.arc(128, 135, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", 128, 138);
  },
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: S, height: S } });
await page.setContent(
  `<!DOCTYPE html><canvas id="c" width="${S}" height="${S}"></canvas>`
);

for (const [file, draw] of Object.entries(arts)) {
  await page.evaluate((src) => {
    const c = document.getElementById("c");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    // function declarations stringify as "function (ctx) {...}" — valid eval
    eval("(" + src + ")")(ctx);
  }, draw.toString());
  const buf = await page.locator("#c").screenshot({
    type: "png",
    omitBackground: true,
  });
  fs.writeFileSync(path.join(outDir, file), buf);
  console.log("wrote", file, buf.length);
}
await browser.close();
console.log("done");
