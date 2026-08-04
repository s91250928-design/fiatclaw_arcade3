/**
 * On-chain SOL payment verification (server-only).
 */

import { PublicKey } from "@solana/web3.js";
import { CONFIG, assertTreasuryConfigured } from "./config";
import { connection, treasuryPubkey } from "./server";

export type VerifyResult =
  | { ok: true; receivedLamports: bigint }
  | { ok: false; error: string; status?: number };

export async function verifySolPayment(opts: {
  wallet: string;
  signature: string;
  minLamports: bigint;
}): Promise<VerifyResult> {
  try {
    assertTreasuryConfigured();
  } catch {
    return { ok: false, error: "server not configured", status: 500 };
  }

  const { wallet, signature, minLamports } = opts;

  if (wallet.length < 32 || wallet.length > 64) {
    return { ok: false, error: "invalid wallet" };
  }
  if (signature.length < 64 || signature.length > 128) {
    return { ok: false, error: "invalid signature" };
  }

  let payer: PublicKey;
  try {
    payer = new PublicKey(wallet);
  } catch {
    return { ok: false, error: "invalid wallet address" };
  }

  const tx = await connection.getTransaction(signature, {
    commitment: CONFIG.commitment,
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) {
    return { ok: false, error: "transaction not found or not finalized", status: 404 };
  }
  if (tx.meta?.err) {
    return { ok: false, error: "transaction failed on-chain" };
  }

  if (tx.blockTime != null) {
    const ageSec = Math.floor(Date.now() / 1000) - tx.blockTime;
    if (ageSec > CONFIG.maxTxAgeSec) {
      return { ok: false, error: "payment too old, try again" };
    }
    if (ageSec < -60) {
      return { ok: false, error: "invalid transaction time" };
    }
  }

  const keys = tx.transaction.message.getAccountKeys({
    accountKeysFromLookups: tx.meta?.loadedAddresses ?? undefined,
  });
  const treasury = treasuryPubkey();

  let treasuryIdx = -1;
  for (let i = 0; i < keys.length; i++) {
    if (keys.get(i)!.equals(treasury)) {
      treasuryIdx = i;
      break;
    }
  }
  if (treasuryIdx === -1) {
    return { ok: false, error: "payment not sent to treasury" };
  }

  const pre = BigInt(tx.meta?.preBalances?.[treasuryIdx] ?? 0);
  const post = BigInt(tx.meta?.postBalances?.[treasuryIdx] ?? 0);
  const received = post - pre;

  if (received < minLamports) {
    return { ok: false, error: "insufficient payment amount" };
  }

  const feePayer = keys.get(0)!;
  if (!feePayer.equals(payer)) {
    return { ok: false, error: "payment must come from your wallet" };
  }

  return { ok: true, receivedLamports: received };
}
