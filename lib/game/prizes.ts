/**
 * Weighted prize draw + win gate.
 * Server-only authority for outcomes; pure functions for unit tests.
 *
 * Success probability is WIN_PROBABILITY (0.20) — never expose to the client UI.
 */

import type { DrawnPrize, GameConfig, PrizeEntry } from "./types";
import { LOSE_MESSAGE } from "./types";

/** Default stake 0.05 SOL. */
export const DEFAULT_STAKE_LAMPORTS = 50_000_000;

/**
 * Server-only success rate per attempt (20%).
 * DO NOT surface this number in any player-facing UI.
 */
export const WIN_PROBABILITY = 0.2;

/**
 * Winning prizes only (no lose row). On a successful gate roll, one of these
 * is drawn by weight. Lose path is the 80% gate failure.
 */
export function defaultPrizeCatalog(stakeLamports = DEFAULT_STAKE_LAMPORTS): PrizeEntry[] {
  const s = stakeLamports;
  return [
    {
      id: "prize-sol-tiny",
      code: "sol_tiny",
      kind: "sol",
      title: "SOL Crystal",
      valueLamports: Math.floor((s * 9) / 10),
      clawAmount: 0,
      weight: 28,
      active: true,
      maxMultiplierCap: 2.5,
    },
    {
      id: "prize-sol-small",
      code: "sol_small",
      kind: "sol",
      title: "SOL Bar",
      valueLamports: Math.floor((s * 12) / 10),
      clawAmount: 0,
      weight: 22,
      active: true,
      maxMultiplierCap: 2.5,
    },
    {
      id: "prize-sol-mid",
      code: "sol_mid",
      kind: "sol",
      title: "SOL Gem Stack",
      valueLamports: Math.floor((s * 17) / 10),
      clawAmount: 0,
      weight: 14,
      active: true,
      maxMultiplierCap: 2.5,
    },
    {
      id: "prize-sol-big",
      code: "sol_big",
      kind: "sol",
      title: "SOL Hoard",
      valueLamports: Math.floor((s * 224) / 100),
      clawAmount: 0,
      weight: 8,
      active: true,
      maxMultiplierCap: 2.5,
    },
    {
      id: "prize-sol-max",
      code: "sol_max",
      kind: "sol",
      title: "SOL Cap Prize",
      valueLamports: Math.floor((s * 25) / 10),
      clawAmount: 0,
      weight: 4,
      active: true,
      maxMultiplierCap: 2.5,
    },
    {
      id: "prize-claw",
      code: "claw_pack",
      kind: "claw",
      title: "$FIATCLAW Token",
      valueLamports: Math.floor((s * 11) / 10),
      clawAmount: 600,
      weight: 12,
      active: true,
      maxMultiplierCap: 2.5,
    },
    {
      id: "prize-nft",
      code: "nft_box",
      kind: "nft",
      title: "Gold Crystal NFT",
      valueLamports: Math.floor((s * 21) / 10),
      clawAmount: 0,
      weight: 5,
      active: true,
      maxMultiplierCap: 2.5,
      metadata: { collection: "claw-arcade" },
    },
    {
      id: "prize-mystery",
      code: "mystery",
      kind: "mystery",
      title: "Neon Capsule",
      valueLamports: Math.floor((s * 136) / 100),
      clawAmount: 200,
      weight: 6,
      active: true,
      maxMultiplierCap: 2.5,
    },
    {
      id: "prize-jackpot",
      code: "jackpot",
      kind: "jackpot",
      title: "Jackpot Hex",
      valueLamports: Math.floor((s * 46) / 10),
      clawAmount: 0,
      weight: 1,
      active: true,
      maxMultiplierCap: 2.5,
    },
  ];
}

export function activePrizes(catalog: PrizeEntry[]): PrizeEntry[] {
  return catalog.filter((p) => p.active && p.weight > 0);
}

export function winningPrizes(catalog: PrizeEntry[]): PrizeEntry[] {
  return activePrizes(catalog).filter(
    (p) =>
      p.code !== "lose" &&
      !(p.valueLamports === 0 && p.clawAmount === 0 && p.kind === "sol")
  );
}

export function totalWeight(catalog: PrizeEntry[]): number {
  return activePrizes(catalog).reduce((sum, p) => sum + p.weight, 0);
}

/**
 * Expected SOL-equivalent payout per play:
 * WIN_PROBABILITY × E[prize | win].
 */
export function expectedPayoutLamports(catalog: PrizeEntry[]): number {
  const list = winningPrizes(catalog);
  const tw = list.reduce((s, p) => s + p.weight, 0);
  if (tw <= 0) return 0;
  const sum = list.reduce((s, p) => s + p.weight * p.valueLamports, 0);
  return WIN_PROBABILITY * (sum / tw);
}

export function expectedRtp(catalog: PrizeEntry[], stakeLamports: number): number {
  if (stakeLamports <= 0) return 0;
  return expectedPayoutLamports(catalog) / stakeLamports;
}

export function capPrizeValue(
  valueLamports: number,
  stakeLamports: number,
  maxMultiplier: number,
  prizeCap: number
): number {
  const mult = Math.min(maxMultiplier, prizeCap);
  const maxVal = Math.floor(stakeLamports * mult);
  return Math.min(valueLamports, maxVal);
}

/**
 * Deterministic weighted pick among active entries.
 * `rng` must return a number in [0, 1).
 */
export function selectWeightedPrize(
  catalog: PrizeEntry[],
  rng: () => number = Math.random
): PrizeEntry | null {
  const list = activePrizes(catalog);
  const tw = list.reduce((s, p) => s + p.weight, 0);
  if (tw <= 0) return null;

  let r = rng() * tw;
  if (r < 0) r = 0;
  if (r >= tw) r = tw - Number.EPSILON;

  let acc = 0;
  for (const p of list) {
    acc += p.weight;
    if (r < acc) return p;
  }
  return list[list.length - 1] ?? null;
}

/**
 * Full outcome resolution.
 * 1) Gate: win with WIN_PROBABILITY (default 20%) — first rng() call.
 * 2) On win: weighted prize among catalog winners — second rng() call.
 * Never accepts client-supplied won/outcome flags.
 */
export function resolveOutcome(
  catalog: PrizeEntry[],
  opts: {
    stakeLamports: number;
    maxWinMultiplier: number;
    jackpotBalanceLamports: number;
    rng?: () => number;
    /** Override only in tests; production uses WIN_PROBABILITY. */
    winProbability?: number;
  }
): DrawnPrize {
  const rng = opts.rng ?? Math.random;
  const pWin = opts.winProbability ?? WIN_PROBABILITY;

  const gate = rng();
  if (gate >= pWin) {
    return {
      prize: null,
      outcome: "lose",
      awardedLamports: 0,
      awardedClaw: 0,
      isJackpot: false,
      message: LOSE_MESSAGE,
    };
  }

  const winners = winningPrizes(catalog);
  const prize = selectWeightedPrize(winners, rng);

  if (
    !prize ||
    prize.code === "lose" ||
    (prize.valueLamports === 0 && prize.kind === "sol" && prize.clawAmount === 0)
  ) {
    return {
      prize: prize?.code === "lose" ? prize : null,
      outcome: "lose",
      awardedLamports: 0,
      awardedClaw: 0,
      isJackpot: false,
      message: LOSE_MESSAGE,
    };
  }

  const isJackpot = prize.kind === "jackpot";
  let awardedLamports = isJackpot
    ? opts.jackpotBalanceLamports
    : prize.valueLamports;

  if (!isJackpot) {
    awardedLamports = capPrizeValue(
      awardedLamports,
      opts.stakeLamports,
      opts.maxWinMultiplier,
      prize.maxMultiplierCap
    );
  }

  const awardedClaw =
    prize.kind === "claw" || prize.kind === "mystery" ? prize.clawAmount : 0;

  if (awardedLamports <= 0 && awardedClaw <= 0 && prize.kind !== "nft") {
    return {
      prize,
      outcome: "lose",
      awardedLamports: 0,
      awardedClaw: 0,
      isJackpot: false,
      message: LOSE_MESSAGE,
    };
  }

  return {
    prize,
    outcome: "win",
    awardedLamports,
    awardedClaw,
    isJackpot,
    message: isJackpot ? `JACKPOT! ${prize.title}` : `You won: ${prize.title}`,
  };
}

/** Monte Carlo mean payout / stake. */
export function simulateRtp(
  catalog: PrizeEntry[],
  stakeLamports: number,
  trials: number,
  rng: () => number = Math.random,
  jackpotBalanceLamports = Math.floor((stakeLamports * 46) / 10),
  maxWinMultiplier = 2.5
): number {
  if (trials <= 0) return 0;
  let total = 0;
  for (let i = 0; i < trials; i++) {
    const d = resolveOutcome(catalog, {
      stakeLamports,
      maxWinMultiplier,
      jackpotBalanceLamports,
      rng,
    });
    total += d.awardedLamports;
  }
  return total / trials / stakeLamports;
}

/** Monte Carlo empirical win rate (should ≈ WIN_PROBABILITY). */
export function simulateWinRate(
  catalog: PrizeEntry[],
  trials: number,
  rng: () => number = Math.random
): number {
  if (trials <= 0) return 0;
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const d = resolveOutcome(catalog, {
      stakeLamports: DEFAULT_STAKE_LAMPORTS,
      maxWinMultiplier: 2.5,
      jackpotBalanceLamports: Math.floor((DEFAULT_STAKE_LAMPORTS * 46) / 10),
      rng,
    });
    if (d.outcome === "win") wins += 1;
  }
  return wins / trials;
}

export function defaultGameConfig(): GameConfig {
  return {
    priceLamports: DEFAULT_STAKE_LAMPORTS,
    clawPrice: 500,
    maxWinMultiplier: 2.5,
    jackpotBaseLamports: Math.floor((DEFAULT_STAKE_LAMPORTS * 46) / 10),
    jackpotContributionLamports: Math.floor(DEFAULT_STAKE_LAMPORTS / 20),
    machineEnabled: true,
  };
}
