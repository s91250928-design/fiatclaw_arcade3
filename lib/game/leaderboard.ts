/**
 * Leaderboard aggregation from resolved plays (pure).
 */

import type { LeaderboardRow, LeaderboardWindow, ResolvedPlay } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export function windowStart(window: LeaderboardWindow, now: Date = new Date()): Date | null {
  if (window === "all") return null;
  const t = now.getTime();
  if (window === "daily") return new Date(t - DAY_MS);
  return new Date(t - WEEK_MS);
}

export function filterByWindow(
  plays: ResolvedPlay[],
  window: LeaderboardWindow,
  now: Date = new Date()
): ResolvedPlay[] {
  const start = windowStart(window, now);
  if (!start) return plays;
  const ms = start.getTime();
  return plays.filter((p) => new Date(p.createdAt).getTime() >= ms);
}

export function aggregateStats(plays: ResolvedPlay[]): LeaderboardRow[] {
  const map = new Map<string, LeaderboardRow>();

  for (const p of plays) {
    let row = map.get(p.wallet);
    if (!row) {
      row = {
        wallet: p.wallet,
        totalPlays: 0,
        wins: 0,
        losses: 0,
        solWonLamports: 0,
        clawWon: 0,
        biggestWinLamports: 0,
      };
      map.set(p.wallet, row);
    }
    row.totalPlays += 1;
    if (p.outcome === "win") {
      row.wins += 1;
      row.solWonLamports += p.awardedLamports;
      row.clawWon += p.awardedClaw;
      if (p.awardedLamports > row.biggestWinLamports) {
        row.biggestWinLamports = p.awardedLamports;
      }
    } else {
      row.losses += 1;
    }
  }

  return Array.from(map.values());
}

export type LeaderboardSort =
  | "totalPlays"
  | "wins"
  | "solWonLamports"
  | "clawWon"
  | "biggestWinLamports";

export function rankLeaderboard(
  plays: ResolvedPlay[],
  window: LeaderboardWindow,
  sortBy: LeaderboardSort = "solWonLamports",
  now: Date = new Date()
): LeaderboardRow[] {
  const rows = aggregateStats(filterByWindow(plays, window, now));
  rows.sort((a, b) => {
    const diff = (b[sortBy] as number) - (a[sortBy] as number);
    if (diff !== 0) return diff;
    return b.wins - a.wins;
  });
  return rows;
}

export function applyPlayToPlayerStats(
  stats: {
    totalPlays: number;
    wins: number;
    losses: number;
    solWonLamports: number;
    clawWon: number;
    biggestWinLamports: number;
  },
  play: Pick<ResolvedPlay, "outcome" | "awardedLamports" | "awardedClaw">
) {
  const next = { ...stats };
  next.totalPlays += 1;
  if (play.outcome === "win") {
    next.wins += 1;
    next.solWonLamports += play.awardedLamports;
    next.clawWon += play.awardedClaw;
    if (play.awardedLamports > next.biggestWinLamports) {
      next.biggestWinLamports = play.awardedLamports;
    }
  } else {
    next.losses += 1;
  }
  return next;
}
