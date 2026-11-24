// Человек подписывает разрешение USDC ровно на сумму зачисления.
// Сервер только оплачивает газ Arbitrum и сам собирает вызов моста.
// Деньги списываются с адреса подписи и зачисляются на него же. Наш адрес их не получает.

import {
  USDC, BRIDGE, BUILDER, TRANSFER_TOPIC, FAIL_TOPIC, domainSeparator,
  permitDigest, recoverAddress, encodeDeposit, addressFromKey, signArbTx, typedData,
} from "./arb-relay.mjs";

const MIN = 5000000n;
const MAX = 500000n * 1000000n;
const RPCS = ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one.publicnode.com"];
const hits = new Map();
let tail = Promise.resolve();
let domainOk = false;

function fail(status, error) {
  const e = new Error(error);
  e.status = status;
  return e;
}

function hexToBytes(hex) {
  const h = hex.replace(/^0x/, "");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function relayer() {
  const raw = String(process.env.GAS_RELAYER_KEY || "").trim().replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw fail(503, "Зачисление ещё не включено.");
  const priv = hexToBytes(raw);
  const address = addressFromKey(priv);
  if (address === BUILDER) throw fail(503, "Газовый адрес совпал с адресом комиссии. Так нельзя.");
  return { priv, address };
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
      if (j.result !== undefined) return j.result;
      last = j.error?.message || last;
    } catch { /* следующий узел */ }
  }
  throw fail(502, last);
}

const call = (data, to = USDC) => rpc("eth_call", [{ to, data }, "latest"]);

async function assertDomain() {
  if (domainOk) return;
  const got = String(await call("0x3644e515")).toLowerCase();
  if (got !== domainSeparator()) throw fail(503, "Сеть USDC не совпала. Зачисление остановлено, деньги на месте.");
  domainOk = true;
}

async function gasOk(address) {
  const wei = BigInt(await rpc("eth_getBalance", [address, "latest"]));
  if (wei < 300000000000000n) {
    throw fail(503, `На газовом адресе ${address} нет ETH в сети Arbitrum. Ваши USDC на месте.`);
  }
}

function clamp(amount, balance) {
  let want = balance;
  if (amount != null && amount !== "") {
    if (!/^\d{1,18}$/.test(String(amount))) throw fail(400, "Сумма не разобралась");
    want = BigInt(amount);
    if (want > balance) want = balance;
  }
  if (want < MIN) throw fail(422, "Меньше 5 USDC Totum не зачислит. Не отправляем.");
  if (want > MAX) want = MAX;
  return want;
}

export async function prepare({ address, amount }) {
  const owner = String(address || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(owner)) throw fail(400, "Сначала подключите кошелёк, на котором торгуете");
  const gas = relayer();
  if (gas.address === owner) throw fail(503, "Газовый адрес совпал с вашим. Так нельзя.");
  await assertDomain();
  await gasOk(gas.address);
  const [bal, nonce] = await Promise.all([
    call("0x70a08231" + owner.slice(2).padStart(64, "0")),
    call("0x7ecebe00" + owner.slice(2).padStart(64, "0")),
  ]);
  const balance = BigInt(bal);
  const usd = clamp(amount, balance);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400);
  const nonceN = BigInt(nonce);
  return {
    ok: true,
    usd: usd.toString(),
    deadline: deadline.toString(),
    nonce: nonceN.toString(),
    typed: typedData({ owner, value: usd, nonce: nonceN, deadline }),
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
  const run = tail.then(fn, fn);
  tail = run.then(() => {}, () => {});
  return run;
}

function topicAddr(topic) {
  return "0x" + String(topic || "").toLowerCase().slice(-40);
}

export async function submit({ address, usd, deadline, nonce, sig, ip }) {
  const owner = String(address || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(owner)) throw fail(400, "Сначала подключите кошелёк");
  if (!/^\d{1,18}$/.test(String(usd)) || !/^\d{1,12}$/.test(String(deadline)) || !/^\d{1,40}$/.test(String(nonce))) {
    throw fail(400, "Подпись не разобралась");
  }
  if (!/^0x[0-9a-fA-F]{130}$/.test(String(sig || "")) && !/^[0-9a-fA-F]{130}$/.test(String(sig || ""))) throw fail(400, "Подпись не разобралась");
  const signature = String(sig).startsWith("0x") ? String(sig) : "0x" + sig;
  if (limited("a:" + owner, 8, 10 * 60 * 1000) || limited("i:" + (ip || "x"), 30, 60 * 60 * 1000) || limited("g:relay", 40, 60 * 60 * 1000)) {
    throw fail(429, "Слишком часто. Подождите пару минут. Деньги на месте.");
  }
  const value = BigInt(usd);
  const until = BigInt(deadline);
  const nonceN = BigInt(nonce);
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (value < MIN || value > MAX) throw fail(422, "Сумма вне границ зачисления");
  if (until < now - 30n || until > now + 90000n) throw fail(422, "Подпись устарела. Нажмите ещё раз.");
  const gas = relayer();
  if (gas.address === owner) throw fail(503, "Газовый адрес совпал с вашим. Так нельзя.");
  let rec;
  try {
    rec = recoverAddress(permitDigest({ owner, value, nonce: nonceN, deadline: until }), signature);
  } catch (e) {
    throw fail(400, e.message || "Подпись не та");
  }
  if (rec.address !== owner) throw fail(400, "Подпись от другого кошелька. Деньги не уходили.");
  await assertDomain();
  const [bal, liveNonce] = await Promise.all([
    call("0x70a08231" + owner.slice(2).padStart(64, "0")),
    call("0x7ecebe00" + owner.slice(2).padStart(64, "0")),
  ]);
  if (BigInt(liveNonce) !== nonceN) throw fail(409, "Кошелёк уже подписал что-то ещё. Нажмите зачисление ещё раз.");
  if (BigInt(bal) < value) throw fail(422, "На кошельке меньше USDC, чем в подписи. Не отправляем.");
  await gasOk(gas.address);
  const data = encodeDeposit({ user: owner, usd: value, deadline: until, r: rec.r, s: rec.s, v: rec.v });
  if (!data.startsWith("0xb30b5bce") || !data.toLowerCase().includes(owner.slice(2))) {
    throw fail(500, "Сборка зачисления сломалась. Деньги не уходили.");
  }
  try {
    await rpc("eth_call", [{ from: gas.address, to: BRIDGE, data }, "latest"]);
  } catch {
    throw fail(502, "Totum сейчас не принимает зачисление. Деньги на месте.");
  }
  return enqueue(async () => {
    const price = BigInt(await rpc("eth_gasPrice", []));
    let maxFee = price * 3n;
    if (maxFee < 50000000n) maxFee = 50000000n;
    if (maxFee > 5000000000n) throw fail(503, "Сеть Arbitrum сейчас дорогая. Повторите через минуту. Деньги на месте.");
    const nonceTx = BigInt(await rpc("eth_getTransactionCount", [gas.address, "pending"]));
    const raw = signArbTx({
      priv: gas.priv, nonce: nonceTx, maxPriority: 20000000n, maxFee, gasLimit: 200000n, to: BRIDGE, data,
    });
    const hash = await rpc("eth_sendRawTransaction", [raw]);
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(hash))) throw fail(502, "Сеть не взяла зачисление. Деньги на месте.");
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const receipt = await rpc("eth_getTransactionReceipt", [hash]);
      if (!receipt) continue;
      if (receipt.status !== "0x1") throw fail(502, "Зачисление не прошло. USDC остались на кошельке.");
      const logs = receipt.logs || [];
      const failed = logs.some((l) => String(l.address || "").toLowerCase() === BRIDGE && String(l.topics?.[0] || "").toLowerCase() === FAIL_TOPIC);
      const moved = logs.some((l) => {
        if (String(l.address || "").toLowerCase() !== USDC) return false;
        if (String(l.topics?.[0] || "").toLowerCase() !== TRANSFER_TOPIC) return false;
        return topicAddr(l.topics[1]) === owner && topicAddr(l.topics[2]) === BRIDGE && BigInt(l.data) === value;
      });
      if (failed || !moved) throw fail(502, "Totum не зачислил. USDC остались на кошельке.");
      return { ok: true, hash };
    }
    return { ok: true, hash, pending: true };
  });
}

function pad32(hex) {
  return String(hex).toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export function encodeApprove(spender, amount) {
  return "0x095ea7b3" + pad32(spender) + BigInt(amount).toString(16).padStart(64, "0");
}

export async function usdcBalance(addr) {
  const data = "0x70a08231" + pad32(addr);
  return BigInt(await rpc("eth_call", [{ to: USDC, data }, "latest"]));
}

export async function usdcAllowance(owner, spender) {
  const data = "0xdd62ed3e" + pad32(owner) + pad32(spender);
  return BigInt(await rpc("eth_call", [{ to: USDC, data }, "latest"]));
}

export async function recentUsdcIn(to, blocks = 8000) {
  const latest = Number(await rpc("eth_blockNumber", []));
  const fromBlock = "0x" + Math.max(0, latest - blocks).toString(16);
  const logs = await rpc("eth_getLogs", [{
    address: USDC,
    fromBlock,
    toBlock: "latest",
    topics: [TRANSFER_TOPIC, null, "0x" + pad32(to)],
  }]);
  return (logs || []).map((l) => ({ hash: String(l.transactionHash || ""), amount: BigInt(l.data) }));
}

export async function sendCall({ to, data, gasLimit }) {
  const gas = relayer();
  const price = BigInt(await rpc("eth_gasPrice", []));
  let maxFee = price * 3n;
  if (maxFee < 50000000n) maxFee = 50000000n;
  if (maxFee > 5000000000n) throw fail(503, "Сеть Arbitrum сейчас дорогая. Повторите через минуту. USDC на месте.");
  const nonce = BigInt(await rpc("eth_getTransactionCount", [gas.address, "pending"]));
  const raw = signArbTx({ priv: gas.priv, nonce, maxPriority: 20000000n, maxFee, gasLimit, to, data });
  const hash = await rpc("eth_sendRawTransaction", [raw]);
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(hash))) throw fail(502, "Сеть не взяла перевод в пул. USDC на месте.");
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (!receipt) continue;
    if (receipt.status !== "0x1") throw fail(502, "Перевод в пул не прошёл. USDC на месте.");
    return { hash };
  }
  return { hash, pending: true };
}
