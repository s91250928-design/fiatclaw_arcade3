import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "refs"
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
await page.setContent('<canvas id="c" width="256" height="256"></canvas>');

async function shot(name, drawFn) {
  await page.evaluate((src) => {
    const c = document.getElementById("c");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, 256, 256);
    // eslint-disable-next-line no-eval
    eval("(" + src + ")")(ctx);
  }, drawFn.toString());
  const buf = await page.locator("#c").screenshot({
    type: "png",
    omitBackground: true,
  });
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log(name, buf.length);
}

await shot("fiatclaw-token.png", function (ctx) {
  const g = ctx.createRadialGradient(128, 100, 10, 128, 128, 120);
  g.addColorStop(0, "#5a3040");
  g.addColorStop(0.5, "#2a1822");
  g.addColorStop(1, "#140c12");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#e8c040";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(128, 128, 108, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#FF3E5C";
  ctx.lineWidth = 12;
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#3a2030";
  ctx.beginPath();
  ctx.arc(128, 120, 72, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(128, 108);
  ctx.fillStyle = "#FF6B82";
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.roundRect(-26, -48, 52, 40, 10);
  ctx.fill();
  ctx.fillStyle = "#e0e4ec";
  ctx.beginPath();
  ctx.ellipse(0, -48, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#FF8FA0";
  ctx.lineWidth = 15;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const o of [-0.52, 0, 0.52]) {
    ctx.save();
    ctx.rotate(o);
    ctx.beginPath();
    ctx.moveTo(6, -10);
    ctx.quadraticCurveTo(36, 12, 28, 52);
    ctx.quadraticCurveTo(12, 68, 0, 72);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#FFB0BC";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$FIATCLAW", 128, 214);
});

await shot("sol-token.png", function (ctx) {
  const g = ctx.createRadialGradient(128, 100, 10, 128, 128, 120);
  g.addColorStop(0, "#3a2060");
  g.addColorStop(1, "#100818");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#22D3FF";
  ctx.lineWidth = 12;
  ctx.shadowColor = "#22D3FF";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#241040";
  ctx.beginPath();
  ctx.arc(128, 118, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(128, 116);
  ctx.rotate(-0.32);
  const bars = [
    { y: -28, c: "#5FE0FF" },
    { y: 0, c: "#B07CFF" },
    { y: 28, c: "#3CFFB0" },
  ];
  for (const b of bars) {
    ctx.fillStyle = b.c;
    ctx.beginPath();
    ctx.moveTo(-58, b.y - 12);
    ctx.lineTo(58, b.y - 12);
    ctx.lineTo(48, b.y + 12);
    ctx.lineTo(-68, b.y + 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = "#CFFAFE";
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "center";
  ctx.fillText("SOL", 128, 214);
});

await browser.close();
console.log("bright coins done");
