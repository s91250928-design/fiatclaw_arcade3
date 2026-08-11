/**
 * Buy plays with SOL (verified signature) or $CLAW (server ledger).
 */

import { NextRequest, NextResponse } from "next/server";
import { getGameStore, feeMultiplierForStake, solCostLamports } from "@/lib/game";
import { verifySolPayment } from "@/lib/verify-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return bad("invalid body");

    const { wallet, currency, plays, signature } = body as {
      wallet?: unknown;
      currency?: unknown;
      plays?: unknown;
      signature?: unknown;
    };

    if (typeof wallet !== "string" || wallet.length < 32) return bad("wallet required");
    const count = typeof plays === "number" ? plays : Number(plays);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      return bad("plays must be integer 1–100");
    }

    const store = getGameStore();
    const player = store.ensurePlayer(wallet);
    const mult = feeMultiplierForStake(player.stakedClaw);

    if (currency === "CLAW" || currency === "claw") {
      const result = store.buyPlaysWithClaw(wallet, count);
      if (!result.ok) return bad(result.error);
      return NextResponse.json({
        ok: true,
        currency: "CLAW",
        playsBought: count,
        availablePlays: result.availablePlays,
        clawBalance: result.clawBalance,
        costClaw: result.costClaw,
      });
    }

    if (currency === "SOL" || currency === "sol" || !currency) {
      if (typeof signature !== "string") return bad("signature required for SOL purchase");
      // Authoritative unit price = admin/store config (not env-only CONFIG).
      const unitPrice = store.config.priceLamports;
      const minLamports = BigInt(solCostLamports(count, unitPrice, mult));
      const verified = await verifySolPayment({
        wallet,
        signature,
        minLamports,
      });
      if (!verified.ok) {
        return bad(verified.error, verified.status ?? 400);
      }
      const result = store.buyPlaysWithSol(wallet, count, signature);
      if (!result.ok) return bad(result.error, result.error.includes("already") ? 409 : 400);
      return NextResponse.json({
        ok: true,
        currency: "SOL",
        playsBought: count,
        availablePlays: result.availablePlays,
        costLamports: String(result.costLamports),
        unitPriceLamports: String(unitPrice),
      });
    }

    return bad("currency must be SOL or CLAW");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "internal error";
    console.error("[plays/buy]", e);
    return bad(
      msg.includes("Missing required env") || msg.includes("not configured")
        ? "server not configured"
        : "internal error",
      500
    );
  }
}
