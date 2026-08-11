/**
 * Start a play attempt: consume one credit.
 * Legacy body { wallet, signature } still buys 1 play with SOL then starts.
 * Preferred: buy via /api/plays/buy, then POST { wallet } here.
 */

import { NextRequest, NextResponse } from "next/server";
import { CONFIG } from "@/lib/config";
import {
  getGameStore,
  feeMultiplierForStake,
  solCostLamports,
} from "@/lib/game";
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

    const { wallet, signature } = body as {
      wallet?: unknown;
      signature?: unknown;
    };

    if (typeof wallet !== "string" || wallet.length < 32) {
      return bad("wallet required");
    }

    const store = getGameStore();

    // Legacy: pay-per-play with signature → credit 1 play then consume.
    if (typeof signature === "string" && signature.length >= 64) {
      const player = store.ensurePlayer(wallet);
      const mult = feeMultiplierForStake(player.stakedClaw);
      const unitPrice = store.config.priceLamports;
      const minLamports = BigInt(solCostLamports(1, unitPrice, mult));
      const verified = await verifySolPayment({
        wallet,
        signature,
        minLamports,
      });
      if (!verified.ok) {
        return bad(verified.error, verified.status ?? 400);
      }
      const bought = store.buyPlaysWithSol(wallet, 1, signature);
      if (!bought.ok) {
        return bad(bought.error, bought.error.includes("already") ? 409 : 400);
      }
    }

    const started = store.startAttempt(wallet);
    if (!started.ok) {
      return bad(started.error, started.error === "no plays available" ? 402 : 400);
    }

    return NextResponse.json({
      ok: true,
      playId: started.playId,
      availablePlays: started.availablePlays,
      cluster: CONFIG.cluster,
      priceLamports: String(store.config.priceLamports),
      jackpotBalanceLamports: String(store.jackpot.balanceLamports),
      next: "drop",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "internal error";
    console.error("[play/start]", e);
    return bad(
      msg.includes("Missing required env") || msg.includes("not configured")
        ? "server not configured"
        : "internal error",
      500
    );
  }
}
