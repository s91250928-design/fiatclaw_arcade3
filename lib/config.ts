/**
 * lib/config.ts — server configuration.
 * Pure game modules do not import this file.
 * Mainnet is blocked unless ALLOW_MAINNET + COMPLIANCE_CLEARED are both true.
 */

export type SolanaCluster = "devnet" | "testnet" | "mainnet-beta";

function optionalEnv(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`[config] Missing required env: ${name}`);
  }
  return v.trim();
}

const rawCluster = (process.env.SOLANA_CLUSTER ?? "devnet").toLowerCase();
const allowMainnet = process.env.ALLOW_MAINNET === "true";
const complianceCleared = process.env.COMPLIANCE_CLEARED === "true";

let cluster: SolanaCluster = "devnet";
if (rawCluster === "mainnet-beta" || rawCluster === "mainnet") {
  if (allowMainnet && complianceCleared) {
    cluster = "mainnet-beta";
  } else {
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

const priceLamports = BigInt(process.env.PRICE_LAMPORTS ?? "50000000");
if (priceLamports <= 0n) {
  throw new Error("[config] PRICE_LAMPORTS must be > 0");
}

const maxTxAgeSec = Number(process.env.MAX_TX_AGE_SEC ?? "180");
if (!Number.isFinite(maxTxAgeSec) || maxTxAgeSec < 30) {
  throw new Error("[config] MAX_TX_AGE_SEC must be >= 30");
}

export const MAX_WIN_MULTIPLIER = 2.5;

const treasuryRaw = optionalEnv("TREASURY_ADDRESS");

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
  /** Empty string if unset — payment routes will reject. */
  treasury: treasuryRaw,
  priceLamports,
  maxTxAgeSec,
  maxWinMultiplier: MAX_WIN_MULTIPLIER,
  clawPrice: Number(process.env.CLAW_PRICE ?? "500"),
  hasSupabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
} as const;

/** Call at the start of payment-verification routes. */
export function assertConfigured(): void {
  if (!CONFIG.treasury) {
    throw new Error("[config] Missing required env: TREASURY_ADDRESS");
  }
  void CONFIG.priceLamports;
}

export function assertTreasuryConfigured(): string {
  if (!CONFIG.treasury) {
    throw new Error("Missing required env: TREASURY_ADDRESS");
  }
  return CONFIG.treasury;
}
