// Сколько нативного USDC и ETH уже лежит на торговом адресе в Arbitrum.
// Ничего не отправляет. Адрес только читаем.

const USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const RPCS = ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one.publicnode.com"];

function dec(amount, decimals) {
  const n = BigInt(amount);
  const d = 10n ** BigInt(decimals);
  const w = n / d;
  const f = (n % d).toString().padStart(decimals, "0").slice(0, 6).replace(/0+$/, "");
  return f ? `${w}.${f}` : `${w}`;
}

async function rpc(method, params) {
  let last = "сеть не ответила";
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(8e3),
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const j = await r.json();
      if (typeof j.result === "string") return j.result;
      last = j.error?.message || last;
    } catch { /* следующий узел */ }
  }
  throw new Error(last);
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  const address = String(req.query?.address || new URL(req.url || "/", "http://local").searchParams.get("address") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) return res.status(400).send('{"error":"адрес"}');
  try {
    const [eth, usdc] = await Promise.all([
      rpc("eth_getBalance", [address, "latest"]),
      rpc("eth_call", [{ to: USDC, data: "0x70a08231" + address.slice(2).padStart(64, "0") }, "latest"]),
    ]);
    const ethWei = BigInt(eth);
    const usdcUnits = BigInt(usdc);
    res.status(200).send(JSON.stringify({
      ok: true,
      eth: dec(ethWei, 18),
      usdc: dec(usdcUnits, 6),
      ethOk: ethWei >= 50000000000000n,
      usdcOk: usdcUnits >= 5000000n,
    }));
  } catch (e) {
    res.status(502).send(JSON.stringify({ error: e.message || "не прочиталось" }));
  }
}
