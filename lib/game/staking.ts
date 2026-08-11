/**
 * $CLAW staking: fee discounts + VIP flags only.
 * MUST NOT touch win probability or prize weights.
 */

import type { StakeTier } from "./types";

export const STAKE_TIERS: StakeTier[] = [
  { minStaked: 0, feeMultiplier: 1.0, vip: false, label: "Standard" },
  { minStaked: 1_000, feeMultiplier: 0.95, vip: false, label: "Bronze" },
  { minStaked: 5_000, feeMultiplier: 0.9, vip: true, label: "Silver VIP" },
  { minStaked: 25_000, feeMultiplier: 0.85, vip: true, label: "Gold VIP" },
  { minStaked: 100_000, feeMultiplier: 0.8, vip: true, label: "Diamond VIP" },
];

export function tierForStake(stakedClaw: number): StakeTier {
  let current = STAKE_TIERS[0];
  for (const t of STAKE_TIERS) {
    if (stakedClaw >= t.minStaked) current = t;
  }
  return current;
}

/** Fee multiplier in (0, 1] — multiplies play cost only. */
export function feeMultiplierForStake(stakedClaw: number): number {
  return tierForStake(stakedClaw).feeMultiplier;
}

export type StakeOpResult =
  | { ok: true; clawBalance: number; stakedClaw: number; tier: StakeTier }
  | { ok: false; error: string; clawBalance: number; stakedClaw: number };

export function stakeClaw(
  clawBalance: number,
  stakedClaw: number,
  amount: number
): StakeOpResult {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return {
      ok: false,
      error: "stake amount must be a positive integer",
      clawBalance,
      stakedClaw,
    };
  }
  if (clawBalance < amount) {
    return {
      ok: false,
      error: "insufficient $CLAW to stake",
      clawBalance,
      stakedClaw,
    };
  }
  const nextBalance = clawBalance - amount;
  const nextStaked = stakedClaw + amount;
  return {
    ok: true,
    clawBalance: nextBalance,
    stakedClaw: nextStaked,
    tier: tierForStake(nextStaked),
  };
}

export function unstakeClaw(
  clawBalance: number,
  stakedClaw: number,
  amount: number
): StakeOpResult {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return {
      ok: false,
      error: "unstake amount must be a positive integer",
      clawBalance,
      stakedClaw,
    };
  }
  if (stakedClaw < amount) {
    return {
      ok: false,
      error: "insufficient staked $CLAW",
      clawBalance,
      stakedClaw,
    };
  }
  const nextStaked = stakedClaw - amount;
  const nextBalance = clawBalance + amount;
  return {
    ok: true,
    clawBalance: nextBalance,
    stakedClaw: nextStaked,
    tier: tierForStake(nextStaked),
  };
}
