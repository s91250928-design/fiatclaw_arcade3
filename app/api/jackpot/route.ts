import { NextResponse } from "next/server";
import { getGameStore } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = getGameStore();
  return NextResponse.json({
    ok: true,
    balanceLamports: String(store.jackpot.balanceLamports),
    baseLamports: String(store.jackpot.baseLamports),
    contributionLamports: String(store.jackpot.contributionLamports),
    lastWonAt: store.jackpot.lastWonAt,
    lastWinnerWallet: store.jackpot.lastWinnerWallet,
  });
}
