import { NextRequest, NextResponse } from "next/server";
import { getGameStore, rankLeaderboard, type LeaderboardWindow } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const window = (req.nextUrl.searchParams.get("window") ?? "all") as LeaderboardWindow;
  const valid: LeaderboardWindow[] = ["daily", "weekly", "all"];
  const w = valid.includes(window) ? window : "all";
  const sortParam = req.nextUrl.searchParams.get("sort") ?? "solWonLamports";
  const sortBy = (
    ["totalPlays", "wins", "solWonLamports", "clawWon", "biggestWinLamports"] as const
  ).includes(sortParam as "wins")
    ? (sortParam as "solWonLamports")
    : "solWonLamports";

  const store = getGameStore();
  const rows = rankLeaderboard(store.listResolved(), w, sortBy).slice(0, 50);

  return NextResponse.json({
    ok: true,
    window: w,
    sortBy,
    rows: rows.map((r) => ({
      ...r,
      solWonLamports: String(r.solWonLamports),
      biggestWinLamports: String(r.biggestWinLamports),
    })),
  });
}
