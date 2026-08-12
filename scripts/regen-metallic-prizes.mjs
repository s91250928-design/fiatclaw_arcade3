/**
 * Metallic prize coins matching vault reference (F / S embossed tokens).
 */
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

async function shot(name, drawSrc) {
  await page.evaluate((src) => {
    const c = document.getElementById("c");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, 256, 256);
    // eslint-disable-next-line no-eval
    eval("(" + src + ")")(ctx);
  }, drawSrc);
  const buf = await page.locator("#c").screenshot({
    type: "png",
    omitBackground: true,
  });
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log(name, buf.length);
}

await shot(
  "fiatclaw-token.png",
  `function(ctx){
  const g=ctx.createRadialGradient(110,90,8,128,128,120);
  g.addColorStop(0,'#4a3040'); g.addColorStop(0.45,'#1c1218'); g.addColorStop(1,'#0a0608');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(128,128,118,0,Math.PI*2); ctx.fill();
  // brushed ring
  ctx.strokeStyle='#8a7080'; ctx.lineWidth=8; ctx.beginPath(); ctx.arc(128,128,108,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle='#FF3E5C'; ctx.lineWidth=11; ctx.shadowColor='#FF3E5C'; ctx.shadowBlur=14;
  ctx.beginPath(); ctx.arc(128,128,116,0,Math.PI*2); ctx.stroke(); ctx.shadowBlur=0;
  // ticks
  ctx.strokeStyle='rgba(255,100,120,0.7)'; ctx.lineWidth=3;
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2;ctx.beginPath();ctx.moveTo(128+Math.cos(a)*96,128+Math.sin(a)*96);ctx.lineTo(128+Math.cos(a)*106,128+Math.sin(a)*106);ctx.stroke()}
  // embossed F
  ctx.fillStyle='#2a1820'; ctx.beginPath(); ctx.arc(128,118,58,0,Math.PI*2); ctx.fill();
  ctx.font='900 92px Impact, Arial Black, Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.shadowColor='#FF3E5C'; ctx.shadowBlur=12; ctx.fillStyle='#FF3E5C';
  ctx.fillText('F',128,122);
  ctx.shadowBlur=0; ctx.fillStyle='#FF8FA0'; ctx.font='900 88px Impact, Arial Black, Arial';
  ctx.fillText('F',128,122);
  ctx.fillStyle='#FFB0BC'; ctx.font='bold 15px Arial'; ctx.fillText('$FIATCLAW',128,208);
}`
);

await shot(
  "sol-token.png",
  `function(ctx){
  const g=ctx.createRadialGradient(110,90,8,128,128,120);
  g.addColorStop(0,'#2a2060'); g.addColorStop(0.5,'#140c28'); g.addColorStop(1,'#080410');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(128,128,118,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#22D3FF'; ctx.lineWidth=11; ctx.shadowColor='#22D3FF'; ctx.shadowBlur=14;
  ctx.beginPath(); ctx.arc(128,128,116,0,Math.PI*2); ctx.stroke(); ctx.shadowBlur=0;
  ctx.fillStyle='#1a1038'; ctx.beginPath(); ctx.arc(128,116,56,0,Math.PI*2); ctx.fill();
  // SOL bars
  ctx.save(); ctx.translate(128,116); ctx.rotate(-0.3);
  const bars=[{y:-22,c:'#5FE0FF'},{y:0,c:'#B07CFF'},{y:22,c:'#3CFFB0'}];
  for(const b of bars){
    ctx.fillStyle=b.c; ctx.shadowColor=b.c; ctx.shadowBlur=8;
    ctx.beginPath(); ctx.moveTo(-48,b.y-9); ctx.lineTo(48,b.y-9); ctx.lineTo(40,b.y+9); ctx.lineTo(-56,b.y+9); ctx.closePath(); ctx.fill();
  }
  ctx.restore(); ctx.shadowBlur=0;
  ctx.fillStyle='#A5F3FC'; ctx.font='bold 18px Arial'; ctx.textAlign='center';
  ctx.fillText('SOL',128,208);
}`
);

await shot(
  "jackpot-cube.png",
  `function(ctx){
  ctx.clearRect(0,0,256,256);
  ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(128,222,80,14,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#FFD666'; ctx.beginPath(); ctx.moveTo(128,30); ctx.lineTo(212,80); ctx.lineTo(128,130); ctx.lineTo(44,80); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#9a6810'; ctx.beginPath(); ctx.moveTo(44,80); ctx.lineTo(128,130); ctx.lineTo(128,210); ctx.lineTo(44,160); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#d4a020'; ctx.beginPath(); ctx.moveTo(212,80); ctx.lineTo(128,130); ctx.lineTo(128,210); ctx.lineTo(212,160); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#FF3E5C'; ctx.lineWidth=4; ctx.shadowColor='#FF3E5C'; ctx.shadowBlur=10;
  ctx.beginPath(); ctx.moveTo(128,30); ctx.lineTo(212,80); ctx.lineTo(128,130); ctx.lineTo(44,80); ctx.closePath(); ctx.stroke();
  ctx.shadowBlur=0;
  ctx.fillStyle='#0a0c10'; ctx.font='900 28px Impact, Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('J',128,88);
}`
);

await shot(
  "nft-box.png",
  `function(ctx){
  ctx.clearRect(0,0,256,256);
  ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(128,222,74,14,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#c4b5fd'; ctx.beginPath(); ctx.moveTo(128,36); ctx.lineTo(204,86); ctx.lineTo(128,136); ctx.lineTo(52,86); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#5b21b6'; ctx.beginPath(); ctx.moveTo(52,86); ctx.lineTo(128,136); ctx.lineTo(128,210); ctx.lineTo(52,160); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#8b5cf6'; ctx.beginPath(); ctx.moveTo(204,86); ctx.lineTo(128,136); ctx.lineTo(128,210); ctx.lineTo(204,160); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#22D3FF'; ctx.shadowColor='#22D3FF'; ctx.shadowBlur=10;
  ctx.beginPath(); ctx.roundRect(84,110,88,38,8); ctx.fill();
  ctx.shadowBlur=0; ctx.fillStyle='#0a0c10'; ctx.font='bold 20px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('NFT',128,130);
}`
);

await shot(
  "mystery-box.png",
  `function(ctx){
  ctx.clearRect(0,0,256,256);
  ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(128,222,74,14,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#0e1c2a'; ctx.beginPath(); ctx.roundRect(46,62,164,148,14); ctx.fill();
  ctx.fillStyle='#1a3048'; ctx.beginPath(); ctx.roundRect(40,46,176,42,12); ctx.fill();
  ctx.strokeStyle='#22D3FF'; ctx.lineWidth=6; ctx.shadowColor='#22D3FF'; ctx.shadowBlur=12;
  ctx.strokeRect(46,62,164,148); ctx.strokeRect(40,46,176,42);
  ctx.shadowBlur=0;
  ctx.fillStyle='#FF3E5C'; ctx.shadowColor='#FF3E5C'; ctx.shadowBlur=12;
  ctx.beginPath(); ctx.arc(128,140,36,0,Math.PI*2); ctx.fill();
  ctx.shadowBlur=0; ctx.fillStyle='#fff'; ctx.font='bold 52px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('?',128,144);
}`
);

await browser.close();
console.log("metallic prizes done");
