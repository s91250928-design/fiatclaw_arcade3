import { NextRequest, NextResponse } from "next/server";
import { getGameStore } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("invalid body");

  const { wallet, action, amount } = body as {
    wallet?: unknown;
    action?: unknown;
    amount?: unknown;
  };

  if (typeof wallet !== "string" || wallet.length < 32) return bad("wallet required");
  const amt = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isInteger(amt) || amt < 1) return bad("amount must be positive integer");

  const store = getGameStore();

  if (action === "stake") {
    const r = store.stake(wallet, amt);
    if (!r.ok) return bad(r.error);
    return NextResponse.json({
      ok: true,
      action: "stake",
      clawBalance: r.clawBalance,
      stakedClaw: r.stakedClaw,
      tier: r.tier.label,
      vip: r.tier.vip,
      feeMultiplier: r.feeMultiplier,
    });
  }

  if (action === "unstake") {
    const r = store.unstake(wallet, amt);
    if (!r.ok) return bad(r.error);
    return NextResponse.json({
      ok: true,
      action: "unstake",
      clawBalance: r.clawBalance,
      stakedClaw: r.stakedClaw,
      tier: r.tier.label,
      vip: r.tier.vip,
      feeMultiplier: r.feeMultiplier,
    });
  }

  return bad("action must be stake or unstake");
}
