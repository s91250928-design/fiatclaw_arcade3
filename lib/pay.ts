/**
 * lib/pay.ts — CLIENT.
 * Builds payment txs and calls server APIs. Never decides outcomes.
 */

"use client";

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
const RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  (CLUSTER === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");
const TREASURY = process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "";
const PRICE = BigInt(process.env.NEXT_PUBLIC_PRICE_LAMPORTS ?? "50000000");

function connection(): Connection {
  return new Connection(RPC, "confirmed");
}

/** Pay SOL to treasury for N plays (amount = unit * plays; server re-checks). */
export async function paySolForPlays(
  wallet: WalletContextState,
  plays: number,
  unitLamports: bigint = PRICE,
  feeMultiplier = 1
): Promise<string> {
  if (!wallet.publicKey || !wallet.sendTransaction) {
    throw new Error("Wallet not connected");
  }
  if (!TREASURY) throw new Error("Treasury not configured");
  if (unitLamports <= 0n) throw new Error("Price not configured");
  if (plays < 1) throw new Error("Invalid play count");

  const unit = BigInt(Math.ceil(Number(unitLamports) * feeMultiplier));
  const lamports = unit * BigInt(plays);

  const conn = connection();
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: new PublicKey(TREASURY),
      lamports: Number(lamports),
    })
  );

  const { blockhash, lastValidBlockHeight } =
    await conn.getLatestBlockhash("finalized");
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;

  const sig = await wallet.sendTransaction(tx, conn);
  await conn.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}

export async function buyPlaysSol(
  wallet: WalletContextState,
  plays: number,
  feeMultiplier = 1,
  /** Must match server GameStore.config.priceLamports (from player/state). */
  unitLamports: bigint = PRICE
) {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const signature = await paySolForPlays(
    wallet,
    plays,
    unitLamports,
    feeMultiplier
  );
  const res = await fetch("/api/plays/buy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      wallet: wallet.publicKey.toBase58(),
      currency: "SOL",
      plays,
      signature,
    }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "bad response" }));
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Buy failed (${res.status})`);
  }
  return data as {
    ok: true;
    availablePlays: number;
    playsBought: number;
    costLamports: string;
  };
}

export async function buyPlaysClaw(wallet: WalletContextState, plays: number) {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const res = await fetch("/api/plays/buy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      wallet: wallet.publicKey.toBase58(),
      currency: "CLAW",
      plays,
    }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "bad response" }));
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Buy failed (${res.status})`);
  }
  return data as {
    ok: true;
    availablePlays: number;
    clawBalance: number;
    costClaw: number;
  };
}

/** Consume one play credit; returns playId for DROP. */
export async function startAttempt(wallet: WalletContextState) {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const res = await fetch("/api/play/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: wallet.publicKey.toBase58() }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "bad response" }));
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Start failed (${res.status})`);
  }
  return data as {
    ok: true;
    playId: string;
    availablePlays: number;
    jackpotBalanceLamports: string;
  };
}

/** Server resolves outcome — never send won/outcome from client. */
export async function resolveAttempt(wallet: WalletContextState, playId: string) {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const res = await fetch("/api/play/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      wallet: wallet.publicKey.toBase58(),
      playId,
    }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "bad response" }));
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Resolve failed (${res.status})`);
  }
  return data as {
    ok: true;
    playId: string;
    outcome: "win" | "lose";
    won: boolean;
    prize: {
      code: string | null;
      kind: string | null;
      title: string | null;
      awardedLamports: string;
      awardedClaw: number;
      isJackpot: boolean;
    } | null;
    message: string;
    remainingPlays: number;
    jackpotBalanceLamports: string;
  };
}

/** Legacy: pay 1 play with SOL and start (kept for compatibility). */
export async function startPlay(wallet: WalletContextState) {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const signature = await paySolForPlays(wallet, 1);
  const res = await fetch("/api/play/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      wallet: wallet.publicKey.toBase58(),
      signature,
    }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "bad response" }));
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Server rejected play (${res.status})`);
  }
  return data as {
    ok: true;
    playId: string;
    cluster: string;
    priceLamports: string;
    availablePlays: number;
    next: string;
  };
}

export async function fetchPlayerState(wallet: string) {
  const res = await fetch(`/api/player/state?wallet=${encodeURIComponent(wallet)}`);
  const data = await res.json().catch(() => ({ ok: false }));
  return data;
}

/** Server-owned stake status (GET /api/stake) — never trust client totals. */
export type StakeStatusResponse = {
  ok?: boolean;
  error?: string;
  stakedClaw?: number;
  staked_amount?: number;
  tier?: string;
  vip?: boolean;
  feeMultiplier?: number;
  updated_at?: string;
  tiers?: Array<{
    minStaked: number;
    feeMultiplier: number;
    vip: boolean;
    label: string;
  }>;
  affectsWinProbability?: boolean;
  stakeCreditEnabled?: boolean;
};

export async function fetchStakeStatus(
  wallet: string
): Promise<StakeStatusResponse> {
  const res = await fetch(
    `/api/stake?wallet=${encodeURIComponent(wallet)}`
  );
  const data = await res.json().catch(() => ({ ok: false }));
  return data;
}

export async function faucetClaw(wallet: string, amount = 5000) {
  const res = await fetch("/api/claw/faucet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, amount }),
  });
  return res.json();
}

/**
 * Phase 1: posts stake intent only — server never credits from amount.
 * Phase 2 will require txSignature and on-chain verify before credit.
 */
export async function stakeClawApi(
  wallet: string,
  action: "stake" | "unstake",
  amount: number,
  txSignature?: string
) {
  const res = await fetch("/api/stake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      wallet,
      action,
      amount,
      ...(txSignature ? { txSignature } : {}),
    }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "bad response" }));
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Stake failed");
  // Phase 1 responses have credited: false
  return data;
}

export async function getSolBalance(publicKey: PublicKey): Promise<number> {
  const conn = connection();
  const lamports = await conn.getBalance(publicKey, "confirmed");
  return lamports / 1e9;
}
