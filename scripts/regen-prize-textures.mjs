/**
 * High-contrast prize textures so emblems read at vault camera distance.
 * Uses system Chrome (channel: chrome) — no Playwright CDN download.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "refs");
fs.mkdirSync(outDir, { recursive: true });
const S = 256;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: S, height: S },
  deviceScaleFactor: 1,
});

const arts = {
  "fiatclaw-token.png": `
function(ctx){
  const S=256;
  ctx.clearRect(0,0,S,S);
  // Bright face (not pure black — must read under bloom)
  const g=ctx.createRadialGradient(128,110,8,128,128,118);
  g.addColorStop(0,'#3a2030');
  g.addColorStop(0.45,'#1a1018');
  g.addColorStop(1,'#0c080e');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.arc(128,128,118,0,Math.PI*2); ctx.fill();
  // Gold bevel
  ctx.strokeStyle='#d4af37'; ctx.lineWidth=8;
  ctx.beginPath(); ctx.arc(128,128,110,0,Math.PI*2); ctx.stroke();
  // Red neon rim
  ctx.strokeStyle='#FF3E5C'; ctx.shadowColor='#FF3E5C'; ctx.shadowBlur=16; ctx.lineWidth=10;
  ctx.beginPath(); ctx.arc(128,128,116,0,Math.PI*2); ctx.stroke();
  ctx.shadowBlur=0;
  // Ticks
  ctx.strokeStyle='rgba(255,107,130,0.75)'; ctx.lineWidth=3;
  for(let i=0;i<20;i++){
    const a=(i/20)*Math.PI*2, r0=98, r1=108;
    ctx.beginPath();
    ctx.moveTo(128+Math.cos(a)*r0,128+Math.sin(a)*r0);
    ctx.lineTo(128+Math.cos(a)*r1,128+Math.sin(a)*r1);
    ctx.stroke();
  }
  // Thick 3-blade claw emblem (high contrast)
  ctx.save();
  ctx.translate(128,112);
  ctx.strokeStyle='#FF3E5C'; ctx.fillStyle='#FF6B82';
  ctx.shadowColor='#FF3E5C'; ctx.shadowBlur=12; ctx.lineWidth=14; ctx.lineCap='round'; ctx.lineJoin='round';
  // motor
  ctx.beginPath(); ctx.roundRect(-22,-42,44,34,8); ctx.fill();
  ctx.strokeStyle='#FF3E5C'; ctx.lineWidth=4; ctx.stroke();
  ctx.fillStyle='#c0c8d4';
  ctx.beginPath(); ctx.ellipse(0,-42,16,6,0,0,Math.PI*2); ctx.fill();
  // blades
  ctx.strokeStyle='#FF3E5C'; ctx.lineWidth=13; ctx.shadowBlur=14;
  for(const o of [-0.55,0,0.55]){
    ctx.save(); ctx.rotate(o);
    ctx.beginPath();
    ctx.moveTo(4,-8);
    ctx.quadraticCurveTo(32,8,26,44);
    ctx.quadraticCurveTo(14,58,0,62);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  ctx.shadowBlur=0;
  // Label
  ctx.fillStyle='#FF8FA0'; ctx.shadowColor='#FF3E5C'; ctx.shadowBlur=6;
  ctx.font='bold 20px Arial,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('$FIATCLAW',128,214);
  ctx.shadowBlur=0;
}`,

  "sol-token.png": `
function(ctx){
  ctx.clearRect(0,0,256,256);
  const g=ctx.createRadialGradient(128,110,10,128,128,118);
  g.addColorStop(0,'#2a1850');
  g.addColorStop(1,'#0c0818');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.arc(128,128,118,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#22D3FF'; ctx.shadowColor='#22D3FF'; ctx.shadowBlur=16; ctx.lineWidth=10;
  ctx.beginPath(); ctx.arc(128,128,116,0,Math.PI*2); ctx.stroke();
  ctx.shadowBlur=0;
  ctx.save(); ctx.translate(128,118); ctx.rotate(-0.32);
  const bars=[{y:-30,c:'#22D3FF'},{y:0,c:'#9945FF'},{y:30,c:'#14F195'}];
  for(const b of bars){
    ctx.fillStyle=b.c; ctx.shadowColor=b.c; ctx.shadowBlur=10;
    ctx.beginPath();
    ctx.moveTo(-56,b.y-11); ctx.lineTo(56,b.y-11); ctx.lineTo(46,b.y+11); ctx.lineTo(-66,b.y+11);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore(); ctx.shadowBlur=0;
  ctx.fillStyle='#A5F3FC'; ctx.font='bold 22px Arial,sans-serif'; ctx.textAlign='center';
  ctx.fillText('SOL',128,214);
}`,

  "jackpot-cube.png": `
function(ctx){
  ctx.clearRect(0,0,256,256);
  ctx.fillStyle='rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(128,220,78,16,0,0,Math.PI*2); ctx.fill();
  // top
  ctx.fillStyle='#FFD666'; ctx.beginPath();
  ctx.moveTo(128,28); ctx.lineTo(210,78); ctx.lineTo(128,128); ctx.lineTo(46,78); ctx.closePath(); ctx.fill();
  // left
  ctx.fillStyle='#9a6a10'; ctx.beginPath();
  ctx.moveTo(46,78); ctx.lineTo(128,128); ctx.lineTo(128,212); ctx.lineTo(46,162); ctx.closePath(); ctx.fill();
  // right
  ctx.fillStyle='#d4a020'; ctx.beginPath();
  ctx.moveTo(210,78); ctx.lineTo(128,128); ctx.lineTo(128,212); ctx.lineTo(210,162); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#FF3E5C'; ctx.lineWidth=4; ctx.shadowColor='#FF3E5C'; ctx.shadowBlur=10;
  ctx.beginPath(); ctx.moveTo(128,28); ctx.lineTo(210,78); ctx.lineTo(128,128); ctx.lineTo(46,78); ctx.closePath(); ctx.stroke();
  ctx.shadowBlur=0;
  // claw on top
  ctx.strokeStyle='#0a0c10'; ctx.lineWidth=5; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(110,70); ctx.quadraticCurveTo(100,95,110,112);
  ctx.moveTo(128,66); ctx.lineTo(128,116);
  ctx.moveTo(146,70); ctx.quadraticCurveTo(156,95,146,112);
  ctx.stroke();
  ctx.fillStyle='#0a0c10'; ctx.beginPath(); ctx.arc(128,62,10,0,Math.PI*2); ctx.fill();
}`,

  "nft-box.png": `
function(ctx){
  ctx.clearRect(0,0,256,256);
  ctx.fillStyle='rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(128,222,72,14,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#d4c4ff'; ctx.beginPath();
  ctx.moveTo(128,36); ctx.lineTo(204,86); ctx.lineTo(128,136); ctx.lineTo(52,86); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#5b21b6'; ctx.beginPath();
  ctx.moveTo(52,86); ctx.lineTo(128,136); ctx.lineTo(128,212); ctx.lineTo(52,162); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#8b5cf6'; ctx.beginPath();
  ctx.moveTo(204,86); ctx.lineTo(128,136); ctx.lineTo(128,212); ctx.lineTo(204,162); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#22D3FF'; ctx.shadowColor='#22D3FF'; ctx.shadowBlur=12;
  ctx.beginPath(); ctx.roundRect(88,112,80,36,8); ctx.fill();
  ctx.shadowBlur=0;
  ctx.fillStyle='#0a0c10'; ctx.font='bold 20px Arial,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('NFT',128,132);
}`,

  "mystery-box.png": `
function(ctx){
  ctx.clearRect(0,0,256,256);
  ctx.fillStyle='rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(128,222,74,14,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#0e1c2a';
  ctx.beginPath(); ctx.roundRect(48,64,160,144,14); ctx.fill();
  ctx.fillStyle='#1a3048';
  ctx.beginPath(); ctx.roundRect(42,48,172,40,12); ctx.fill();
  ctx.strokeStyle='#22D3FF'; ctx.lineWidth=6; ctx.shadowColor='#22D3FF'; ctx.shadowBlur=14;
  ctx.strokeRect(48,64,160,144); ctx.strokeRect(42,48,172,40);
  ctx.shadowBlur=0;
  ctx.fillStyle='#FF3E5C'; ctx.shadowColor='#FF3E5C'; ctx.shadowBlur=12;
  ctx.beginPath(); ctx.arc(128,140,34,0,Math.PI*2); ctx.fill();
  ctx.shadowBlur=0;
  ctx.fillStyle='#fff'; ctx.font='bold 48px Arial,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('?',128,144);
}`,

  "crystal.png": `
function(ctx){
  ctx.clearRect(0,0,256,256);
  const pts=[[128,18],[204,88],[178,200],[128,238],[78,200],[52,88]];
  const g=ctx.createLinearGradient(70,20,180,230);
  g.addColorStop(0,'#f5e8ff'); g.addColorStop(0.4,'#c4b5fd'); g.addColorStop(0.75,'#7c3aed'); g.addColorStop(1,'#2e1065');
  ctx.fillStyle=g; ctx.shadowColor='#9945FF'; ctx.shadowBlur=20;
  ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
  for(const p of pts.slice(1)) ctx.lineTo(p[0],p[1]);
  ctx.closePath(); ctx.fill(); ctx.shadowBlur=0;
  ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(128,18); ctx.lineTo(128,238); ctx.stroke();
  ctx.strokeStyle='#22D3FF'; ctx.lineWidth=3; ctx.globalAlpha=0.7;
  ctx.beginPath(); ctx.moveTo(128,18); ctx.lineTo(204,88); ctx.stroke();
  ctx.globalAlpha=1;
}`,
};

await page.setContent(
  `<!DOCTYPE html><canvas id="c" width="${S}" height="${S}" style="background:transparent"></canvas>`
);

for (const [file, code] of Object.entries(arts)) {
  await page.evaluate((src) => {
    const c = document.getElementById("c");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    // eslint-disable-next-line no-eval
    eval("(" + src + ")")(ctx);
  }, code);
  const buf = await page.locator("#c").screenshot({
    type: "png",
    omitBackground: true,
  });
  fs.writeFileSync(path.join(outDir, file), buf);
  console.log("wrote", file, buf.length);
}

// Crown sign texture (wide, fully legible FIATCLAW ARCADE)
await page.setViewportSize({ width: 1280, height: 360 });
await page.setContent(
  `<!DOCTYPE html><canvas id="c" width="1280" height="360" style="background:transparent"></canvas>`
);
await page.evaluate(() => {
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  const W = 1280,
    H = 360;
  ctx.clearRect(0, 0, W, H);
  // solid dark plate so text never washes out
  ctx.fillStyle = "rgba(6,8,14,0.92)";
  ctx.beginPath();
  ctx.roundRect(20, 20, W - 40, H - 40, 28);
  ctx.fill();
  ctx.strokeStyle = "#FF3E5C";
  ctx.lineWidth = 4;
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // hex logo
  const cx = 120,
    cy = H / 2,
    R = 58;
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
  ctx.shadowBlur = 20;
  ctx.stroke();
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy - 16, 14, 0, Math.PI * 2);
  ctx.stroke();
  for (const o of [-0.55, 0, 0.55]) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(o) * 4, cy - 2);
    ctx.quadraticCurveTo(
      cx + Math.sin(o) * 30,
      cy + 20,
      cx + Math.sin(o) * 18,
      cy + 42
    );
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // FIATCLAW — huge, fully in frame
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "900 118px Impact, Arial Black, Arial, sans-serif";
  ctx.shadowColor = "#FF3E5C";
  ctx.shadowBlur = 28;
  ctx.fillStyle = "#FF3E5C";
  ctx.fillText("FIATCLAW", 210, H / 2 - 36);
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#FF8FA0";
  ctx.fillText("FIATCLAW", 210, H / 2 - 36);

  // ARCADE
  ctx.font = "800 56px Arial, sans-serif";
  ctx.shadowColor = "#22D3FF";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#22D3FF";
  ctx.fillText("A   R   C   A   D   E", 218, H / 2 + 52);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(34,211,255,0.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(218, H / 2 + 92);
  ctx.lineTo(1180, H / 2 + 92);
  ctx.stroke();
});
const signBuf = await page.locator("#c").screenshot({
  type: "png",
  omitBackground: true,
});
fs.writeFileSync(path.join(outDir, "sign-fiatclaw-arcade.png"), signBuf);
console.log("wrote sign-fiatclaw-arcade.png", signBuf.length);

await browser.close();
console.log("done");
