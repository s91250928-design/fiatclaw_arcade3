/**
 * Clean product-style 3-blade claw sprite for billboard use.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "refs", "claw-sprite.png");
fs.mkdirSync(path.dirname(out), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 512, height: 700 } });
await page.setContent(`<!DOCTYPE html><canvas id="c" width="512" height="700"></canvas>`);

await page.evaluate(() => {
  const ctx = document.getElementById("c").getContext("2d");
  const W = 512;
  const H = 700;
  ctx.clearRect(0, 0, W, H);

  // cable
  ctx.strokeStyle = "#0a0a0c";
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(256, 20);
  ctx.lineTo(256, 110);
  ctx.stroke();
  ctx.strokeStyle = "#3a3e48";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(260, 20);
  ctx.lineTo(260, 110);
  ctx.stroke();

  // carabiner
  ctx.strokeStyle = "#c8d0e0";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(256, 125, 26, 0, Math.PI * 2);
  ctx.stroke();

  // motor cylinder
  const g = ctx.createLinearGradient(170, 140, 340, 340);
  g.addColorStop(0, "#2c3340");
  g.addColorStop(0.45, "#141820");
  g.addColorStop(1, "#080a0e");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(170, 145, 172, 175, 28);
  ctx.fill();
  // side bevel
  ctx.strokeStyle = "#3a4250";
  ctx.lineWidth = 3;
  ctx.stroke();

  // dual red neon rings
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 20;
  ctx.strokeStyle = "#FF3E5C";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(256, 200, 78, 22, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(256, 235, 80, 23, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // red button
  ctx.fillStyle = "#FF3E5C";
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(256, 218, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // collar
  ctx.fillStyle = "#1a1e28";
  ctx.beginPath();
  ctx.roundRect(205, 310, 102, 40, 12);
  ctx.fill();

  // hub
  ctx.fillStyle = "#2a3040";
  ctx.beginPath();
  ctx.arc(256, 365, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#9aa3b0";
  ctx.lineWidth = 4;
  ctx.stroke();

  // three clean curved blades
  function blade(angleDeg, open = 1) {
    ctx.save();
    ctx.translate(256, 375);
    ctx.rotate((angleDeg * Math.PI) / 180);
    // thick metal path
    ctx.strokeStyle = "#12151c";
    ctx.lineWidth = 28;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.bezierCurveTo(55 * open, 40, 70 * open, 110, 58 * open, 195);
    ctx.bezierCurveTo(50 * open, 235, 35 * open, 255, 22 * open, 270);
    ctx.stroke();
    // red neon outer
    ctx.strokeStyle = "#FF3E5C";
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 16;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(18, 5);
    ctx.bezierCurveTo(65 * open, 45, 80 * open, 115, 68 * open, 200);
    ctx.bezierCurveTo(58 * open, 240, 42 * open, 260, 28 * open, 275);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // tip cap
    ctx.fillStyle = "#0c0e12";
    ctx.beginPath();
    ctx.arc(22 * open, 270, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Front-readable: left, right, back
  blade(-55, 1.05);
  blade(55, 1.05);
  blade(180, 0.95);

  // short center probe
  ctx.strokeStyle = "#FF3E5C";
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(256, 375);
  ctx.lineTo(256, 520);
  ctx.stroke();
  ctx.fillStyle = "#FF3E5C";
  ctx.beginPath();
  ctx.arc(256, 528, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
});

const buf = await page.locator("#c").screenshot({ type: "png", omitBackground: true });
fs.writeFileSync(out, buf);
console.log("wrote", out, buf.length);
await browser.close();
