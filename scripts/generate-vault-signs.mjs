/**
 * Neon vault sign textures (readable, no drei Text wrap bugs).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "refs");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 512, height: 256 } });

async function draw(file, src) {
  await page.setContent(
    `<!DOCTYPE html><canvas id="c" width="512" height="256"></canvas>`
  );
  await page.evaluate((code) => {
    const c = document.getElementById("c");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, 512, 256);
    eval("(" + code + ")")(ctx);
  }, src);
  const buf = await page.locator("#c").screenshot({
    type: "png",
    omitBackground: true,
  });
  fs.writeFileSync(path.join(outDir, file), buf);
  console.log("wrote", file, buf.length);
}

await draw(
  "sign-win.png",
  function (ctx) {
    ctx.font = "bold 44px Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#FF3E5C";
    ctx.fillText("WIN", 256, 48);
    ctx.fillText("LEGENDARY", 256, 118);
    ctx.fillText("REWARDS", 256, 188);
  }.toString()
);

await draw(
  "sign-claw.png",
  function (ctx) {
    ctx.font = "bold 40px Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#22D3FF";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#22D3FF";
    ctx.fillText("CLAW FIAT.", 256, 90);
    ctx.fillText("WIN CRYPTO.", 256, 168);
  }.toString()
);

await browser.close();
console.log("done");
