import { NextRequest, NextResponse } from "next/server";
import { getGameStore } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet || wallet.length < 32) {
    return NextResponse.json({ ok: false, error: "wallet required" }, { status: 400 });
  }
  const store = getGameStore();
  const state = store.getPlayerState(wallet);
  return NextResponse.json({
    ok: true,
    ...state,
    jackpotBalanceLamports: String(state.jackpotBalanceLamports),
    priceLamports: String(state.priceLamports),
    solWonLamports: String(state.solWonLamports),
    biggestWinLamports: String(state.biggestWinLamports),
  });
}
