import pw from "/opt/npm-tools/node_modules/playwright/index.js"; const { chromium } = pw;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:8765/"); await p.waitForTimeout(5000);
console.log(await p.textContent(".ln-hero h1"), "|", await p.textContent("#lnFee"));
await p.locator("#lnWhy").screenshot({ path: "/home/claude/hyperterm/tests/out-why.png" }); await b.close();
