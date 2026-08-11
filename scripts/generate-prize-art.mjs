/**
 * Prize emblems matching etalon photo:
 * - $FIATCLAW = black coin + red 3-blade industrial claw (not V/arrow)
 * - SOL = recognizable Solana 3-bar logo (cyan/purple/green)
 * - jackpot / NFT / mystery / crystal without foreign random glyphs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "refs");
fs.mkdirSync(outDir, { recursive: true });

const S = 256;

/**
 * Draw etalon-style 3-blade claw emblem (motor + 3 RED curved fingers).
 * Matches photo: red glowing industrial claw on black coin — never a V.
 */
function drawFiatClawEmblem(ctx, cx, cy, scale) {
  const s = scale;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  // Cable
  ctx.strokeStyle = "#6a7080";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -72);
  ctx.lineTo(0, -48);
  ctx.stroke();

  // Motor housing dark + red rim
  ctx.fillStyle = "#12161e";
  ctx.beginPath();
  ctx.roundRect(-24, -48, 48, 38, 9);
  ctx.fill();
  ctx.strokeStyle = "#FF3E5C";
  ctx.lineWidth = 3.5;
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;
  // dark steel top
  ctx.fillStyle = "#4a5260";
  ctx.beginPath();
  ctx.ellipse(0, -48, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // red collar
  ctx.strokeStyle = "#FF3E5C";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, -24, 21, 6, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Pivot hub
  ctx.fillStyle = "#5a6270";
  ctx.beginPath();
  ctx.arc(0, -10, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#FF3E5C";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Three RED curved blades (etalon coin face)
  const blades = [-0.58, 0.0, 0.58];
  for (const open of blades) {
    ctx.save();
    ctx.rotate(open);
    ctx.strokeStyle = "#FF3E5C";
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 12;
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(5, -6);
    ctx.quadraticCurveTo(30, 10, 24, 40);
    ctx.stroke();
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(24, 40);
    ctx.quadraticCurveTo(14, 54, 0, 58);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // joint glow
    ctx.fillStyle = "#FF6B82";
    ctx.beginPath();
    ctx.arc(16, 14, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

/** @type {Record<string, (ctx: CanvasRenderingContext2D) => void>} */
const arts = {
  "fiatclaw-token.png": function (ctx) {
    // Black casino-chip coin + red rim (etalon)
    const g = ctx.createRadialGradient(128, 100, 10, 128, 128, 118);
    g.addColorStop(0, "#1c141c");
    g.addColorStop(0.55, "#0a0c10");
    g.addColorStop(1, "#040508");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.fill();

    // Outer metal bevel
    ctx.strokeStyle = "#3a3440";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(128, 128, 112, 0, Math.PI * 2);
    ctx.stroke();

    // Gold inner chip ring
    ctx.strokeStyle = "#c9a227";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(128, 128, 104, 0, Math.PI * 2);
    ctx.stroke();

    // Red neon outer glow ring
    ctx.strokeStyle = "#FF3E5C";
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 18;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Dashed rim ticks (casino chip)
    ctx.strokeStyle = "rgba(255,62,92,0.55)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r0 = 98;
      const r1 = 106;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0);
      ctx.lineTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1);
      ctx.stroke();
    }

    // 3-blade claw emblem (center) — NOT a V
    drawFiatClawEmblem(ctx, 128, 118, 0.92);

    // $FIATCLAW label
    ctx.fillStyle = "#FF6B82";
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 8;
    ctx.font = "bold 16px Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$FIATCLAW", 128, 218);
    ctx.shadowBlur = 0;
  },

  "sol-token.png": function (ctx) {
    // Dark purple coin + cyan rim
    const g = ctx.createRadialGradient(128, 100, 12, 128, 128, 118);
    g.addColorStop(0, "#1a0a30");
    g.addColorStop(1, "#060412");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#2a2040";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(128, 128, 112, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#22D3FF";
    ctx.shadowColor = "#22D3FF";
    ctx.shadowBlur = 16;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Official-style Solana 3 angled bars (recognizable logo)
    ctx.save();
    ctx.translate(128, 120);
    ctx.rotate(-0.35);
    const bars = [
      { y: -28, c: "#22D3FF" },
      { y: 0, c: "#9945FF" },
      { y: 28, c: "#14F195" },
    ];
    for (const bar of bars) {
      ctx.fillStyle = bar.c;
      ctx.shadowColor = bar.c;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      // parallelogram bar
      ctx.moveTo(-52, bar.y - 10);
      ctx.lineTo(52, bar.y - 10);
      ctx.lineTo(42, bar.y + 10);
      ctx.lineTo(-62, bar.y + 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#A5F3FC";
    ctx.font = "bold 18px Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SOL", 128, 218);
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
    // Gold isometric cube + small claw emblem (etalon jackpot)
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(128, 218, 72, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // top
    ctx.fillStyle = "#F5C542";
    ctx.beginPath();
    ctx.moveTo(128, 36);
    ctx.lineTo(204, 78);
    ctx.lineTo(128, 120);
    ctx.lineTo(52, 78);
    ctx.closePath();
    ctx.fill();
    // left
    ctx.fillStyle = "#8a6010";
    ctx.beginPath();
    ctx.moveTo(52, 78);
    ctx.lineTo(128, 120);
    ctx.lineTo(128, 204);
    ctx.lineTo(52, 162);
    ctx.closePath();
    ctx.fill();
    // right
    ctx.fillStyle = "#c99420";
    ctx.beginPath();
    ctx.moveTo(204, 78);
    ctx.lineTo(128, 120);
    ctx.lineTo(128, 204);
    ctx.lineTo(204, 162);
    ctx.closePath();
    ctx.fill();

    // neon edge
    ctx.strokeStyle = "#FF3E5C";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(128, 36);
    ctx.lineTo(204, 78);
    ctx.lineTo(128, 120);
    ctx.lineTo(52, 78);
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Claw emblem on top face (not random letters)
    ctx.save();
    ctx.translate(128, 78);
    ctx.scale(0.38, 0.38);
    // mini claw: motor + 3 prongs
    ctx.fillStyle = "#0a0c10";
    ctx.beginPath();
    ctx.arc(0, -18, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#FF3E5C";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    // 3 prongs
    ctx.beginPath();
    ctx.moveTo(-12, -8);
    ctx.quadraticCurveTo(-28, 20, -16, 42);
    ctx.moveTo(0, -4);
    ctx.quadraticCurveTo(0, 24, 0, 48);
    ctx.moveTo(12, -8);
    ctx.quadraticCurveTo(28, 20, 16, 42);
    ctx.stroke();
    ctx.restore();
  },

  "nft-box.png": function (ctx) {
    // Purple isometric capsule/box — label NFT only
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(128, 220, 68, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    // top
    ctx.fillStyle = "#c4b5fd";
    ctx.beginPath();
    ctx.moveTo(128, 44);
    ctx.lineTo(198, 86);
    ctx.lineTo(128, 128);
    ctx.lineTo(58, 86);
    ctx.closePath();
    ctx.fill();
    // left
    ctx.fillStyle = "#5b21b6";
    ctx.beginPath();
    ctx.moveTo(58, 86);
    ctx.lineTo(128, 128);
    ctx.lineTo(128, 204);
    ctx.lineTo(58, 162);
    ctx.closePath();
    ctx.fill();
    // right
    ctx.fillStyle = "#7c3aed";
    ctx.beginPath();
    ctx.moveTo(198, 86);
    ctx.lineTo(128, 128);
    ctx.lineTo(128, 204);
    ctx.lineTo(198, 162);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#e9d5ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(198, 86);
    ctx.lineTo(128, 128);
    ctx.lineTo(128, 204);
    ctx.lineTo(198, 162);
    ctx.closePath();
    ctx.stroke();
    // holographic NFT seal
    ctx.fillStyle = "rgba(34,211,255,0.9)";
    ctx.shadowColor = "#22D3FF";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(96, 108, 64, 30, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0a0c10";
    ctx.font = "bold 15px Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("NFT", 128, 124);
  },

  "mystery-box.png": function (ctx) {
    // Dark crate + ? only (no foreign glyphs)
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(128, 220, 70, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0c1824";
    ctx.beginPath();
    ctx.roundRect(52, 68, 152, 136, 12);
    ctx.fill();
    ctx.fillStyle = "#143044";
    ctx.beginPath();
    ctx.roundRect(46, 52, 164, 36, 10);
    ctx.fill();
    ctx.strokeStyle = "#22D3FF";
    ctx.lineWidth = 5;
    ctx.shadowColor = "#22D3FF";
    ctx.shadowBlur = 14;
    ctx.strokeRect(52, 68, 152, 136);
    ctx.strokeRect(46, 52, 164, 36);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FF3E5C";
    ctx.shadowColor = "#FF3E5C";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(128, 138, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 38px Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", 128, 140);
  },
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: S, height: S } });
await page.setContent(
  `<!DOCTYPE html><canvas id="c" width="${S}" height="${S}"></canvas>`
);

// inject helper into page scope by re-inlining draw inside each art (self-contained)
// arts already close over drawFiatClawEmblem only for fiatclaw — need to inject it

async function renderArt(file, drawFn, helpers) {
  await page.evaluate(
    ({ src, helperSrc }) => {
      const c = document.getElementById("c");
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, c.width, c.height);
      // eslint-disable-next-line no-eval
      const helpers = helperSrc ? eval("(" + helperSrc + ")") : {};
      const draw = eval("(" + src + ")");
      // bind helpers onto global for nested calls if needed
      if (helpers.drawFiatClawEmblem) {
        window.__drawFiatClawEmblem = helpers.drawFiatClawEmblem;
      }
      draw(ctx);
    },
    {
      src: drawFn.toString(),
      helperSrc: helpers
        ? JSON.stringify({})
        : null,
    }
  );
}

// Rebuild fiatclaw with helper inlined into the function body string
const fiatSrc = `
function (ctx) {
  ${drawFiatClawEmblem.toString()}
  const g = ctx.createRadialGradient(128, 100, 10, 128, 128, 118);
  g.addColorStop(0, "#1c141c");
  g.addColorStop(0.55, "#0a0c10");
  g.addColorStop(1, "#040508");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3a3440";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(128, 128, 104, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#FF3E5C";
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 18;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(128, 128, 108, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,62,92,0.55)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r0 = 98, r1 = 106;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0);
    ctx.lineTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1);
    ctx.stroke();
  }
  drawFiatClawEmblem(ctx, 128, 118, 0.92);
  ctx.fillStyle = "#FF6B82";
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 8;
  ctx.font = "bold 16px Arial,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$FIATCLAW", 128, 218);
  ctx.shadowBlur = 0;
}
`;

for (const [file, draw] of Object.entries(arts)) {
  const src = file === "fiatclaw-token.png" ? fiatSrc : draw.toString();
  await page.evaluate((code) => {
    const c = document.getElementById("c");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    // eslint-disable-next-line no-eval
    eval("(" + code + ")")(ctx);
  }, src);
  const buf = await page.locator("#c").screenshot({
    type: "png",
    omitBackground: true,
  });
  fs.writeFileSync(path.join(outDir, file), buf);
  console.log("wrote", file, buf.length);
}

await browser.close();
console.log("done");
