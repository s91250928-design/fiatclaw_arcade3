/**
 * app/api/play/start/route.ts
 *
 * СЕРДЦЕ ДЕНЕЖНОГО РЕЛЬСА.
 * Клиент присылает { wallet, signature }.
 * Сервер САМ проверяет транзакцию on-chain и только потом создаёт игру.
 * Клиенту мы не верим ни в чём.
 *
 * Обязательные проверки:
 *  1. tx существует и finalized
 *  2. meta.err == null
 *  3. получатель == казна (по дельте баланса)
 *  4. сумма >= PRICE_LAMPORTS
 *  5. feePayer == wallet игрока
 *  6. tx не старше MAX_TX_AGE_SEC
 *  7. signature ещё не использована (UNIQUE в БД)
 */

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { CONFIG, assertConfigured } from "@/lib/config";
import { connection, db, treasuryPubkey } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

export async function POST(req: NextRequest) {
  try {
    assertConfigured();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return bad("invalid body");

    const { wallet, signature } = body as {
      wallet?: unknown;
      signature?: unknown;
    };

    if (typeof wallet !== "string" || typeof signature !== "string") {
      return bad("wallet и signature обязательны");
    }
    if (wallet.length < 32 || wallet.length > 64) return bad("некорректный wallet");
    if (signature.length < 64 || signature.length > 128) {
      return bad("некорректная signature");
    }

    let payer: PublicKey;
    try {
      payer = new PublicKey(wallet);
    } catch {
      return bad("некорректный адрес кошелька");
    }

    // ── Ранний отказ, если подпись уже известна (быстрый путь)
    const seen = await db
      .from("consumed_signatures")
      .select("signature")
      .eq("signature", signature)
      .maybeSingle();
    if (seen.data) return bad("эта оплата уже использована", 409);

    // ── 1. Получаем транзакцию на уровне finalized
    const tx = await connection.getTransaction(signature, {
      commitment: CONFIG.commitment,
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) {
      return bad("транзакция не найдена или ещё не finalized", 404);
    }

    // ── 2. Без ошибки исполнения
    if (tx.meta?.err) return bad("транзакция завершилась ошибкой");

    // ── 6. Свежесть
    if (tx.blockTime != null) {
      const ageSec = Math.floor(Date.now() / 1000) - tx.blockTime;
      if (ageSec > CONFIG.maxTxAgeSec) {
        return bad("оплата слишком старая, повторите игру");
      }
      if (ageSec < -60) return bad("некорректное время транзакции");
    }

    // ── 3,4. Дельта баланса казны (надёжнее парсинга инструкций)
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
    if (treasuryIdx === -1) return bad("оплата не на счёт казны");

    const pre = BigInt(tx.meta?.preBalances?.[treasuryIdx] ?? 0);
    const post = BigInt(tx.meta?.postBalances?.[treasuryIdx] ?? 0);
    const received = post - pre;

    if (received < CONFIG.priceLamports) {
      return bad("недостаточная сумма оплаты");
    }

    // ── 5. Плательщик = feePayer = первый signer
    const feePayer = keys.get(0)!;
    if (!feePayer.equals(payer)) {
      return bad("оплата должна идти с вашего кошелька");
    }

    // ── users: upsert
    const upsertUser = await db
      .from("users")
      .upsert({ wallet }, { onConflict: "wallet" })
      .select("id")
      .single();
    if (upsertUser.error || !upsertUser.data) {
      console.error("[play/start] user upsert", upsertUser.error);
      return bad("ошибка пользователя", 500);
    }
    const userId = upsertUser.data.id;

    // ── 7. Фиксация подписи как UNIQUE (защита от гонки)
    const consume = await db
      .from("consumed_signatures")
      .insert({ signature, wallet });
    if (consume.error) {
      const code = (consume.error as { code?: string }).code;
      if (code === "23505") return bad("эта оплата уже использована", 409);
      console.error("[play/start] consume signature", consume.error);
      return bad("ошибка фиксации оплаты", 500);
    }

    // ── Создаём игру
    const play = await db
      .from("plays")
      .insert({
        user_id: userId,
        wallet,
        signature,
        price_lamports: CONFIG.priceLamports.toString(),
        cluster: CONFIG.cluster,
        status: "paid",
      })
      .select("id")
      .single();

    if (play.error || !play.data) {
      console.error("[play/start] play insert", play.error);
      return bad("ошибка создания игры", 500);
    }

    return NextResponse.json({
      ok: true,
      playId: play.data.id,
      cluster: CONFIG.cluster,
      priceLamports: CONFIG.priceLamports.toString(),
      // Фаза 2 вернёт сюда outcome через VRF
      next: "outcome-not-implemented-yet",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "внутренняя ошибка";
    console.error("[play/start]", e);
    // Наружу не отдаём stack / внутренние детали
    return bad(msg.includes("Missing required env") ? "сервер не сконфигурирован" : "внутренняя ошибка", 500);
  }
}
