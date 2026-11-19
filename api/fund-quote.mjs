// ../fiatclaw/lib/quote-handler.mjs
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
function loadGram() {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "gram-swap.cjs");
  const loaded = createRequire(import.meta.url)(file);
  if (typeof loaded.gramSwap !== "function") throw new Error("\u043E\u0431\u043C\u0435\u043D \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u043B\u0441\u044F");
  return loaded.gramSwap;
}
var USDT = "0x9328Eb759596C38a25f59028B146Fecdc3621Dfe";
var USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
var TON_USDT = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
var USDT_RAW = "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe";
var MIN = 10n * 1000000n;
var MAX = 5000n * 1000000n;
var GAS_CAP = 500000000n;
function units(raw, decimals = 6) {
  const t = String(raw ?? "").trim().replace(",", ".");
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(t)) return null;
  const [a, b = ""] = t.split(".");
  return BigInt(a) * 10n ** BigInt(decimals) + BigInt(b.padEnd(decimals, "0"));
}
function dec(amount, decimals) {
  const n = BigInt(amount);
  const d = 10n ** BigInt(decimals);
  const w = n / d;
  const f = (n % d).toString().padStart(Number(decimals), "0").replace(/0+$/, "");
  return f ? `${w}.${f}` : `${w}`;
}
async function tonRaw(friendly) {
  const r = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(friendly)}`, { signal: AbortSignal.timeout(8e3) });
  if (!r.ok) return "";
  const j = await r.json();
  return String(j.address || "").toLowerCase();
}
async function ownUsdtWallet(wallet, ownerFriendly) {
  const [data, owner] = await Promise.all([
    fetch(`https://tonapi.io/v2/blockchain/accounts/${encodeURIComponent(wallet)}/methods/get_wallet_data`, { signal: AbortSignal.timeout(8e3) }).then((r) => r.ok ? r.json() : null).catch(() => null),
    tonRaw(ownerFriendly)
  ]);
  const d = data?.decoded;
  if (!d || !owner) return false;
  return String(d.jetton || "").toLowerCase() === USDT_RAW && String(d.owner || "").toLowerCase() === owner;
}
async function quote(amount, tokenOut, from, to) {
  const headers = { "content-type": "application/json" };
  if (process.env.SYMBIOSIS_KEY) headers["X-Api-Key"] = process.env.SYMBIOSIS_KEY;
  const r = await fetch("https://api.symbiosis.finance/crosschain/v2/quote", {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(12e3),
    body: JSON.stringify({
      tokenAmountIn: {
        address: USDT,
        amount: amount.toString(),
        chainId: 85918,
        decimals: 6,
        symbol: "USDT",
        attributes: { ton: TON_USDT }
      },
      tokenOut,
      from,
      to,
      slippage: 100
    })
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
async function signOf(j, to, from) {
  const msg = j.tx?.messages;
  let gas = null;
  try {
    if (msg?.length === 1) gas = BigInt(msg[0].amount || "0");
  } catch {
    gas = null;
  }
  const payload = msg?.[0]?.payload || "";
  const until = Number(j.tx?.validUntil) || 0;
  const now = Math.floor(Date.now() / 1e3);
  const hasAddr = payload && Buffer.from(payload, "base64").includes(Buffer.from(to.slice(2), "hex"));
  const fresh = until > now && until < now + 10 * 86400;
  if (!(gas > 0n && gas <= GAS_CAP && hasAddr && fresh && payload.length < 12e3)) {
    return { signError: "\u041F\u043E\u0434\u043F\u0438\u0441\u044C \u0437\u0430\u043A\u0440\u044B\u0442\u0430: \u043C\u0430\u0440\u0448\u0440\u0443\u0442 \u043D\u0435 \u043F\u0440\u043E\u0448\u0451\u043B \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u0430\u0434\u0440\u0435\u0441\u0430" };
  }
  const wallet = String(msg[0].address || "");
  if (!/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(wallet) || !await ownUsdtWallet(wallet, from)) {
    return { signError: "\u041F\u043E\u0434\u043F\u0438\u0441\u044C \u0437\u0430\u043A\u0440\u044B\u0442\u0430: \u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u0448\u0451\u043B \u043D\u0435 \u0441 \u0432\u0430\u0448\u0435\u0433\u043E \u043A\u043E\u0448\u0435\u043B\u044C\u043A\u0430 USDT" };
  }
  return { sign: { address: wallet, amount: gas.toString(), payload, validUntil: until } };
}
async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") return res.status(405).send('{"error":"method"}');
  let b = req.body;
  if (!b || typeof b !== "object") {
    try {
      b = JSON.parse(req.body || "{}");
    } catch {
      b = {};
    }
  }
  const to = String(b.to || "").toLowerCase();
  const from = String(b.from || "").trim();
  if (!/^0x[0-9a-f]{40}$/.test(to)) return res.status(400).send('{"error":"\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043A\u043E\u0448\u0435\u043B\u0451\u043A, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u043E\u043C \u0442\u043E\u0440\u0433\u0443\u0435\u0442\u0435"}');
  if (!/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(from)) return res.status(400).send('{"error":"\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043A\u043E\u0448\u0435\u043B\u0451\u043A, \u0441 \u043A\u043E\u0442\u043E\u0440\u043E\u0433\u043E \u0441\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u043C"}');
  if (b.asset === "gram") {
    const g = units(b.amount, 9);
    if (g == null || g < 12n * 1000000000n || g > 5000n * 1000000000n) return res.status(400).send('{"error":"\u0421\u0443\u043C\u043C\u0430 \u043E\u0442 12 \u0434\u043E 5000 GRAM"}');
    let sim, s;
    try {
      sim = await fetch(`https://api.ston.fi/v1/swap/simulate?offer_address=EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c&ask_address=${encodeURIComponent(TON_USDT)}&units=${g}&slippage_tolerance=0.01&user_wallet_address=${encodeURIComponent(from)}`, { method: "POST", signal: AbortSignal.timeout(12e3) });
      s = await sim.json();
    } catch {
      return res.status(502).send('{"error":"\u041E\u0431\u043C\u0435\u043D GRAM \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B. \u0414\u0435\u043D\u044C\u0433\u0438 \u043D\u0435 \u0443\u0445\u043E\u0434\u0438\u043B\u0438"}');
    }
    const ask = BigInt(s.ask_units || "0");
    const minAsk = BigInt(s.min_ask_units || "0");
    if (!sim.ok || ask < MIN) return res.status(422).send('{"error":"\u042D\u0442\u043E\u0439 \u0441\u0443\u043C\u043C\u044B GRAM \u043C\u0430\u043B\u043E \u0434\u043B\u044F \u0437\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F"}');
    let sign2;
    try {
      sign2 = await loadGram()({ from, amount: g.toString(), minAsk: minAsk.toString() });
    } catch (e) {
      const why = String(e?.message || e || "").replace(/\s+/g, " ").slice(0, 160);
      return res.status(422).send(JSON.stringify({ error: why ? `\u041E\u0431\u043C\u0435\u043D GRAM \u043D\u0435 \u0441\u043E\u0431\u0440\u0430\u043B\u0441\u044F: ${why}` : "\u041E\u0431\u043C\u0435\u043D GRAM \u043D\u0435 \u0441\u043E\u0431\u0440\u0430\u043B\u0441\u044F" }));
    }
    return res.status(200).send(JSON.stringify({ ok: true, step: "swap", from, to, askUsdt: dec(ask, 6), sign: sign2 }));
  }
  const amt = units(b.amount);
  if (amt == null || amt < MIN || amt > MAX) return res.status(400).send('{"error":"\u0421\u0443\u043C\u043C\u0430 \u043E\u0442 10 \u0434\u043E 5000 USDT"}');
  let usdc;
  try {
    usdc = await quote(amt, { chainId: 42161, address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6 }, from, to);
  } catch {
    return res.status(502).send('{"error":"\u041C\u043E\u0441\u0442 \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B. \u0414\u0435\u043D\u044C\u0433\u0438 \u043D\u0435 \u0443\u0445\u043E\u0434\u0438\u043B\u0438"}');
  }
  if (usdc.status === 429) return res.status(429).send('{"error":"\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0447\u0430\u0441\u0442\u044B\u0435 \u0440\u0430\u0441\u0447\u0451\u0442\u044B. \u041F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435 \u043C\u0438\u043D\u0443\u0442\u0443"}');
  const uOut = usdc.j?.tokenAmountOut;
  if (usdc.status !== 200 || !uOut?.amount || uOut.chainId !== 42161 || String(uOut.address || "").toLowerCase() !== USDC) {
    const msg = usdc.j?.errors?.[0]?.message || usdc.j?.message || "\u041C\u0430\u0440\u0448\u0440\u0443\u0442 \u0432 USDC \u043D\u0435 \u043F\u043E\u0441\u0447\u0438\u0442\u0430\u043B\u0441\u044F";
    return res.status(422).send(JSON.stringify({ error: msg }));
  }
  const got = BigInt(uOut.amount);
  if (got < 5000000n) return res.status(422).send('{"error":"\u041D\u0430 \u0441\u0447\u0451\u0442 \u043F\u0440\u0438\u0434\u0451\u0442 \u043C\u0435\u043D\u044C\u0448\u0435 5 USDC. Hyperliquid \u0442\u0430\u043A\u0443\u044E \u0441\u0443\u043C\u043C\u0443 \u043D\u0435 \u0437\u0430\u0447\u0438\u0441\u043B\u0438\u0442"}');
  const sign = await signOf(usdc.j, to, from);
  if (!sign.sign) return res.status(422).send(JSON.stringify({ error: sign.signError || "\u041F\u0435\u0440\u0435\u0432\u043E\u0434 \u043D\u0435 \u0441\u043E\u0431\u0440\u0430\u043B\u0441\u044F" }));
  const min = usdc.j.tokenAmountOutMin?.amount ? dec(usdc.j.tokenAmountOutMin.amount, usdc.j.tokenAmountOutMin.decimals || 6) : null;
  res.status(200).send(JSON.stringify({
    ok: true,
    out: dec(got, uOut.decimals || 6),
    min,
    seconds: Number(usdc.j.estimatedTime) || null,
    to,
    from,
    ...sign
  }));
}

// ../fiatclaw/lib/arb-relay.mjs
var crypto = typeof globalThis === "object" && "crypto" in globalThis ? globalThis.crypto : void 0;
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word2, shift) {
  return word2 << 32 - shift | word2 >>> shift;
}
var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
function byteSwap(word2) {
  return word2 << 24 & 4278190080 | word2 << 8 & 16711680 | word2 >>> 8 & 65280 | word2 >>> 24 & 255;
}
function byteSwap32(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap(arr[i]);
  }
  return arr;
}
var swap32IfBE = isLE ? (u) => u : byteSwap32;
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
function randomBytes(bytesLength = 32) {
  if (crypto && typeof crypto.getRandomValues === "function") {
    return crypto.getRandomValues(new Uint8Array(bytesLength));
  }
  if (crypto && typeof crypto.randomBytes === "function") {
    return Uint8Array.from(crypto.randomBytes(bytesLength));
  }
  throw new Error("crypto.getRandomValues must be defined");
}
function setBigUint64(view, byteOffset, value, isLE2) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE2);
  const _32n2 = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n2 & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE2 ? 4 : 0;
  const l = isLE2 ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE2);
  view.setUint32(byteOffset + l, wl, isLE2);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE2) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE2;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE: isLE2 } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE2);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE2);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
var U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
var _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var rotlSH = (h, l, s) => h << s | l >>> 32 - s;
var rotlSL = (h, l, s) => l << s | h >>> 32 - s;
var rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
var rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA256 = class extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var sha256 = /* @__PURE__ */ createHasher(() => new SHA256());
var HMAC = class extends Hash {
  constructor(hash2, _key) {
    super();
    this.finished = false;
    this.destroyed = false;
    ahash(hash2);
    const key = toBytes(_key);
    this.iHash = hash2.create();
    if (typeof this.iHash.update !== "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad = new Uint8Array(blockLen);
    pad.set(key.length > blockLen ? hash2.create().update(key).digest() : key);
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54;
    this.iHash.update(pad);
    this.oHash = hash2.create();
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54 ^ 92;
    this.oHash.update(pad);
    clean(pad);
  }
  update(buf) {
    aexists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists(this);
    abytes(out, this.outputLen);
    this.finished = true;
    this.iHash.digestInto(out);
    this.oHash.update(out);
    this.oHash.digestInto(out);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to || (to = Object.create(Object.getPrototypeOf(this), {}));
    const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
var hmac = (hash2, key, message) => new HMAC(hash2, key).update(message).digest();
hmac.create = (hash2, key) => new HMAC(hash2, key);
var _0n = /* @__PURE__ */ BigInt(0);
var _1n = /* @__PURE__ */ BigInt(1);
function isBytes2(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abytes2(item) {
  if (!isBytes2(item))
    throw new Error("Uint8Array expected");
}
function abool(title, value) {
  if (typeof value !== "boolean")
    throw new Error(title + " boolean expected, got " + value);
}
function numberToHexUnpadded(num) {
  const hex = num.toString(16);
  return hex.length & 1 ? "0" + hex : hex;
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  return hex === "" ? _0n : BigInt("0x" + hex);
}
var hasHexBuiltin = (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
);
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes2(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
var asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function asciiToBase16(ch) {
  if (ch >= asciis._0 && ch <= asciis._9)
    return ch - asciis._0;
  if (ch >= asciis.A && ch <= asciis.F)
    return ch - (asciis.A - 10);
  if (ch >= asciis.a && ch <= asciis.f)
    return ch - (asciis.a - 10);
  return;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  if (hasHexBuiltin)
    return Uint8Array.fromHex(hex);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new Error("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function bytesToNumberBE(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
  abytes2(bytes);
  return hexToNumber(bytesToHex(Uint8Array.from(bytes).reverse()));
}
function numberToBytesBE(n, len) {
  return hexToBytes(n.toString(16).padStart(len * 2, "0"));
}
function numberToBytesLE(n, len) {
  return numberToBytesBE(n, len).reverse();
}
function ensureBytes(title, hex, expectedLength) {
  let res;
  if (typeof hex === "string") {
    try {
      res = hexToBytes(hex);
    } catch (e) {
      throw new Error(title + " must be hex string or Uint8Array, cause: " + e);
    }
  } else if (isBytes2(hex)) {
    res = Uint8Array.from(hex);
  } else {
    throw new Error(title + " must be hex string or Uint8Array");
  }
  const len = res.length;
  if (typeof expectedLength === "number" && len !== expectedLength)
    throw new Error(title + " of length " + expectedLength + " expected, got " + len);
  return res;
}
function concatBytes2(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes2(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
var isPosBig = (n) => typeof n === "bigint" && _0n <= n;
function inRange(n, min, max) {
  return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
}
function aInRange(title, n, min, max) {
  if (!inRange(n, min, max))
    throw new Error("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n);
}
function bitLen(n) {
  let len;
  for (len = 0; n > _0n; n >>= _1n, len += 1)
    ;
  return len;
}
var bitMask = (n) => (_1n << BigInt(n)) - _1n;
var u8n = (len) => new Uint8Array(len);
var u8fr = (arr) => Uint8Array.from(arr);
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
  if (typeof hashLen !== "number" || hashLen < 2)
    throw new Error("hashLen must be a number");
  if (typeof qByteLen !== "number" || qByteLen < 2)
    throw new Error("qByteLen must be a number");
  if (typeof hmacFn !== "function")
    throw new Error("hmacFn must be a function");
  let v = u8n(hashLen);
  let k = u8n(hashLen);
  let i = 0;
  const reset = () => {
    v.fill(1);
    k.fill(0);
    i = 0;
  };
  const h = (...b) => hmacFn(k, v, ...b);
  const reseed = (seed = u8n(0)) => {
    k = h(u8fr([0]), seed);
    v = h();
    if (seed.length === 0)
      return;
    k = h(u8fr([1]), seed);
    v = h();
  };
  const gen2 = () => {
    if (i++ >= 1e3)
      throw new Error("drbg: tried 1000 values");
    let len = 0;
    const out = [];
    while (len < qByteLen) {
      v = h();
      const sl = v.slice();
      out.push(sl);
      len += v.length;
    }
    return concatBytes2(...out);
  };
  const genUntil = (seed, pred) => {
    reset();
    reseed(seed);
    let res = void 0;
    while (!(res = pred(gen2())))
      reseed();
    reset();
    return res;
  };
  return genUntil;
}
var validatorFns = {
  bigint: (val) => typeof val === "bigint",
  function: (val) => typeof val === "function",
  boolean: (val) => typeof val === "boolean",
  string: (val) => typeof val === "string",
  stringOrUint8Array: (val) => typeof val === "string" || isBytes2(val),
  isSafeInteger: (val) => Number.isSafeInteger(val),
  array: (val) => Array.isArray(val),
  field: (val, object) => object.Fp.isValid(val),
  hash: (val) => typeof val === "function" && Number.isSafeInteger(val.outputLen)
};
function validateObject(object, validators, optValidators = {}) {
  const checkField = (fieldName, type, isOptional) => {
    const checkVal = validatorFns[type];
    if (typeof checkVal !== "function")
      throw new Error("invalid validator function");
    const val = object[fieldName];
    if (isOptional && val === void 0)
      return;
    if (!checkVal(val, object)) {
      throw new Error("param " + String(fieldName) + " is invalid. Expected " + type + ", got " + val);
    }
  };
  for (const [fieldName, type] of Object.entries(validators))
    checkField(fieldName, type, false);
  for (const [fieldName, type] of Object.entries(optValidators))
    checkField(fieldName, type, true);
  return object;
}
function memoized(fn) {
  const map = /* @__PURE__ */ new WeakMap();
  return (arg, ...args) => {
    const val = map.get(arg);
    if (val !== void 0)
      return val;
    const computed = fn(arg, ...args);
    map.set(arg, computed);
    return computed;
  };
}
var _0n2 = BigInt(0);
var _1n2 = BigInt(1);
var _2n = /* @__PURE__ */ BigInt(2);
var _3n = /* @__PURE__ */ BigInt(3);
var _4n = /* @__PURE__ */ BigInt(4);
var _5n = /* @__PURE__ */ BigInt(5);
var _8n = /* @__PURE__ */ BigInt(8);
var _9n = /* @__PURE__ */ BigInt(9);
var _16n = /* @__PURE__ */ BigInt(16);
function mod(a, b) {
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function pow2(x, power, modulo) {
  let res = x;
  while (power-- > _0n2) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number, modulo) {
  if (number === _0n2)
    throw new Error("invert: expected non-zero number");
  if (modulo <= _0n2)
    throw new Error("invert: expected positive modulus, got " + modulo);
  let a = mod(number, modulo);
  let b = modulo;
  let x = _0n2, y = _1n2, u = _1n2, v = _0n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b % a;
    const m = x - u * q;
    const n = y - v * q;
    b = a, a = r, x = u, y = v, u = m, v = n;
  }
  const gcd = b;
  if (gcd !== _1n2)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function tonelliShanks(P) {
  let Q = P - _1n2;
  let S = 0;
  while (Q % _2n === _0n2) {
    Q /= _2n;
    S++;
  }
  let Z = _2n;
  const _Fp = Field(P);
  while (Z < P && FpIsSquare(_Fp, Z)) {
    if (Z++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  }
  if (S === 1) {
    const p1div4 = (P + _1n2) / _4n;
    return function tonelliFast(Fp, n) {
      const root = Fp.pow(n, p1div4);
      if (!Fp.eql(Fp.sqr(root), n))
        throw new Error("Cannot find square root");
      return root;
    };
  }
  const Q1div2 = (Q + _1n2) / _2n;
  return function tonelliSlow(Fp, n) {
    if (!FpIsSquare(Fp, n))
      throw new Error("Cannot find square root");
    let r = S;
    let g = Fp.pow(Fp.mul(Fp.ONE, Z), Q);
    let x = Fp.pow(n, Q1div2);
    let b = Fp.pow(n, Q);
    while (!Fp.eql(b, Fp.ONE)) {
      if (Fp.eql(b, Fp.ZERO))
        return Fp.ZERO;
      let m = 1;
      for (let t2 = Fp.sqr(b); m < r; m++) {
        if (Fp.eql(t2, Fp.ONE))
          break;
        t2 = Fp.sqr(t2);
      }
      const ge = Fp.pow(g, _1n2 << BigInt(r - m - 1));
      g = Fp.sqr(ge);
      x = Fp.mul(x, ge);
      b = Fp.mul(b, g);
      r = m;
    }
    return x;
  };
}
function FpSqrt(P) {
  if (P % _4n === _3n) {
    return function sqrt3mod4(Fp, n) {
      const p1div4 = (P + _1n2) / _4n;
      const root = Fp.pow(n, p1div4);
      if (!Fp.eql(Fp.sqr(root), n))
        throw new Error("Cannot find square root");
      return root;
    };
  }
  if (P % _8n === _5n) {
    return function sqrt5mod8(Fp, n) {
      const n2 = Fp.mul(n, _2n);
      const c1 = (P - _5n) / _8n;
      const v = Fp.pow(n2, c1);
      const nv = Fp.mul(n, v);
      const i = Fp.mul(Fp.mul(nv, _2n), v);
      const root = Fp.mul(nv, Fp.sub(i, Fp.ONE));
      if (!Fp.eql(Fp.sqr(root), n))
        throw new Error("Cannot find square root");
      return root;
    };
  }
  if (P % _16n === _9n) {
  }
  return tonelliShanks(P);
}
var FIELD_FIELDS = [
  "create",
  "isValid",
  "is0",
  "neg",
  "inv",
  "sqrt",
  "sqr",
  "eql",
  "add",
  "sub",
  "mul",
  "pow",
  "div",
  "addN",
  "subN",
  "mulN",
  "sqrN"
];
function validateField(field) {
  const initial = {
    ORDER: "bigint",
    MASK: "bigint",
    BYTES: "isSafeInteger",
    BITS: "isSafeInteger"
  };
  const opts = FIELD_FIELDS.reduce((map, val) => {
    map[val] = "function";
    return map;
  }, initial);
  return validateObject(field, opts);
}
function FpPow(Fp, num, power) {
  if (power < _0n2)
    throw new Error("invalid exponent, negatives unsupported");
  if (power === _0n2)
    return Fp.ONE;
  if (power === _1n2)
    return num;
  let p = Fp.ONE;
  let d = num;
  while (power > _0n2) {
    if (power & _1n2)
      p = Fp.mul(p, d);
    d = Fp.sqr(d);
    power >>= _1n2;
  }
  return p;
}
function FpInvertBatch(Fp, nums, passZero = false) {
  const inverted = new Array(nums.length).fill(passZero ? Fp.ZERO : void 0);
  const multipliedAcc = nums.reduce((acc, num, i) => {
    if (Fp.is0(num))
      return acc;
    inverted[i] = acc;
    return Fp.mul(acc, num);
  }, Fp.ONE);
  const invertedAcc = Fp.inv(multipliedAcc);
  nums.reduceRight((acc, num, i) => {
    if (Fp.is0(num))
      return acc;
    inverted[i] = Fp.mul(acc, inverted[i]);
    return Fp.mul(acc, num);
  }, invertedAcc);
  return inverted;
}
function FpLegendre(Fp, n) {
  const legc = (Fp.ORDER - _1n2) / _2n;
  const powered = Fp.pow(n, legc);
  const yes = Fp.eql(powered, Fp.ONE);
  const zero = Fp.eql(powered, Fp.ZERO);
  const no = Fp.eql(powered, Fp.neg(Fp.ONE));
  if (!yes && !zero && !no)
    throw new Error("Cannot find square root: probably non-prime P");
  return yes ? 1 : zero ? 0 : -1;
}
function FpIsSquare(Fp, n) {
  const l = FpLegendre(Fp, n);
  return l === 0 || l === 1;
}
function nLength(n, nBitLength) {
  if (nBitLength !== void 0)
    anumber(nBitLength);
  const _nBitLength = nBitLength !== void 0 ? nBitLength : n.toString(2).length;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
function Field(ORDER, bitLen2, isLE2 = false, redef = {}) {
  if (ORDER <= _0n2)
    throw new Error("invalid field: expected ORDER > 0, got " + ORDER);
  const { nBitLength: BITS, nByteLength: BYTES } = nLength(ORDER, bitLen2);
  if (BYTES > 2048)
    throw new Error("invalid field: expected ORDER of <= 2048 bytes");
  let sqrtP;
  const f = Object.freeze({
    ORDER,
    isLE: isLE2,
    BITS,
    BYTES,
    MASK: bitMask(BITS),
    ZERO: _0n2,
    ONE: _1n2,
    create: (num) => mod(num, ORDER),
    isValid: (num) => {
      if (typeof num !== "bigint")
        throw new Error("invalid field element: expected bigint, got " + typeof num);
      return _0n2 <= num && num < ORDER;
    },
    is0: (num) => num === _0n2,
    isOdd: (num) => (num & _1n2) === _1n2,
    neg: (num) => mod(-num, ORDER),
    eql: (lhs, rhs) => lhs === rhs,
    sqr: (num) => mod(num * num, ORDER),
    add: (lhs, rhs) => mod(lhs + rhs, ORDER),
    sub: (lhs, rhs) => mod(lhs - rhs, ORDER),
    mul: (lhs, rhs) => mod(lhs * rhs, ORDER),
    pow: (num, power) => FpPow(f, num, power),
    div: (lhs, rhs) => mod(lhs * invert(rhs, ORDER), ORDER),
    // Same as above, but doesn't normalize
    sqrN: (num) => num * num,
    addN: (lhs, rhs) => lhs + rhs,
    subN: (lhs, rhs) => lhs - rhs,
    mulN: (lhs, rhs) => lhs * rhs,
    inv: (num) => invert(num, ORDER),
    sqrt: redef.sqrt || ((n) => {
      if (!sqrtP)
        sqrtP = FpSqrt(ORDER);
      return sqrtP(f, n);
    }),
    toBytes: (num) => isLE2 ? numberToBytesLE(num, BYTES) : numberToBytesBE(num, BYTES),
    fromBytes: (bytes) => {
      if (bytes.length !== BYTES)
        throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
      return isLE2 ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
    },
    // TODO: we don't need it here, move out to separate fn
    invertBatch: (lst) => FpInvertBatch(f, lst),
    // We can't move this out because Fp6, Fp12 implement it
    // and it's unclear what to return in there.
    cmov: (a, b, c) => c ? b : a
  });
  return Object.freeze(f);
}
function getFieldBytesLength(fieldOrder) {
  if (typeof fieldOrder !== "bigint")
    throw new Error("field order must be bigint");
  const bitLength = fieldOrder.toString(2).length;
  return Math.ceil(bitLength / 8);
}
function getMinHashLength(fieldOrder) {
  const length = getFieldBytesLength(fieldOrder);
  return length + Math.ceil(length / 2);
}
function mapHashToField(key, fieldOrder, isLE2 = false) {
  const len = key.length;
  const fieldLen = getFieldBytesLength(fieldOrder);
  const minLen = getMinHashLength(fieldOrder);
  if (len < 16 || len < minLen || len > 1024)
    throw new Error("expected " + minLen + "-1024 bytes of input, got " + len);
  const num = isLE2 ? bytesToNumberLE(key) : bytesToNumberBE(key);
  const reduced = mod(num, fieldOrder - _1n2) + _1n2;
  return isLE2 ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
}
var _0n3 = BigInt(0);
var _1n3 = BigInt(1);
function constTimeNegate(condition, item) {
  const neg = item.negate();
  return condition ? neg : item;
}
function validateW(W, bits) {
  if (!Number.isSafeInteger(W) || W <= 0 || W > bits)
    throw new Error("invalid window size, expected [1.." + bits + "], got W=" + W);
}
function calcWOpts(W, scalarBits) {
  validateW(W, scalarBits);
  const windows = Math.ceil(scalarBits / W) + 1;
  const windowSize = 2 ** (W - 1);
  const maxNumber = 2 ** W;
  const mask = bitMask(W);
  const shiftBy = BigInt(W);
  return { windows, windowSize, mask, maxNumber, shiftBy };
}
function calcOffsets(n, window, wOpts) {
  const { windowSize, mask, maxNumber, shiftBy } = wOpts;
  let wbits = Number(n & mask);
  let nextN = n >> shiftBy;
  if (wbits > windowSize) {
    wbits -= maxNumber;
    nextN += _1n3;
  }
  const offsetStart = window * windowSize;
  const offset = offsetStart + Math.abs(wbits) - 1;
  const isZero = wbits === 0;
  const isNeg = wbits < 0;
  const isNegF = window % 2 !== 0;
  const offsetF = offsetStart;
  return { nextN, offset, isZero, isNeg, isNegF, offsetF };
}
function validateMSMPoints(points, c) {
  if (!Array.isArray(points))
    throw new Error("array expected");
  points.forEach((p, i) => {
    if (!(p instanceof c))
      throw new Error("invalid point at index " + i);
  });
}
function validateMSMScalars(scalars, field) {
  if (!Array.isArray(scalars))
    throw new Error("array of scalars expected");
  scalars.forEach((s, i) => {
    if (!field.isValid(s))
      throw new Error("invalid scalar at index " + i);
  });
}
var pointPrecomputes = /* @__PURE__ */ new WeakMap();
var pointWindowSizes = /* @__PURE__ */ new WeakMap();
function getW(P) {
  return pointWindowSizes.get(P) || 1;
}
function wNAF(c, bits) {
  return {
    constTimeNegate,
    hasPrecomputes(elm) {
      return getW(elm) !== 1;
    },
    // non-const time multiplication ladder
    unsafeLadder(elm, n, p = c.ZERO) {
      let d = elm;
      while (n > _0n3) {
        if (n & _1n3)
          p = p.add(d);
        d = d.double();
        n >>= _1n3;
      }
      return p;
    },
    /**
     * Creates a wNAF precomputation window. Used for caching.
     * Default window size is set by `utils.precompute()` and is equal to 8.
     * Number of precomputed points depends on the curve size:
     * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
     * - 𝑊 is the window size
     * - 𝑛 is the bitlength of the curve order.
     * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
     * @param elm Point instance
     * @param W window size
     * @returns precomputed point tables flattened to a single array
     */
    precomputeWindow(elm, W) {
      const { windows, windowSize } = calcWOpts(W, bits);
      const points = [];
      let p = elm;
      let base = p;
      for (let window = 0; window < windows; window++) {
        base = p;
        points.push(base);
        for (let i = 1; i < windowSize; i++) {
          base = base.add(p);
          points.push(base);
        }
        p = base.double();
      }
      return points;
    },
    /**
     * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
     * @param W window size
     * @param precomputes precomputed tables
     * @param n scalar (we don't check here, but should be less than curve order)
     * @returns real and fake (for const-time) points
     */
    wNAF(W, precomputes, n) {
      let p = c.ZERO;
      let f = c.BASE;
      const wo = calcWOpts(W, bits);
      for (let window = 0; window < wo.windows; window++) {
        const { nextN, offset, isZero, isNeg, isNegF, offsetF } = calcOffsets(n, window, wo);
        n = nextN;
        if (isZero) {
          f = f.add(constTimeNegate(isNegF, precomputes[offsetF]));
        } else {
          p = p.add(constTimeNegate(isNeg, precomputes[offset]));
        }
      }
      return { p, f };
    },
    /**
     * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
     * @param W window size
     * @param precomputes precomputed tables
     * @param n scalar (we don't check here, but should be less than curve order)
     * @param acc accumulator point to add result of multiplication
     * @returns point
     */
    wNAFUnsafe(W, precomputes, n, acc = c.ZERO) {
      const wo = calcWOpts(W, bits);
      for (let window = 0; window < wo.windows; window++) {
        if (n === _0n3)
          break;
        const { nextN, offset, isZero, isNeg } = calcOffsets(n, window, wo);
        n = nextN;
        if (isZero) {
          continue;
        } else {
          const item = precomputes[offset];
          acc = acc.add(isNeg ? item.negate() : item);
        }
      }
      return acc;
    },
    getPrecomputes(W, P, transform) {
      let comp = pointPrecomputes.get(P);
      if (!comp) {
        comp = this.precomputeWindow(P, W);
        if (W !== 1)
          pointPrecomputes.set(P, transform(comp));
      }
      return comp;
    },
    wNAFCached(P, n, transform) {
      const W = getW(P);
      return this.wNAF(W, this.getPrecomputes(W, P, transform), n);
    },
    wNAFCachedUnsafe(P, n, transform, prev) {
      const W = getW(P);
      if (W === 1)
        return this.unsafeLadder(P, n, prev);
      return this.wNAFUnsafe(W, this.getPrecomputes(W, P, transform), n, prev);
    },
    // We calculate precomputes for elliptic curve point multiplication
    // using windowed method. This specifies window size and
    // stores precomputed values. Usually only base point would be precomputed.
    setWindowSize(P, W) {
      validateW(W, bits);
      pointWindowSizes.set(P, W);
      pointPrecomputes.delete(P);
    }
  };
}
function pippenger(c, fieldN, points, scalars) {
  validateMSMPoints(points, c);
  validateMSMScalars(scalars, fieldN);
  if (points.length !== scalars.length)
    throw new Error("arrays of points and scalars must have equal length");
  const zero = c.ZERO;
  const wbits = bitLen(BigInt(points.length));
  const windowSize = wbits > 12 ? wbits - 3 : wbits > 4 ? wbits - 2 : wbits ? 2 : 1;
  const MASK = bitMask(windowSize);
  const buckets = new Array(Number(MASK) + 1).fill(zero);
  const lastBits = Math.floor((fieldN.BITS - 1) / windowSize) * windowSize;
  let sum = zero;
  for (let i = lastBits; i >= 0; i -= windowSize) {
    buckets.fill(zero);
    for (let j = 0; j < scalars.length; j++) {
      const scalar = scalars[j];
      const wbits2 = Number(scalar >> BigInt(i) & MASK);
      buckets[wbits2] = buckets[wbits2].add(points[j]);
    }
    let resI = zero;
    for (let j = buckets.length - 1, sumI = zero; j > 0; j--) {
      sumI = sumI.add(buckets[j]);
      resI = resI.add(sumI);
    }
    sum = sum.add(resI);
    if (i !== 0)
      for (let j = 0; j < windowSize; j++)
        sum = sum.double();
  }
  return sum;
}
function validateBasic(curve) {
  validateField(curve.Fp);
  validateObject(curve, {
    n: "bigint",
    h: "bigint",
    Gx: "field",
    Gy: "field"
  }, {
    nBitLength: "isSafeInteger",
    nByteLength: "isSafeInteger"
  });
  return Object.freeze({
    ...nLength(curve.n, curve.nBitLength),
    ...curve,
    ...{ p: curve.Fp.ORDER }
  });
}
function validateSigVerOpts(opts) {
  if (opts.lowS !== void 0)
    abool("lowS", opts.lowS);
  if (opts.prehash !== void 0)
    abool("prehash", opts.prehash);
}
function validatePointOpts(curve) {
  const opts = validateBasic(curve);
  validateObject(opts, {
    a: "field",
    b: "field"
  }, {
    allowedPrivateKeyLengths: "array",
    wrapPrivateKey: "boolean",
    isTorsionFree: "function",
    clearCofactor: "function",
    allowInfinityPoint: "boolean",
    fromBytes: "function",
    toBytes: "function"
  });
  const { endo, Fp, a } = opts;
  if (endo) {
    if (!Fp.eql(a, Fp.ZERO)) {
      throw new Error("invalid endomorphism, can only be defined for Koblitz curves that have a=0");
    }
    if (typeof endo !== "object" || typeof endo.beta !== "bigint" || typeof endo.splitScalar !== "function") {
      throw new Error("invalid endomorphism, expected beta: bigint and splitScalar: function");
    }
  }
  return Object.freeze({ ...opts });
}
var DERErr = class extends Error {
  constructor(m = "") {
    super(m);
  }
};
var DER = {
  // asn.1 DER encoding utils
  Err: DERErr,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (tag, data) => {
      const { Err: E } = DER;
      if (tag < 0 || tag > 256)
        throw new E("tlv.encode: wrong tag");
      if (data.length & 1)
        throw new E("tlv.encode: unpadded data");
      const dataLen = data.length / 2;
      const len = numberToHexUnpadded(dataLen);
      if (len.length / 2 & 128)
        throw new E("tlv.encode: long form length too big");
      const lenLen = dataLen > 127 ? numberToHexUnpadded(len.length / 2 | 128) : "";
      const t = numberToHexUnpadded(tag);
      return t + lenLen + len + data;
    },
    // v - value, l - left bytes (unparsed)
    decode(tag, data) {
      const { Err: E } = DER;
      let pos = 0;
      if (tag < 0 || tag > 256)
        throw new E("tlv.encode: wrong tag");
      if (data.length < 2 || data[pos++] !== tag)
        throw new E("tlv.decode: wrong tlv");
      const first = data[pos++];
      const isLong = !!(first & 128);
      let length = 0;
      if (!isLong)
        length = first;
      else {
        const lenLen = first & 127;
        if (!lenLen)
          throw new E("tlv.decode(long): indefinite length not supported");
        if (lenLen > 4)
          throw new E("tlv.decode(long): byte length is too big");
        const lengthBytes = data.subarray(pos, pos + lenLen);
        if (lengthBytes.length !== lenLen)
          throw new E("tlv.decode: length bytes not complete");
        if (lengthBytes[0] === 0)
          throw new E("tlv.decode(long): zero leftmost byte");
        for (const b of lengthBytes)
          length = length << 8 | b;
        pos += lenLen;
        if (length < 128)
          throw new E("tlv.decode(long): not minimal encoding");
      }
      const v = data.subarray(pos, pos + length);
      if (v.length !== length)
        throw new E("tlv.decode: wrong value length");
      return { v, l: data.subarray(pos + length) };
    }
  },
  // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  // since we always use positive integers here. It must always be empty:
  // - add zero byte if exists
  // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  _int: {
    encode(num) {
      const { Err: E } = DER;
      if (num < _0n4)
        throw new E("integer: negative integers are not allowed");
      let hex = numberToHexUnpadded(num);
      if (Number.parseInt(hex[0], 16) & 8)
        hex = "00" + hex;
      if (hex.length & 1)
        throw new E("unexpected DER parsing assertion: unpadded hex");
      return hex;
    },
    decode(data) {
      const { Err: E } = DER;
      if (data[0] & 128)
        throw new E("invalid signature integer: negative");
      if (data[0] === 0 && !(data[1] & 128))
        throw new E("invalid signature integer: unnecessary leading zero");
      return bytesToNumberBE(data);
    }
  },
  toSig(hex) {
    const { Err: E, _int: int, _tlv: tlv } = DER;
    const data = ensureBytes("signature", hex);
    const { v: seqBytes, l: seqLeftBytes } = tlv.decode(48, data);
    if (seqLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    const { v: rBytes, l: rLeftBytes } = tlv.decode(2, seqBytes);
    const { v: sBytes, l: sLeftBytes } = tlv.decode(2, rLeftBytes);
    if (sLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    return { r: int.decode(rBytes), s: int.decode(sBytes) };
  },
  hexFromSig(sig) {
    const { _tlv: tlv, _int: int } = DER;
    const rs = tlv.encode(2, int.encode(sig.r));
    const ss = tlv.encode(2, int.encode(sig.s));
    const seq = rs + ss;
    return tlv.encode(48, seq);
  }
};
var _0n4 = BigInt(0);
var _1n4 = BigInt(1);
var _2n2 = BigInt(2);
var _3n2 = BigInt(3);
var _4n2 = BigInt(4);
function weierstrassPoints(opts) {
  const CURVE = validatePointOpts(opts);
  const { Fp } = CURVE;
  const Fn = Field(CURVE.n, CURVE.nBitLength);
  const toBytes2 = CURVE.toBytes || ((_c, point, _isCompressed) => {
    const a = point.toAffine();
    return concatBytes2(Uint8Array.from([4]), Fp.toBytes(a.x), Fp.toBytes(a.y));
  });
  const fromBytes = CURVE.fromBytes || ((bytes) => {
    const tail2 = bytes.subarray(1);
    const x = Fp.fromBytes(tail2.subarray(0, Fp.BYTES));
    const y = Fp.fromBytes(tail2.subarray(Fp.BYTES, 2 * Fp.BYTES));
    return { x, y };
  });
  function weierstrassEquation(x) {
    const { a, b } = CURVE;
    const x2 = Fp.sqr(x);
    const x3 = Fp.mul(x2, x);
    return Fp.add(Fp.add(x3, Fp.mul(x, a)), b);
  }
  if (!Fp.eql(Fp.sqr(CURVE.Gy), weierstrassEquation(CURVE.Gx)))
    throw new Error("bad generator point: equation left != right");
  function isWithinCurveOrder(num) {
    return inRange(num, _1n4, CURVE.n);
  }
  function normPrivateKeyToScalar(key) {
    const { allowedPrivateKeyLengths: lengths, nByteLength, wrapPrivateKey, n: N } = CURVE;
    if (lengths && typeof key !== "bigint") {
      if (isBytes2(key))
        key = bytesToHex(key);
      if (typeof key !== "string" || !lengths.includes(key.length))
        throw new Error("invalid private key");
      key = key.padStart(nByteLength * 2, "0");
    }
    let num;
    try {
      num = typeof key === "bigint" ? key : bytesToNumberBE(ensureBytes("private key", key, nByteLength));
    } catch (error) {
      throw new Error("invalid private key, expected hex or " + nByteLength + " bytes, got " + typeof key);
    }
    if (wrapPrivateKey)
      num = mod(num, N);
    aInRange("private key", num, _1n4, N);
    return num;
  }
  function aprjpoint(other) {
    if (!(other instanceof Point2))
      throw new Error("ProjectivePoint expected");
  }
  const toAffineMemo = memoized((p, iz) => {
    const { px: x, py: y, pz: z } = p;
    if (Fp.eql(z, Fp.ONE))
      return { x, y };
    const is0 = p.is0();
    if (iz == null)
      iz = is0 ? Fp.ONE : Fp.inv(z);
    const ax = Fp.mul(x, iz);
    const ay = Fp.mul(y, iz);
    const zz = Fp.mul(z, iz);
    if (is0)
      return { x: Fp.ZERO, y: Fp.ZERO };
    if (!Fp.eql(zz, Fp.ONE))
      throw new Error("invZ was invalid");
    return { x: ax, y: ay };
  });
  const assertValidMemo = memoized((p) => {
    if (p.is0()) {
      if (CURVE.allowInfinityPoint && !Fp.is0(p.py))
        return;
      throw new Error("bad point: ZERO");
    }
    const { x, y } = p.toAffine();
    if (!Fp.isValid(x) || !Fp.isValid(y))
      throw new Error("bad point: x or y not FE");
    const left = Fp.sqr(y);
    const right = weierstrassEquation(x);
    if (!Fp.eql(left, right))
      throw new Error("bad point: equation left != right");
    if (!p.isTorsionFree())
      throw new Error("bad point: not in prime-order subgroup");
    return true;
  });
  class Point2 {
    constructor(px, py, pz) {
      if (px == null || !Fp.isValid(px))
        throw new Error("x required");
      if (py == null || !Fp.isValid(py) || Fp.is0(py))
        throw new Error("y required");
      if (pz == null || !Fp.isValid(pz))
        throw new Error("z required");
      this.px = px;
      this.py = py;
      this.pz = pz;
      Object.freeze(this);
    }
    // Does not validate if the point is on-curve.
    // Use fromHex instead, or call assertValidity() later.
    static fromAffine(p) {
      const { x, y } = p || {};
      if (!p || !Fp.isValid(x) || !Fp.isValid(y))
        throw new Error("invalid affine point");
      if (p instanceof Point2)
        throw new Error("projective point not allowed");
      const is0 = (i) => Fp.eql(i, Fp.ZERO);
      if (is0(x) && is0(y))
        return Point2.ZERO;
      return new Point2(x, y, Fp.ONE);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     * Takes a bunch of Projective Points but executes only one
     * inversion on all of them. Inversion is very slow operation,
     * so this improves performance massively.
     * Optimization: converts a list of projective points to a list of identical points with Z=1.
     */
    static normalizeZ(points) {
      const toInv = FpInvertBatch(Fp, points.map((p) => p.pz));
      return points.map((p, i) => p.toAffine(toInv[i])).map(Point2.fromAffine);
    }
    /**
     * Converts hash string or Uint8Array to Point.
     * @param hex short/long ECDSA hex
     */
    static fromHex(hex) {
      const P = Point2.fromAffine(fromBytes(ensureBytes("pointHex", hex)));
      P.assertValidity();
      return P;
    }
    // Multiplies generator point by privateKey.
    static fromPrivateKey(privateKey) {
      return Point2.BASE.multiply(normPrivateKeyToScalar(privateKey));
    }
    // Multiscalar Multiplication
    static msm(points, scalars) {
      return pippenger(Point2, Fn, points, scalars);
    }
    // "Private method", don't use it directly
    _setWindowSize(windowSize) {
      wnaf.setWindowSize(this, windowSize);
    }
    // A point on curve is valid if it conforms to equation.
    assertValidity() {
      assertValidMemo(this);
    }
    hasEvenY() {
      const { y } = this.toAffine();
      if (Fp.isOdd)
        return !Fp.isOdd(y);
      throw new Error("Field doesn't support isOdd");
    }
    /**
     * Compare one point to another.
     */
    equals(other) {
      aprjpoint(other);
      const { px: X1, py: Y1, pz: Z1 } = this;
      const { px: X2, py: Y2, pz: Z2 } = other;
      const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
      const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
      return U1 && U2;
    }
    /**
     * Flips point to one corresponding to (x, -y) in Affine coordinates.
     */
    negate() {
      return new Point2(this.px, Fp.neg(this.py), this.pz);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a, b } = CURVE;
      const b3 = Fp.mul(b, _3n2);
      const { px: X1, py: Y1, pz: Z1 } = this;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      let t0 = Fp.mul(X1, X1);
      let t1 = Fp.mul(Y1, Y1);
      let t2 = Fp.mul(Z1, Z1);
      let t3 = Fp.mul(X1, Y1);
      t3 = Fp.add(t3, t3);
      Z3 = Fp.mul(X1, Z1);
      Z3 = Fp.add(Z3, Z3);
      X3 = Fp.mul(a, Z3);
      Y3 = Fp.mul(b3, t2);
      Y3 = Fp.add(X3, Y3);
      X3 = Fp.sub(t1, Y3);
      Y3 = Fp.add(t1, Y3);
      Y3 = Fp.mul(X3, Y3);
      X3 = Fp.mul(t3, X3);
      Z3 = Fp.mul(b3, Z3);
      t2 = Fp.mul(a, t2);
      t3 = Fp.sub(t0, t2);
      t3 = Fp.mul(a, t3);
      t3 = Fp.add(t3, Z3);
      Z3 = Fp.add(t0, t0);
      t0 = Fp.add(Z3, t0);
      t0 = Fp.add(t0, t2);
      t0 = Fp.mul(t0, t3);
      Y3 = Fp.add(Y3, t0);
      t2 = Fp.mul(Y1, Z1);
      t2 = Fp.add(t2, t2);
      t0 = Fp.mul(t2, t3);
      X3 = Fp.sub(X3, t0);
      Z3 = Fp.mul(t2, t1);
      Z3 = Fp.add(Z3, Z3);
      Z3 = Fp.add(Z3, Z3);
      return new Point2(X3, Y3, Z3);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(other) {
      aprjpoint(other);
      const { px: X1, py: Y1, pz: Z1 } = this;
      const { px: X2, py: Y2, pz: Z2 } = other;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      const a = CURVE.a;
      const b3 = Fp.mul(CURVE.b, _3n2);
      let t0 = Fp.mul(X1, X2);
      let t1 = Fp.mul(Y1, Y2);
      let t2 = Fp.mul(Z1, Z2);
      let t3 = Fp.add(X1, Y1);
      let t4 = Fp.add(X2, Y2);
      t3 = Fp.mul(t3, t4);
      t4 = Fp.add(t0, t1);
      t3 = Fp.sub(t3, t4);
      t4 = Fp.add(X1, Z1);
      let t5 = Fp.add(X2, Z2);
      t4 = Fp.mul(t4, t5);
      t5 = Fp.add(t0, t2);
      t4 = Fp.sub(t4, t5);
      t5 = Fp.add(Y1, Z1);
      X3 = Fp.add(Y2, Z2);
      t5 = Fp.mul(t5, X3);
      X3 = Fp.add(t1, t2);
      t5 = Fp.sub(t5, X3);
      Z3 = Fp.mul(a, t4);
      X3 = Fp.mul(b3, t2);
      Z3 = Fp.add(X3, Z3);
      X3 = Fp.sub(t1, Z3);
      Z3 = Fp.add(t1, Z3);
      Y3 = Fp.mul(X3, Z3);
      t1 = Fp.add(t0, t0);
      t1 = Fp.add(t1, t0);
      t2 = Fp.mul(a, t2);
      t4 = Fp.mul(b3, t4);
      t1 = Fp.add(t1, t2);
      t2 = Fp.sub(t0, t2);
      t2 = Fp.mul(a, t2);
      t4 = Fp.add(t4, t2);
      t0 = Fp.mul(t1, t4);
      Y3 = Fp.add(Y3, t0);
      t0 = Fp.mul(t5, t4);
      X3 = Fp.mul(t3, X3);
      X3 = Fp.sub(X3, t0);
      t0 = Fp.mul(t3, t1);
      Z3 = Fp.mul(t5, Z3);
      Z3 = Fp.add(Z3, t0);
      return new Point2(X3, Y3, Z3);
    }
    subtract(other) {
      return this.add(other.negate());
    }
    is0() {
      return this.equals(Point2.ZERO);
    }
    wNAF(n) {
      return wnaf.wNAFCached(this, n, Point2.normalizeZ);
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed private key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(sc) {
      const { endo, n: N } = CURVE;
      aInRange("scalar", sc, _0n4, N);
      const I = Point2.ZERO;
      if (sc === _0n4)
        return I;
      if (this.is0() || sc === _1n4)
        return this;
      if (!endo || wnaf.hasPrecomputes(this))
        return wnaf.wNAFCachedUnsafe(this, sc, Point2.normalizeZ);
      let { k1neg, k1, k2neg, k2 } = endo.splitScalar(sc);
      let k1p = I;
      let k2p = I;
      let d = this;
      while (k1 > _0n4 || k2 > _0n4) {
        if (k1 & _1n4)
          k1p = k1p.add(d);
        if (k2 & _1n4)
          k2p = k2p.add(d);
        d = d.double();
        k1 >>= _1n4;
        k2 >>= _1n4;
      }
      if (k1neg)
        k1p = k1p.negate();
      if (k2neg)
        k2p = k2p.negate();
      k2p = new Point2(Fp.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
      return k1p.add(k2p);
    }
    /**
     * Constant time multiplication.
     * Uses wNAF method. Windowed method may be 10% faster,
     * but takes 2x longer to generate and consumes 2x memory.
     * Uses precomputes when available.
     * Uses endomorphism for Koblitz curves.
     * @param scalar by which the point would be multiplied
     * @returns New point
     */
    multiply(scalar) {
      const { endo, n: N } = CURVE;
      aInRange("scalar", scalar, _1n4, N);
      let point, fake;
      if (endo) {
        const { k1neg, k1, k2neg, k2 } = endo.splitScalar(scalar);
        let { p: k1p, f: f1p } = this.wNAF(k1);
        let { p: k2p, f: f2p } = this.wNAF(k2);
        k1p = wnaf.constTimeNegate(k1neg, k1p);
        k2p = wnaf.constTimeNegate(k2neg, k2p);
        k2p = new Point2(Fp.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
        point = k1p.add(k2p);
        fake = f1p.add(f2p);
      } else {
        const { p, f } = this.wNAF(scalar);
        point = p;
        fake = f;
      }
      return Point2.normalizeZ([point, fake])[0];
    }
    /**
     * Efficiently calculate `aP + bQ`. Unsafe, can expose private key, if used incorrectly.
     * Not using Strauss-Shamir trick: precomputation tables are faster.
     * The trick could be useful if both P and Q are not G (not in our case).
     * @returns non-zero affine point
     */
    multiplyAndAddUnsafe(Q, a, b) {
      const G = Point2.BASE;
      const mul = (P, a2) => a2 === _0n4 || a2 === _1n4 || !P.equals(G) ? P.multiplyUnsafe(a2) : P.multiply(a2);
      const sum = mul(this, a).add(mul(Q, b));
      return sum.is0() ? void 0 : sum;
    }
    // Converts Projective point to affine (x, y) coordinates.
    // Can accept precomputed Z^-1 - for example, from invertBatch.
    // (x, y, z) ∋ (x=x/z, y=y/z)
    toAffine(iz) {
      return toAffineMemo(this, iz);
    }
    isTorsionFree() {
      const { h: cofactor, isTorsionFree } = CURVE;
      if (cofactor === _1n4)
        return true;
      if (isTorsionFree)
        return isTorsionFree(Point2, this);
      throw new Error("isTorsionFree() has not been declared for the elliptic curve");
    }
    clearCofactor() {
      const { h: cofactor, clearCofactor } = CURVE;
      if (cofactor === _1n4)
        return this;
      if (clearCofactor)
        return clearCofactor(Point2, this);
      return this.multiplyUnsafe(CURVE.h);
    }
    toRawBytes(isCompressed = true) {
      abool("isCompressed", isCompressed);
      this.assertValidity();
      return toBytes2(Point2, this, isCompressed);
    }
    toHex(isCompressed = true) {
      abool("isCompressed", isCompressed);
      return bytesToHex(this.toRawBytes(isCompressed));
    }
  }
  Point2.BASE = new Point2(CURVE.Gx, CURVE.Gy, Fp.ONE);
  Point2.ZERO = new Point2(Fp.ZERO, Fp.ONE, Fp.ZERO);
  const _bits = CURVE.nBitLength;
  const wnaf = wNAF(Point2, CURVE.endo ? Math.ceil(_bits / 2) : _bits);
  return {
    CURVE,
    ProjectivePoint: Point2,
    normPrivateKeyToScalar,
    weierstrassEquation,
    isWithinCurveOrder
  };
}
function validateOpts(curve) {
  const opts = validateBasic(curve);
  validateObject(opts, {
    hash: "hash",
    hmac: "function",
    randomBytes: "function"
  }, {
    bits2int: "function",
    bits2int_modN: "function",
    lowS: "boolean"
  });
  return Object.freeze({ lowS: true, ...opts });
}
function weierstrass(curveDef) {
  const CURVE = validateOpts(curveDef);
  const { Fp, n: CURVE_ORDER } = CURVE;
  const compressedLen = Fp.BYTES + 1;
  const uncompressedLen = 2 * Fp.BYTES + 1;
  function modN(a) {
    return mod(a, CURVE_ORDER);
  }
  function invN(a) {
    return invert(a, CURVE_ORDER);
  }
  const { ProjectivePoint: Point2, normPrivateKeyToScalar, weierstrassEquation, isWithinCurveOrder } = weierstrassPoints({
    ...CURVE,
    toBytes(_c, point, isCompressed) {
      const a = point.toAffine();
      const x = Fp.toBytes(a.x);
      const cat = concatBytes2;
      abool("isCompressed", isCompressed);
      if (isCompressed) {
        return cat(Uint8Array.from([point.hasEvenY() ? 2 : 3]), x);
      } else {
        return cat(Uint8Array.from([4]), x, Fp.toBytes(a.y));
      }
    },
    fromBytes(bytes) {
      const len = bytes.length;
      const head = bytes[0];
      const tail2 = bytes.subarray(1);
      if (len === compressedLen && (head === 2 || head === 3)) {
        const x = bytesToNumberBE(tail2);
        if (!inRange(x, _1n4, Fp.ORDER))
          throw new Error("Point is not on curve");
        const y2 = weierstrassEquation(x);
        let y;
        try {
          y = Fp.sqrt(y2);
        } catch (sqrtError) {
          const suffix = sqrtError instanceof Error ? ": " + sqrtError.message : "";
          throw new Error("Point is not on curve" + suffix);
        }
        const isYOdd = (y & _1n4) === _1n4;
        const isHeadOdd = (head & 1) === 1;
        if (isHeadOdd !== isYOdd)
          y = Fp.neg(y);
        return { x, y };
      } else if (len === uncompressedLen && head === 4) {
        const x = Fp.fromBytes(tail2.subarray(0, Fp.BYTES));
        const y = Fp.fromBytes(tail2.subarray(Fp.BYTES, 2 * Fp.BYTES));
        return { x, y };
      } else {
        const cl = compressedLen;
        const ul = uncompressedLen;
        throw new Error("invalid Point, expected length of " + cl + ", or uncompressed " + ul + ", got " + len);
      }
    }
  });
  const numToNByteHex = (num) => bytesToHex(numberToBytesBE(num, CURVE.nByteLength));
  function isBiggerThanHalfOrder(number) {
    const HALF = CURVE_ORDER >> _1n4;
    return number > HALF;
  }
  function normalizeS(s) {
    return isBiggerThanHalfOrder(s) ? modN(-s) : s;
  }
  const slcNum = (b, from, to) => bytesToNumberBE(b.slice(from, to));
  class Signature {
    constructor(r, s, recovery) {
      aInRange("r", r, _1n4, CURVE_ORDER);
      aInRange("s", s, _1n4, CURVE_ORDER);
      this.r = r;
      this.s = s;
      if (recovery != null)
        this.recovery = recovery;
      Object.freeze(this);
    }
    // pair (bytes of r, bytes of s)
    static fromCompact(hex) {
      const l = CURVE.nByteLength;
      hex = ensureBytes("compactSignature", hex, l * 2);
      return new Signature(slcNum(hex, 0, l), slcNum(hex, l, 2 * l));
    }
    // DER encoded ECDSA signature
    // https://bitcoin.stackexchange.com/questions/57644/what-are-the-parts-of-a-bitcoin-transaction-input-script
    static fromDER(hex) {
      const { r, s } = DER.toSig(ensureBytes("DER", hex));
      return new Signature(r, s);
    }
    /**
     * @todo remove
     * @deprecated
     */
    assertValidity() {
    }
    addRecoveryBit(recovery) {
      return new Signature(this.r, this.s, recovery);
    }
    recoverPublicKey(msgHash) {
      const { r, s, recovery: rec } = this;
      const h = bits2int_modN(ensureBytes("msgHash", msgHash));
      if (rec == null || ![0, 1, 2, 3].includes(rec))
        throw new Error("recovery id invalid");
      const radj = rec === 2 || rec === 3 ? r + CURVE.n : r;
      if (radj >= Fp.ORDER)
        throw new Error("recovery id 2 or 3 invalid");
      const prefix = (rec & 1) === 0 ? "02" : "03";
      const R = Point2.fromHex(prefix + numToNByteHex(radj));
      const ir = invN(radj);
      const u1 = modN(-h * ir);
      const u2 = modN(s * ir);
      const Q = Point2.BASE.multiplyAndAddUnsafe(R, u1, u2);
      if (!Q)
        throw new Error("point at infinify");
      Q.assertValidity();
      return Q;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return isBiggerThanHalfOrder(this.s);
    }
    normalizeS() {
      return this.hasHighS() ? new Signature(this.r, modN(-this.s), this.recovery) : this;
    }
    // DER-encoded
    toDERRawBytes() {
      return hexToBytes(this.toDERHex());
    }
    toDERHex() {
      return DER.hexFromSig(this);
    }
    // padded bytes of r, then padded bytes of s
    toCompactRawBytes() {
      return hexToBytes(this.toCompactHex());
    }
    toCompactHex() {
      return numToNByteHex(this.r) + numToNByteHex(this.s);
    }
  }
  const utils = {
    isValidPrivateKey(privateKey) {
      try {
        normPrivateKeyToScalar(privateKey);
        return true;
      } catch (error) {
        return false;
      }
    },
    normPrivateKeyToScalar,
    /**
     * Produces cryptographically secure private key from random of size
     * (groupLen + ceil(groupLen / 2)) with modulo bias being negligible.
     */
    randomPrivateKey: () => {
      const length = getMinHashLength(CURVE.n);
      return mapHashToField(CURVE.randomBytes(length), CURVE.n);
    },
    /**
     * Creates precompute table for an arbitrary EC point. Makes point "cached".
     * Allows to massively speed-up `point.multiply(scalar)`.
     * @returns cached point
     * @example
     * const fast = utils.precompute(8, ProjectivePoint.fromHex(someonesPubKey));
     * fast.multiply(privKey); // much faster ECDH now
     */
    precompute(windowSize = 8, point = Point2.BASE) {
      point._setWindowSize(windowSize);
      point.multiply(BigInt(3));
      return point;
    }
  };
  function getPublicKey(privateKey, isCompressed = true) {
    return Point2.fromPrivateKey(privateKey).toRawBytes(isCompressed);
  }
  function isProbPub(item) {
    const arr = isBytes2(item);
    const str = typeof item === "string";
    const len = (arr || str) && item.length;
    if (arr)
      return len === compressedLen || len === uncompressedLen;
    if (str)
      return len === 2 * compressedLen || len === 2 * uncompressedLen;
    if (item instanceof Point2)
      return true;
    return false;
  }
  function getSharedSecret(privateA, publicB, isCompressed = true) {
    if (isProbPub(privateA))
      throw new Error("first arg must be private key");
    if (!isProbPub(publicB))
      throw new Error("second arg must be public key");
    const b = Point2.fromHex(publicB);
    return b.multiply(normPrivateKeyToScalar(privateA)).toRawBytes(isCompressed);
  }
  const bits2int = CURVE.bits2int || function(bytes) {
    if (bytes.length > 8192)
      throw new Error("input is too large");
    const num = bytesToNumberBE(bytes);
    const delta = bytes.length * 8 - CURVE.nBitLength;
    return delta > 0 ? num >> BigInt(delta) : num;
  };
  const bits2int_modN = CURVE.bits2int_modN || function(bytes) {
    return modN(bits2int(bytes));
  };
  const ORDER_MASK = bitMask(CURVE.nBitLength);
  function int2octets(num) {
    aInRange("num < 2^" + CURVE.nBitLength, num, _0n4, ORDER_MASK);
    return numberToBytesBE(num, CURVE.nByteLength);
  }
  function prepSig(msgHash, privateKey, opts = defaultSigOpts) {
    if (["recovered", "canonical"].some((k) => k in opts))
      throw new Error("sign() legacy options not supported");
    const { hash: hash2, randomBytes: randomBytes2 } = CURVE;
    let { lowS, prehash, extraEntropy: ent } = opts;
    if (lowS == null)
      lowS = true;
    msgHash = ensureBytes("msgHash", msgHash);
    validateSigVerOpts(opts);
    if (prehash)
      msgHash = ensureBytes("prehashed msgHash", hash2(msgHash));
    const h1int = bits2int_modN(msgHash);
    const d = normPrivateKeyToScalar(privateKey);
    const seedArgs = [int2octets(d), int2octets(h1int)];
    if (ent != null && ent !== false) {
      const e = ent === true ? randomBytes2(Fp.BYTES) : ent;
      seedArgs.push(ensureBytes("extraEntropy", e));
    }
    const seed = concatBytes2(...seedArgs);
    const m = h1int;
    function k2sig(kBytes) {
      const k = bits2int(kBytes);
      if (!isWithinCurveOrder(k))
        return;
      const ik = invN(k);
      const q = Point2.BASE.multiply(k).toAffine();
      const r = modN(q.x);
      if (r === _0n4)
        return;
      const s = modN(ik * modN(m + r * d));
      if (s === _0n4)
        return;
      let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n4);
      let normS = s;
      if (lowS && isBiggerThanHalfOrder(s)) {
        normS = normalizeS(s);
        recovery ^= 1;
      }
      return new Signature(r, normS, recovery);
    }
    return { seed, k2sig };
  }
  const defaultSigOpts = { lowS: CURVE.lowS, prehash: false };
  const defaultVerOpts = { lowS: CURVE.lowS, prehash: false };
  function sign(msgHash, privKey, opts = defaultSigOpts) {
    const { seed, k2sig } = prepSig(msgHash, privKey, opts);
    const C = CURVE;
    const drbg = createHmacDrbg(C.hash.outputLen, C.nByteLength, C.hmac);
    return drbg(seed, k2sig);
  }
  Point2.BASE._setWindowSize(8);
  function verify(signature, msgHash, publicKey, opts = defaultVerOpts) {
    const sg = signature;
    msgHash = ensureBytes("msgHash", msgHash);
    publicKey = ensureBytes("publicKey", publicKey);
    const { lowS, prehash, format } = opts;
    validateSigVerOpts(opts);
    if ("strict" in opts)
      throw new Error("options.strict was renamed to lowS");
    if (format !== void 0 && format !== "compact" && format !== "der")
      throw new Error("format must be compact or der");
    const isHex = typeof sg === "string" || isBytes2(sg);
    const isObj = !isHex && !format && typeof sg === "object" && sg !== null && typeof sg.r === "bigint" && typeof sg.s === "bigint";
    if (!isHex && !isObj)
      throw new Error("invalid signature, expected Uint8Array, hex string or Signature instance");
    let _sig = void 0;
    let P;
    try {
      if (isObj)
        _sig = new Signature(sg.r, sg.s);
      if (isHex) {
        try {
          if (format !== "compact")
            _sig = Signature.fromDER(sg);
        } catch (derError) {
          if (!(derError instanceof DER.Err))
            throw derError;
        }
        if (!_sig && format !== "der")
          _sig = Signature.fromCompact(sg);
      }
      P = Point2.fromHex(publicKey);
    } catch (error) {
      return false;
    }
    if (!_sig)
      return false;
    if (lowS && _sig.hasHighS())
      return false;
    if (prehash)
      msgHash = CURVE.hash(msgHash);
    const { r, s } = _sig;
    const h = bits2int_modN(msgHash);
    const is = invN(s);
    const u1 = modN(h * is);
    const u2 = modN(r * is);
    const R = Point2.BASE.multiplyAndAddUnsafe(P, u1, u2)?.toAffine();
    if (!R)
      return false;
    const v = modN(R.x);
    return v === r;
  }
  return {
    CURVE,
    getPublicKey,
    getSharedSecret,
    sign,
    verify,
    ProjectivePoint: Point2,
    Signature,
    utils
  };
}
function getHash(hash2) {
  return {
    hash: hash2,
    hmac: (key, ...msgs) => hmac(hash2, key, concatBytes(...msgs)),
    randomBytes
  };
}
function createCurve(curveDef, defHash) {
  const create = (hash2) => weierstrass({ ...curveDef, ...getHash(hash2) });
  return { ...create(defHash), create };
}
var secp256k1P = BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f");
var secp256k1N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
var _1n5 = BigInt(1);
var _2n3 = BigInt(2);
var divNearest = (a, b) => (a + b / _2n3) / b;
function sqrtMod(y) {
  const P = secp256k1P;
  const _3n3 = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
  const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
  const b2 = y * y * y % P;
  const b3 = b2 * b2 * y % P;
  const b6 = pow2(b3, _3n3, P) * b3 % P;
  const b9 = pow2(b6, _3n3, P) * b3 % P;
  const b11 = pow2(b9, _2n3, P) * b2 % P;
  const b22 = pow2(b11, _11n, P) * b11 % P;
  const b44 = pow2(b22, _22n, P) * b22 % P;
  const b88 = pow2(b44, _44n, P) * b44 % P;
  const b176 = pow2(b88, _88n, P) * b88 % P;
  const b220 = pow2(b176, _44n, P) * b44 % P;
  const b223 = pow2(b220, _3n3, P) * b3 % P;
  const t1 = pow2(b223, _23n, P) * b22 % P;
  const t2 = pow2(t1, _6n, P) * b2 % P;
  const root = pow2(t2, _2n3, P);
  if (!Fpk1.eql(Fpk1.sqr(root), y))
    throw new Error("Cannot find square root");
  return root;
}
var Fpk1 = Field(secp256k1P, void 0, void 0, { sqrt: sqrtMod });
var secp256k1 = createCurve({
  a: BigInt(0),
  b: BigInt(7),
  Fp: Fpk1,
  n: secp256k1N,
  Gx: BigInt("55066263022277343669578718895168534326250603453777594175500187360389116729240"),
  Gy: BigInt("32670510020758816978083085130507043184471273380659243275938904335757337482424"),
  h: BigInt(1),
  lowS: true,
  // Allow only low-S signatures by default in sign() and verify()
  endo: {
    // Endomorphism, see above
    beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
    splitScalar: (k) => {
      const n = secp256k1N;
      const a1 = BigInt("0x3086d221a7d46bcde86c90e49284eb15");
      const b1 = -_1n5 * BigInt("0xe4437ed6010e88286f547fa90abfe4c3");
      const a2 = BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8");
      const b2 = a1;
      const POW_2_128 = BigInt("0x100000000000000000000000000000000");
      const c1 = divNearest(b2 * k, n);
      const c2 = divNearest(-b1 * k, n);
      let k1 = mod(k - c1 * a1 - c2 * a2, n);
      let k2 = mod(-c1 * b1 - c2 * b2, n);
      const k1neg = k1 > POW_2_128;
      const k2neg = k2 > POW_2_128;
      if (k1neg)
        k1 = n - k1;
      if (k2neg)
        k2 = n - k2;
      if (k1 > POW_2_128 || k2 > POW_2_128) {
        throw new Error("splitScalar: Endomorphism failed, k=" + k);
      }
      return { k1neg, k1, k2neg, k2 };
    }
  }
}, sha256);
var _0n5 = BigInt(0);
var Point = secp256k1.ProjectivePoint;
var _0n6 = BigInt(0);
var _1n6 = BigInt(1);
var _2n4 = BigInt(2);
var _7n = BigInt(7);
var _256n = BigInt(256);
var _0x71n = BigInt(113);
var SHA3_PI = [];
var SHA3_ROTL = [];
var _SHA3_IOTA = [];
for (let round = 0, R = _1n6, x = 1, y = 0; round < 24; round++) {
  [x, y] = [y, (2 * x + 3 * y) % 5];
  SHA3_PI.push(2 * (5 * y + x));
  SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
  let t = _0n6;
  for (let j = 0; j < 7; j++) {
    R = (R << _1n6 ^ (R >> _7n) * _0x71n) % _256n;
    if (R & _2n4)
      t ^= _1n6 << (_1n6 << /* @__PURE__ */ BigInt(j)) - _1n6;
  }
  _SHA3_IOTA.push(t);
}
var IOTAS = split(_SHA3_IOTA, true);
var SHA3_IOTA_H = IOTAS[0];
var SHA3_IOTA_L = IOTAS[1];
var rotlH = (h, l, s) => s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s);
var rotlL = (h, l, s) => s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s);
function keccakP(s, rounds = 24) {
  const B = new Uint32Array(5 * 2);
  for (let round = 24 - rounds; round < 24; round++) {
    for (let x = 0; x < 10; x++)
      B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
    for (let x = 0; x < 10; x += 2) {
      const idx1 = (x + 8) % 10;
      const idx0 = (x + 2) % 10;
      const B0 = B[idx0];
      const B1 = B[idx0 + 1];
      const Th = rotlH(B0, B1, 1) ^ B[idx1];
      const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
      for (let y = 0; y < 50; y += 10) {
        s[x + y] ^= Th;
        s[x + y + 1] ^= Tl;
      }
    }
    let curH = s[2];
    let curL = s[3];
    for (let t = 0; t < 24; t++) {
      const shift = SHA3_ROTL[t];
      const Th = rotlH(curH, curL, shift);
      const Tl = rotlL(curH, curL, shift);
      const PI = SHA3_PI[t];
      curH = s[PI];
      curL = s[PI + 1];
      s[PI] = Th;
      s[PI + 1] = Tl;
    }
    for (let y = 0; y < 50; y += 10) {
      for (let x = 0; x < 10; x++)
        B[x] = s[y + x];
      for (let x = 0; x < 10; x++)
        s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
    }
    s[0] ^= SHA3_IOTA_H[round];
    s[1] ^= SHA3_IOTA_L[round];
  }
  clean(B);
}
var Keccak = class _Keccak extends Hash {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
    super();
    this.pos = 0;
    this.posOut = 0;
    this.finished = false;
    this.destroyed = false;
    this.enableXOF = false;
    this.blockLen = blockLen;
    this.suffix = suffix;
    this.outputLen = outputLen;
    this.enableXOF = enableXOF;
    this.rounds = rounds;
    anumber(outputLen);
    if (!(0 < blockLen && blockLen < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200);
    this.state32 = u32(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    swap32IfBE(this.state32);
    keccakP(this.state32, this.rounds);
    swap32IfBE(this.state32);
    this.posOut = 0;
    this.pos = 0;
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { blockLen, state } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      for (let i = 0; i < take; i++)
        state[this.pos++] ^= data[pos++];
      if (this.pos === blockLen)
        this.keccak();
    }
    return this;
  }
  finish() {
    if (this.finished)
      return;
    this.finished = true;
    const { state, suffix, pos, blockLen } = this;
    state[pos] ^= suffix;
    if ((suffix & 128) !== 0 && pos === blockLen - 1)
      this.keccak();
    state[blockLen - 1] ^= 128;
    this.keccak();
  }
  writeInto(out) {
    aexists(this, false);
    abytes(out);
    this.finish();
    const bufferOut = this.state;
    const { blockLen } = this;
    for (let pos = 0, len = out.length; pos < len; ) {
      if (this.posOut >= blockLen)
        this.keccak();
      const take = Math.min(blockLen - this.posOut, len - pos);
      out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
      this.posOut += take;
      pos += take;
    }
    return out;
  }
  xofInto(out) {
    if (!this.enableXOF)
      throw new Error("XOF is not possible for this instance");
    return this.writeInto(out);
  }
  xof(bytes) {
    anumber(bytes);
    return this.xofInto(new Uint8Array(bytes));
  }
  digestInto(out) {
    aoutput(out, this);
    if (this.finished)
      throw new Error("digest() was already called");
    this.writeInto(out);
    this.destroy();
    return out;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = true;
    clean(this.state);
  }
  _cloneInto(to) {
    const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
    to || (to = new _Keccak(blockLen, suffix, outputLen, enableXOF, rounds));
    to.state32.set(this.state32);
    to.pos = this.pos;
    to.posOut = this.posOut;
    to.finished = this.finished;
    to.rounds = rounds;
    to.suffix = suffix;
    to.outputLen = outputLen;
    to.enableXOF = enableXOF;
    to.destroyed = this.destroyed;
    return to;
  }
};
var gen = (suffix, blockLen, outputLen) => createHasher(() => new Keccak(blockLen, suffix, outputLen));
var keccak_256 = /* @__PURE__ */ (() => gen(1, 136, 256 / 8))();
var USDC2 = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
var BRIDGE = "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7";
var BUILDER = "0xa02a1872ebbf3a5d2f0d8b236ef16f0fe62b16d0";
var CHAIN = 42161n;
var utf8 = (s) => new TextEncoder().encode(s);
var hexToBytes2 = (hex) => {
  const h = hex.replace(/^0x/, "");
  if (h.length % 2) throw new Error("hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
};
var bytesToHex2 = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
var concat = (parts) => {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
var word = (n) => hexToBytes2(BigInt(n).toString(16).padStart(64, "0"));
var addrWord = (a) => hexToBytes2(a.toLowerCase().replace(/^0x/, "").padStart(64, "0"));
function rlpBytes(len, offset, body) {
  if (body.length < 56) return concat([Uint8Array.of(offset + body.length), body]);
  const l = hexToBytes2(BigInt(body.length).toString(16));
  return concat([Uint8Array.of(offset + 55 + l.length), l, body]);
}
function rlp(item) {
  if (Array.isArray(item)) return rlpBytes(item.length, 192, concat(item.map(rlp)));
  const bytes = item instanceof Uint8Array ? item : item === 0n ? new Uint8Array() : hexToBytes2(BigInt(item).toString(16));
  if (bytes.length === 1 && bytes[0] < 128) return bytes;
  return rlpBytes(bytes.length, 128, bytes);
}
var hash = (bytes) => keccak_256(bytes);
var SELECTOR = bytesToHex2(hash(utf8("batchedDepositWithPermit((address,uint64,uint64,(uint256,uint256,uint8))[])")).slice(0, 4));
if (SELECTOR !== "b30b5bce") throw new Error("selector");
var DOMAIN = hash(concat([
  hash(utf8("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
  hash(utf8("USD Coin")),
  hash(utf8("2")),
  word(CHAIN),
  addrWord(USDC2)
]));
var PERMIT = hash(utf8("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"));
var TRANSFER_TOPIC = "0x" + bytesToHex2(hash(utf8("Transfer(address,address,uint256)")));
var FAIL_TOPIC = "0x" + bytesToHex2(hash(utf8("FailedPermitDeposit(address,uint64,uint32)")));
function domainSeparator() {
  return "0x" + bytesToHex2(DOMAIN);
}
function permitDigest({ owner, value, nonce, deadline }) {
  const struct = hash(concat([
    PERMIT,
    addrWord(owner),
    addrWord(BRIDGE),
    word(value),
    word(nonce),
    word(deadline)
  ]));
  return hash(concat([Uint8Array.of(25, 1), DOMAIN, struct]));
}
function addressFromKey(priv) {
  const pub = secp256k1.getPublicKey(priv, false);
  return "0x" + bytesToHex2(hash(pub.slice(1)).slice(-20));
}
function recoverAddress(digest, sigHex) {
  const raw = hexToBytes2(sigHex);
  if (raw.length !== 65) throw new Error("\u041F\u043E\u0434\u043F\u0438\u0441\u044C \u043A\u043E\u0440\u043E\u0442\u043A\u0430\u044F");
  let v = raw[64];
  if (v === 0 || v === 1) v += 27;
  if (v !== 27 && v !== 28) throw new Error("\u041F\u043E\u0434\u043F\u0438\u0441\u044C \u043D\u0435 \u0442\u0430");
  const compact = secp256k1.Signature.fromCompact(raw.slice(0, 64));
  if (compact.hasHighS() || compact.r === 0n || compact.s === 0n) throw new Error("\u041F\u043E\u0434\u043F\u0438\u0441\u044C \u043D\u0435 \u0442\u0430");
  const pub = compact.addRecoveryBit(v - 27).recoverPublicKey(digest);
  return { address: "0x" + bytesToHex2(hash(pub.toRawBytes(false).slice(1)).slice(-20)), r: compact.r, s: compact.s, v };
}
function encodeDeposit({ user, usd, deadline, r, s, v }) {
  const body = concat([
    hexToBytes2(SELECTOR),
    word(32),
    word(1),
    addrWord(user),
    word(usd),
    word(deadline),
    word(r),
    word(s),
    word(v)
  ]);
  return "0x" + bytesToHex2(body);
}
function signArbTx({ priv, nonce, maxPriority, maxFee, gasLimit, to, data }) {
  const unsigned = [CHAIN, BigInt(nonce), BigInt(maxPriority), BigInt(maxFee), BigInt(gasLimit), hexToBytes2(to), 0n, hexToBytes2(data), []];
  const digest = hash(concat([Uint8Array.of(2), rlp(unsigned)]));
  const sig = secp256k1.sign(digest, priv);
  const raw = concat([Uint8Array.of(2), rlp([...unsigned, BigInt(sig.recovery), sig.r, sig.s])]);
  return "0x" + bytesToHex2(raw);
}
function typedData({ owner, value, nonce, deadline }) {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" }
      ],
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    },
    primaryType: "Permit",
    domain: { name: "USD Coin", version: "2", chainId: 42161, verifyingContract: USDC2 },
    message: {
      owner,
      spender: BRIDGE,
      value: BigInt(value).toString(),
      nonce: BigInt(nonce).toString(),
      deadline: BigInt(deadline).toString()
    }
  };
}

// ../fiatclaw/lib/fund-credit.mjs
var MIN2 = 5000000n;
var MAX2 = 500000n * 1000000n;
var RPCS = ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one.publicnode.com"];
var hits = /* @__PURE__ */ new Map();
var tail = Promise.resolve();
var domainOk = false;
function fail(status, error) {
  const e = new Error(error);
  e.status = status;
  return e;
}
function hexToBytes3(hex) {
  const h = hex.replace(/^0x/, "");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function relayer() {
  const raw = String(process.env.GAS_RELAYER_KEY || "").trim().replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw fail(503, "\u0417\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435 \u0435\u0449\u0451 \u043D\u0435 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E.");
  const priv = hexToBytes3(raw);
  const address = addressFromKey(priv);
  if (address === BUILDER) throw fail(503, "\u0413\u0430\u0437\u043E\u0432\u044B\u0439 \u0430\u0434\u0440\u0435\u0441 \u0441\u043E\u0432\u043F\u0430\u043B \u0441 \u0430\u0434\u0440\u0435\u0441\u043E\u043C \u043A\u043E\u043C\u0438\u0441\u0441\u0438\u0438. \u0422\u0430\u043A \u043D\u0435\u043B\u044C\u0437\u044F.");
  return { priv, address };
}
async function rpc(method, params) {
  let last = "\u0441\u0435\u0442\u044C \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B\u0430";
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(8e3),
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
      });
      const j = await r.json();
      if (j.result !== void 0) return j.result;
      last = j.error?.message || last;
    } catch {
    }
  }
  throw fail(502, last);
}
var call = (data, to = USDC2) => rpc("eth_call", [{ to, data }, "latest"]);
async function assertDomain() {
  if (domainOk) return;
  const got = String(await call("0x3644e515")).toLowerCase();
  if (got !== domainSeparator()) throw fail(503, "\u0421\u0435\u0442\u044C USDC \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B\u0430. \u0417\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E, \u0434\u0435\u043D\u044C\u0433\u0438 \u043D\u0430 \u043C\u0435\u0441\u0442\u0435.");
  domainOk = true;
}
async function gasOk(address) {
  const wei = BigInt(await rpc("eth_getBalance", [address, "latest"]));
  if (wei < 300000000000000n) {
    throw fail(503, `\u041D\u0430 \u0433\u0430\u0437\u043E\u0432\u043E\u043C \u0430\u0434\u0440\u0435\u0441\u0435 ${address} \u043D\u0435\u0442 ETH \u0432 \u0441\u0435\u0442\u0438 Arbitrum. \u0412\u0430\u0448\u0438 USDC \u043D\u0430 \u043C\u0435\u0441\u0442\u0435.`);
  }
}
function clamp(amount, balance) {
  let want = balance;
  if (amount != null && amount !== "") {
    if (!/^\d{1,18}$/.test(String(amount))) throw fail(400, "\u0421\u0443\u043C\u043C\u0430 \u043D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B\u0430\u0441\u044C");
    want = BigInt(amount);
    if (want > balance) want = balance;
  }
  if (want < MIN2) throw fail(422, "\u041C\u0435\u043D\u044C\u0448\u0435 5 USDC \u0431\u0438\u0440\u0436\u0430 \u043D\u0435 \u0437\u0430\u0447\u0438\u0441\u043B\u0438\u0442. \u041D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u043C.");
  if (want > MAX2) want = MAX2;
  return want;
}
async function prepare({ address, amount }) {
  const owner = String(address || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(owner)) throw fail(400, "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043A\u043E\u0448\u0435\u043B\u0451\u043A, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u043E\u043C \u0442\u043E\u0440\u0433\u0443\u0435\u0442\u0435");
  const gas = relayer();
  if (gas.address === owner) throw fail(503, "\u0413\u0430\u0437\u043E\u0432\u044B\u0439 \u0430\u0434\u0440\u0435\u0441 \u0441\u043E\u0432\u043F\u0430\u043B \u0441 \u0432\u0430\u0448\u0438\u043C. \u0422\u0430\u043A \u043D\u0435\u043B\u044C\u0437\u044F.");
  await assertDomain();
  await gasOk(gas.address);
  const [bal, nonce] = await Promise.all([
    call("0x70a08231" + owner.slice(2).padStart(64, "0")),
    call("0x7ecebe00" + owner.slice(2).padStart(64, "0"))
  ]);
  const balance = BigInt(bal);
  const usd = clamp(amount, balance);
  const deadline = BigInt(Math.floor(Date.now() / 1e3) + 600);
  const nonceN = BigInt(nonce);
  return {
    ok: true,
    usd: usd.toString(),
    deadline: deadline.toString(),
    nonce: nonceN.toString(),
    typed: typedData({ owner, value: usd, nonce: nonceN, deadline })
  };
}
function limited(key, max, windowMs) {
  const now = Date.now();
  const row = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (row.length >= max) return true;
  row.push(now);
  hits.set(key, row);
  return false;
}
function enqueue(fn) {
  const run2 = tail.then(fn, fn);
  tail = run2.then(() => {
  }, () => {
  });
  return run2;
}
function topicAddr(topic) {
  return "0x" + String(topic || "").toLowerCase().slice(-40);
}
async function submit({ address, usd, deadline, nonce, sig, ip }) {
  const owner = String(address || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(owner)) throw fail(400, "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043A\u043E\u0448\u0435\u043B\u0451\u043A");
  if (!/^\d{1,18}$/.test(String(usd)) || !/^\d{1,12}$/.test(String(deadline)) || !/^\d{1,40}$/.test(String(nonce))) {
    throw fail(400, "\u041F\u043E\u0434\u043F\u0438\u0441\u044C \u043D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B\u0430\u0441\u044C");
  }
  if (!/^0x[0-9a-fA-F]{130}$/.test(String(sig || "")) && !/^[0-9a-fA-F]{130}$/.test(String(sig || ""))) throw fail(400, "\u041F\u043E\u0434\u043F\u0438\u0441\u044C \u043D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B\u0430\u0441\u044C");
  const signature = String(sig).startsWith("0x") ? String(sig) : "0x" + sig;
  if (limited("a:" + owner, 8, 10 * 60 * 1e3) || limited("i:" + (ip || "x"), 30, 60 * 60 * 1e3)) {
    throw fail(429, "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0447\u0430\u0441\u0442\u043E. \u041F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435 \u043F\u0430\u0440\u0443 \u043C\u0438\u043D\u0443\u0442.");
  }
  const value = BigInt(usd);
  const until = BigInt(deadline);
  const nonceN = BigInt(nonce);
  const now = BigInt(Math.floor(Date.now() / 1e3));
  if (value < MIN2 || value > MAX2) throw fail(422, "\u0421\u0443\u043C\u043C\u0430 \u0432\u043D\u0435 \u0433\u0440\u0430\u043D\u0438\u0446 \u0437\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F");
  if (until < now - 30n || until > now + 900n) throw fail(422, "\u041F\u043E\u0434\u043F\u0438\u0441\u044C \u0443\u0441\u0442\u0430\u0440\u0435\u043B\u0430. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.");
  const gas = relayer();
  if (gas.address === owner) throw fail(503, "\u0413\u0430\u0437\u043E\u0432\u044B\u0439 \u0430\u0434\u0440\u0435\u0441 \u0441\u043E\u0432\u043F\u0430\u043B \u0441 \u0432\u0430\u0448\u0438\u043C. \u0422\u0430\u043A \u043D\u0435\u043B\u044C\u0437\u044F.");
  let rec;
  try {
    rec = recoverAddress(permitDigest({ owner, value, nonce: nonceN, deadline: until }), signature);
  } catch (e) {
    throw fail(400, e.message || "\u041F\u043E\u0434\u043F\u0438\u0441\u044C \u043D\u0435 \u0442\u0430");
  }
  if (rec.address !== owner) throw fail(400, "\u041F\u043E\u0434\u043F\u0438\u0441\u044C \u043E\u0442 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u043A\u043E\u0448\u0435\u043B\u044C\u043A\u0430. \u0414\u0435\u043D\u044C\u0433\u0438 \u043D\u0435 \u0443\u0445\u043E\u0434\u0438\u043B\u0438.");
  await assertDomain();
  const [bal, liveNonce] = await Promise.all([
    call("0x70a08231" + owner.slice(2).padStart(64, "0")),
    call("0x7ecebe00" + owner.slice(2).padStart(64, "0"))
  ]);
  if (BigInt(liveNonce) !== nonceN) throw fail(409, "\u041A\u043E\u0448\u0435\u043B\u0451\u043A \u0443\u0436\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043B \u0447\u0442\u043E-\u0442\u043E \u0435\u0449\u0451. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u0437\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.");
  if (BigInt(bal) < value) throw fail(422, "\u041D\u0430 \u043A\u043E\u0448\u0435\u043B\u044C\u043A\u0435 \u043C\u0435\u043D\u044C\u0448\u0435 USDC, \u0447\u0435\u043C \u0432 \u043F\u043E\u0434\u043F\u0438\u0441\u0438. \u041D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u043C.");
  await gasOk(gas.address);
  const data = encodeDeposit({ user: owner, usd: value, deadline: until, r: rec.r, s: rec.s, v: rec.v });
  if (!data.startsWith("0xb30b5bce") || !data.toLowerCase().includes(owner.slice(2))) {
    throw fail(500, "\u0421\u0431\u043E\u0440\u043A\u0430 \u0437\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u0441\u043B\u043E\u043C\u0430\u043B\u0430\u0441\u044C. \u0414\u0435\u043D\u044C\u0433\u0438 \u043D\u0435 \u0443\u0445\u043E\u0434\u0438\u043B\u0438.");
  }
  try {
    await rpc("eth_call", [{ from: gas.address, to: BRIDGE, data }, "latest"]);
  } catch {
    throw fail(502, "\u0411\u0438\u0440\u0436\u0430 \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435 \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u0435\u0442 \u0437\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435. \u0414\u0435\u043D\u044C\u0433\u0438 \u043D\u0430 \u043C\u0435\u0441\u0442\u0435.");
  }
  return enqueue(async () => {
    const price = BigInt(await rpc("eth_gasPrice", []));
    let maxFee = price * 3n;
    if (maxFee < 50000000n) maxFee = 50000000n;
    if (maxFee > 5000000000n) throw fail(503, "\u0421\u0435\u0442\u044C Arbitrum \u0441\u0435\u0439\u0447\u0430\u0441 \u0434\u043E\u0440\u043E\u0433\u0430\u044F. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 \u043C\u0438\u043D\u0443\u0442\u0443. \u0414\u0435\u043D\u044C\u0433\u0438 \u043D\u0430 \u043C\u0435\u0441\u0442\u0435.");
    const nonceTx = BigInt(await rpc("eth_getTransactionCount", [gas.address, "pending"]));
    const raw = signArbTx({
      priv: gas.priv,
      nonce: nonceTx,
      maxPriority: 20000000n,
      maxFee,
      gasLimit: 200000n,
      to: BRIDGE,
      data
    });
    const hash2 = await rpc("eth_sendRawTransaction", [raw]);
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(hash2))) throw fail(502, "\u0421\u0435\u0442\u044C \u043D\u0435 \u0432\u0437\u044F\u043B\u0430 \u0437\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435. \u0414\u0435\u043D\u044C\u0433\u0438 \u043D\u0430 \u043C\u0435\u0441\u0442\u0435.");
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 1e3));
      const receipt = await rpc("eth_getTransactionReceipt", [hash2]);
      if (!receipt) continue;
      if (receipt.status !== "0x1") throw fail(502, "\u0417\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435 \u043D\u0435 \u043F\u0440\u043E\u0448\u043B\u043E. USDC \u043E\u0441\u0442\u0430\u043B\u0438\u0441\u044C \u043D\u0430 \u043A\u043E\u0448\u0435\u043B\u044C\u043A\u0435.");
      const logs = receipt.logs || [];
      const failed = logs.some((l) => String(l.address || "").toLowerCase() === BRIDGE && String(l.topics?.[0] || "").toLowerCase() === FAIL_TOPIC);
      const moved = logs.some((l) => {
        if (String(l.address || "").toLowerCase() !== USDC2) return false;
        if (String(l.topics?.[0] || "").toLowerCase() !== TRANSFER_TOPIC) return false;
        return topicAddr(l.topics[1]) === owner && topicAddr(l.topics[2]) === BRIDGE && BigInt(l.data) === value;
      });
      if (failed || !moved) throw fail(502, "\u0411\u0438\u0440\u0436\u0430 \u043D\u0435 \u0437\u0430\u0447\u0438\u0441\u043B\u0438\u043B\u0430. USDC \u043E\u0441\u0442\u0430\u043B\u0438\u0441\u044C \u043D\u0430 \u043A\u043E\u0448\u0435\u043B\u044C\u043A\u0435.");
      return { ok: true, hash: hash2 };
    }
    return { ok: true, hash: hash2, pending: true };
  });
}

// ../fiatclaw/lib/entry-fund.mjs
function read(req) {
  let b = req.body;
  if (!b || typeof b !== "object") {
    try {
      b = JSON.parse(req.body || "{}");
    } catch {
      b = {};
    }
  }
  req.body = b || {};
  return req.body;
}
function say(res, status, payload) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.status(status).send(JSON.stringify(payload));
}
function human(msg) {
  const m = String(msg || "").replace(/\s+/g, " ").slice(0, 220);
  if (/insufficient funds/i.test(m)) return "\u041D\u0430 \u0433\u0430\u0437\u043E\u0432\u043E\u043C \u0430\u0434\u0440\u0435\u0441\u0435 \u043A\u043E\u043D\u0447\u0438\u043B\u0441\u044F ETH. \u0412\u0430\u0448\u0438 USDC \u043D\u0430 \u043C\u0435\u0441\u0442\u0435.";
  if (/nonce too low|replacement transaction|already known/i.test(m)) return "\u0417\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435 \u0443\u0436\u0435 \u0443\u0445\u043E\u0434\u0438\u0442. \u041F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435 \u043C\u0438\u043D\u0443\u0442\u0443 \u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437, \u0435\u0441\u043B\u0438 \u0441\u0443\u043C\u043C\u0430 \u043D\u0435 \u043F\u043E\u044F\u0432\u0438\u043B\u0430\u0441\u044C.";
  if (/max fee per gas less than block base fee/i.test(m)) return "\u0421\u0435\u0442\u044C Arbitrum \u0441\u0435\u0439\u0447\u0430\u0441 \u0434\u043E\u0440\u043E\u0433\u0430\u044F. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 \u043C\u0438\u043D\u0443\u0442\u0443. \u0414\u0435\u043D\u044C\u0433\u0438 \u043D\u0430 \u043C\u0435\u0441\u0442\u0435.";
  return m;
}
async function run(res, fn) {
  try {
    say(res, 200, await fn());
  } catch (e) {
    say(res, e.status || 502, { error: human(e.message) });
  }
}
async function handler2(req, res) {
  if (req.method !== "POST") return handler(req, res);
  const b = read(req);
  if (b.op === "permit") return run(res, () => prepare({ address: b.address, amount: b.amount }));
  if (b.op === "relay") {
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
    return run(res, () => submit({ address: b.address, usd: b.usd, deadline: b.deadline, nonce: b.nonce, sig: b.sig, ip }));
  }
  return handler(req, res);
}
export {
  handler2 as default
};
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/abstract/utils.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/abstract/modular.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/abstract/curve.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/abstract/weierstrass.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/_shortw_utils.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/secp256k1.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
