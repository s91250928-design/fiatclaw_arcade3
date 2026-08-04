/**
 * Resolve DROP outcome server-side.
 * Client must NOT send won/outcome — only playId + wallet.
 */

import { NextRequest, NextResponse } from "next/server";
import { getGameStore, LOSE_MESSAGE } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return bad("invalid body");

    const { wallet, playId } = body as {
      wallet?: unknown;
      playId?: unknown;
      won?: unknown;
    };

    // Explicitly ignore any client outcome fields.
    if ("won" in (body as object) || "outcome" in (body as object)) {
      // Do not error — just never trust them.
    }

    if (typeof wallet !== "string" || wallet.length < 32) return bad("wallet required");
    if (typeof playId !== "string" || playId.length < 4) return bad("playId required");

    const store = getGameStore();
    const resolved = store.resolveAttempt(playId, wallet);
    if (!resolved.ok) return bad(resolved.error, resolved.error === "play not found" ? 404 : 400);

    const r = resolved.result;
    return NextResponse.json({
      ok: true,
      playId: r.playId,
      outcome: r.outcome,
      won: r.outcome === "win",
      prize: r.outcome === "win"
        ? {
            code: r.prizeCode,
            kind: r.prizeKind,
            title: r.prizeTitle,
            awardedLamports: String(r.awardedLamports),
            awardedClaw: r.awardedClaw,
            isJackpot: r.isJackpot,
          }
        : null,
      message: r.outcome === "lose" ? LOSE_MESSAGE : r.message,
      remainingPlays: r.remainingPlays,
      jackpotBalanceLamports: String(r.jackpotBalanceLamports),
      alreadyResolved: resolved.alreadyResolved,
    });
  } catch (e: unknown) {
    console.error("[play/resolve]", e);
    return bad("internal error", 500);
  }
}
