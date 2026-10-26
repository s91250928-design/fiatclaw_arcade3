// Общая обвязка проверок: настоящие рыночные данные тестовой сети Hyperliquid,
// а всё, что касается кошелька пользователя и биржевых действий, подменяется (mock).
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
import { privateKeyToAccount } from "viem/accounts";
export const { chromium } = pw;
export const user = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
export const BUILDER = "0x1111111111111111111111111111111111111111";
export const URL0 = process.env.URL0 || "http://127.0.0.1:8765";
export function makeResults() {
  const out = [];
  return { out, ok: (n, c, x = "") => out.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`), print: () => console.log(out.join("\n")) };
}
export async function setupPage(browser, vp, state, extra = {}) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, colorScheme: extra.theme || "light" });
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  await page.exposeFunction("__ethReq", async (method, params) => {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [user.address];
    if (method === "eth_chainId") return "0x66eee";
    if (method === "eth_signTypedData_v4") { const td = JSON.parse(params[1]); const { EIP712Domain, ...types } = td.types; return user.signTypedData({ domain: td.domain, types, primaryType: td.primaryType, message: td.message }); }
  });
  await page.addInitScript(() => { window.ethereum = { request: ({ method, params }) => window.__ethReq(method, params), on() {} }; try { localStorage.setItem("totum.consent", "1"); } catch {} });
  await page.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.TERM_CONFIG={isTestnet:true,builder:"${BUILDER}",feeTenthBps:25,debug:true};` }));
  await page.route("https://api.hyperliquid-testnet.xyz/**", async (r) => {
    const url = r.request().url();
    const body = JSON.parse(r.request().postData() || "{}");
    if (url.endsWith("/exchange")) {
      state.exchange.push(body);
      const res = state.onExchange ? await state.onExchange(body) : null;
      return r.fulfill({ contentType: "application/json", body: JSON.stringify(res || { status: "ok", response: { type: "default" } }) });
    }
    if (body.user && state.onUserInfo) {
      const res = await state.onUserInfo(body);
      if (res !== undefined) return r.fulfill({ contentType: "application/json", body: JSON.stringify(res) });
    }
    return r.continue();
  });
  return { page, errors };
}
export const connect = async (page) => {
  await page.click("#btnConnect"); await page.waitForTimeout(1500);
};
