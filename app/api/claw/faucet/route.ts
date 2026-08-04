/**
 * Dev faucet: credit server-side $CLAW ledger when no mint is configured.
 * Disabled on mainnet-beta.
 */

import { NextRequest, NextResponse } from "next/server";
import { CONFIG } from "@/lib/config";
import { getGameStore } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (CONFIG.cluster === "mainnet-beta") {
    return NextResponse.json({ ok: false, error: "faucet disabled on mainnet" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const wallet = body?.wallet;
  const amount = Number(body?.amount ?? 5000);

  if (typeof wallet !== "string" || wallet.length < 32) {
    return NextResponse.json({ ok: false, error: "wallet required" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount < 1 || amount > 100_000) {
    return NextResponse.json({ ok: false, error: "amount 1–100000" }, { status: 400 });
  }

  const store = getGameStore();
  const r = store.creditClawBalance(wallet, Math.floor(amount));
  return NextResponse.json({ ok: true, clawBalance: r.clawBalance });
}
