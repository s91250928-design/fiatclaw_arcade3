/**
 * lib/config.ts
 * Единственный источник конфигурации. Импортировать ТОЛЬКО на сервере
 * (в API-роутах и lib/server.ts). Клиент получает только NEXT_PUBLIC_* через env.
 *
 * Главный предохранитель: mainnet физически не запустится без двух
 * независимых флагов ALLOW_MAINNET + COMPLIANCE_CLEARED.
 */

export type SolanaCluster = "devnet" | "testnet" | "mainnet-beta";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`[config] Missing required env: ${name}`);
  }
  return v.trim();
}

function optionalEnv(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

const rawCluster = (process.env.SOLANA_CLUSTER ?? "devnet").toLowerCase();
const allowMainnet = process.env.ALLOW_MAINNET === "true";
const complianceCleared = process.env.COMPLIANCE_CLEARED === "true";

// Двойной предохранитель: mainnet только если оба флага true.
let cluster: SolanaCluster = "devnet";
if (rawCluster === "mainnet-beta" || rawCluster === "mainnet") {
  if (allowMainnet && complianceCleared) {
    cluster = "mainnet-beta";
  } else {
    // Жёстко падаем — не даём случайно работать с реальными деньгами.
    throw new Error(
      "[config] mainnet blocked. Set ALLOW_MAINNET=true AND COMPLIANCE_CLEARED=true " +
        "only after legal clearance. Currently forced to refuse startup."
    );
  }
} else if (rawCluster === "testnet") {
  cluster = "testnet";
} else {
  cluster = "devnet";
}

const priceLamports = BigInt(process.env.PRICE_LAMPORTS ?? "50000000"); // 0.05 SOL default
if (priceLamports <= 0n) {
  throw new Error("[config] PRICE_LAMPORTS must be > 0");
}

const maxTxAgeSec = Number(process.env.MAX_TX_AGE_SEC ?? "180");
if (!Number.isFinite(maxTxAgeSec) || maxTxAgeSec < 30) {
  throw new Error("[config] MAX_TX_AGE_SEC must be >= 30");
}

// Максимальный мультипликатор выигрыша (250% от ставки).
export const MAX_WIN_MULTIPLIER = 2.5;

export const CONFIG = {
  cluster,
  rpcUrl:
    optionalEnv("SOLANA_RPC_URL") ||
    (cluster === "mainnet-beta"
      ? "https://api.mainnet-beta.solana.com"
      : cluster === "testnet"
        ? "https://api.testnet.solana.com"
        : "https://api.devnet.solana.com"),
  commitment: "finalized" as const,
  treasury: requireEnv("TREASURY_ADDRESS"),
  priceLamports,
  maxTxAgeSec,
  maxWinMultiplier: MAX_WIN_MULTIPLIER,
} as const;

/** Вызвать в начале каждого API-роута, чтобы упасть рано при кривой конфигурации. */
export function assertConfigured(): void {
  // Просто обращение к CONFIG уже валидирует всё.
  void CONFIG.treasury;
  void CONFIG.priceLamports;
}
