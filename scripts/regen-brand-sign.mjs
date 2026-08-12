import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "refs",
  "sign-fiatclaw-arcade.png"
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 420 } });
await page.setContent('<canvas id="c" width="1400" height="420"></canvas>');
await page.evaluate(() => {
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  const W = 1400;
  const H = 420;
  ctx.fillStyle = "#080a10";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#FF3E5C";
  ctx.lineWidth = 8;
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 20;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.shadowBlur = 0;

  const cx = 140;
  const cy = H / 2;
  const R = 62;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#0a0c12";
  ctx.fill();
  ctx.strokeStyle = "#FF3E5C";
  ctx.lineWidth = 6;
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy - 12, 14, 0, Math.PI * 2);
  ctx.stroke();
  for (const o of [-0.55, 0, 0.55]) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(o) * 4, cy);
    ctx.quadraticCurveTo(
      cx + Math.sin(o) * 28,
      cy + 18,
      cx + Math.sin(o) * 14,
      cy + 40
    );
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "900 120px Impact, Arial Black, Arial, sans-serif";
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#FF3E5C";
  ctx.fillText("FIATCLAW", 240, H / 2 - 36);
  ctx.shadowBlur = 4;
  ctx.fillStyle = "#FF8FA0";
  ctx.fillText("FIATCLAW", 240, H / 2 - 36);
  ctx.font = "800 44px Arial, sans-serif";
  ctx.shadowColor = "#22D3FF";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#22D3FF";
  ctx.fillText("CLAIM.  WIN.  OWN.", 248, H / 2 + 58);
  ctx.shadowBlur = 0;
});
const buf = await page.locator("#c").screenshot({ type: "png" });
fs.writeFileSync(out, buf);
console.log("wrote", out, buf.length);
await browser.close();
