/**
 * lib/pay.ts — КЛИЕНТ.
 * Только строит транзакцию оплаты и отдаёт подпись серверу.
 * Никаких секретов, никакого решения исхода, никакой записи в БД.
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
const PRICE = BigInt(process.env.NEXT_PUBLIC_PRICE_LAMPORTS ?? "0");

/**
 * 1) Пользователь платит за игру → возвращаем подпись.
 * Сервер потом сам проверит finalized + сумму + получателя.
 */
export async function payForPlay(wallet: WalletContextState): Promise<string> {
  if (!wallet.publicKey || !wallet.sendTransaction) {
    throw new Error("Кошелёк не подключён");
  }
  if (!TREASURY) throw new Error("Казна не настроена (NEXT_PUBLIC_TREASURY_ADDRESS)");
  if (PRICE <= 0n) throw new Error("Цена игры не настроена");

  const connection = new Connection(RPC, "confirmed");
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: new PublicKey(TREASURY),
      lamports: Number(PRICE),
    })
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("finalized");
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;

  const sig = await wallet.sendTransaction(tx, connection);

  // Ждём confirmed, чтобы не слать серверу совсем сырую tx.
  // Сервер всё равно перепроверит на finalized.
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return sig;
}

/**
 * 2) Полный цикл: оплата → серверная проверка → playId.
 * Клиент получает только то, что сервер решил.
 */
export async function startPlay(wallet: WalletContextState) {
  if (!wallet.publicKey) throw new Error("Кошелёк не подключён");

  const signature = await payForPlay(wallet);

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
    throw new Error(data.error ?? `Сервер отклонил игру (${res.status})`);
  }

  return data as {
    ok: true;
    playId: string;
    cluster: string;
    priceLamports: string;
    next: string;
  };
}
