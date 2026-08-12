/**
 * $FIATCLAW / $CLAW staking: fee discounts + VIP flags only.
 *
 * CRITICAL: staking NEVER mutates WIN_PROBABILITY or prize weights.
 * WIN_PROBABILITY stays 0.2 server-side in prizes.ts only.
 *
 * Phase 1: public API must not credit stake from client amount alone.
 * Pure ledger helpers (stakeClaw/unstakeClaw) exist for Phase 2 after
 * on-chain verification — not for trusting body.stakedAmount / amount POSTs.
 */

import type { StakeTier } from "./types";

/**
 * Server-only VIP / fee table. Thresholds and multipliers are authoritative here —
 * never trust client-supplied feeMultiplier or tier.
 */
export const STAKE_TIERS: StakeTier[] = [
  { minStaked: 0, feeMultiplier: 1.0, vip: false, label: "Standard" },
  { minStaked: 1_000, feeMultiplier: 0.95, vip: false, label: "Bronze" },
  { minStaked: 5_000, feeMultiplier: 0.9, vip: true, label: "Silver VIP" },
  { minStaked: 25_000, feeMultiplier: 0.85, vip: true, label: "Gold VIP" },
  { minStaked: 100_000, feeMultiplier: 0.8, vip: true, label: "Diamond VIP" },
];

export function tierForStake(stakedClaw: number): StakeTier {
  let current = STAKE_TIERS[0]!;
  for (const t of STAKE_TIERS) {
    if (stakedClaw >= t.minStaked) current = t;
  }
  return current;
}

/** Fee multiplier in (0, 1] — multiplies play cost only. Never affects odds. */
export function feeMultiplierForStake(stakedClaw: number): number {
  return tierForStake(stakedClaw).feeMultiplier;
}

/** Public stake status snapshot — always derived from server staked amount. */
export type StakeStatusView = {
  wallet: string;
  stakedClaw: number;
  staked_amount: number;
  tier: string;
  vip: boolean;
  feeMultiplier: number;
  updated_at: string;
  /** Phase 1: on-chain credit not enabled */
  stakeCreditEnabled: false;
  /** Explicit product rule for clients */
  affectsWinProbability: false;
};

export function buildStakeStatus(
  wallet: string,
  stakedClaw: number,
  updatedAt: string
): StakeStatusView {
  const staked = Math.max(0, Math.floor(Number(stakedClaw) || 0));
  const tier = tierForStake(staked);
  return {
    wallet,
    stakedClaw: staked,
    staked_amount: staked,
    tier: tier.label,
    vip: tier.vip,
    feeMultiplier: tier.feeMultiplier,
    updated_at: updatedAt,
    stakeCreditEnabled: false,
    affectsWinProbability: false,
  };
}

// ── Public API mutation policy (Phase 1 anti-spoof) ─────────────────────

export type StakeMutationAction = "stake" | "unstake";

export type StakeMutationBody = {
  wallet?: unknown;
  action?: unknown;
  amount?: unknown;
  stakedAmount?: unknown;
  staked_amount?: unknown;
  stakedClaw?: unknown;
  txSignature?: unknown;
  signature?: unknown;
};

export type StakeMutationDecision =
  | {
      ok: false;
      error: string;
      /** True if body tried to set absolute staked balance */
      spoofAttempt: boolean;
      wouldCredit: false;
    }
  | {
      ok: true;
      wallet: string;
      action: StakeMutationAction;
      /** Requested amount if valid integer — informational only in Phase 1 */
      requestedAmount: number | null;
      txSignature: string | null;
      /**
       * Phase 1: always false. Phase 2 may set true after on-chain verify.
       * Never true from amount alone.
       */
      wouldCredit: false;
      reason: string;
    };

/**
 * Decide whether a POST body may credit stake.
 * Phase 1: never credits. Rejects absolute stakedAmount spoofs.
 * amount alone is never authority to change staked balance.
 */
export function evaluateStakeMutationRequest(
  body: StakeMutationBody | null | undefined
): StakeMutationDecision {
  if (!body || typeof body !== "object") {
    return {
      ok: false,
      error: "invalid body",
      spoofAttempt: false,
      wouldCredit: false,
    };
  }

  // Absolute balance spoof — never accept
  if (
    body.stakedAmount !== undefined ||
    body.staked_amount !== undefined ||
    body.stakedClaw !== undefined
  ) {
    return {
      ok: false,
      error:
        "stakedAmount/stakedClaw cannot be set by client — stake is server-owned",
      spoofAttempt: true,
      wouldCredit: false,
    };
  }

  const wallet = body.wallet;
  if (typeof wallet !== "string" || wallet.length < 32) {
    return {
      ok: false,
      error: "wallet required",
      spoofAttempt: false,
      wouldCredit: false,
    };
  }

  const action = body.action;
  if (action !== "stake" && action !== "unstake") {
    return {
      ok: false,
      error: "action must be stake or unstake",
      spoofAttempt: false,
      wouldCredit: false,
    };
  }

  let requestedAmount: number | null = null;
  if (body.amount !== undefined && body.amount !== null && body.amount !== "") {
    const amt = typeof body.amount === "number" ? body.amount : Number(body.amount);
    if (!Number.isInteger(amt) || amt < 1) {
      return {
        ok: false,
        error: "amount must be positive integer when provided",
        spoofAttempt: false,
        wouldCredit: false,
      };
    }
    requestedAmount = amt;
  }

  const txRaw = body.txSignature ?? body.signature;
  const txSignature =
    typeof txRaw === "string" && txRaw.trim().length >= 32
      ? txRaw.trim()
      : null;

  // Phase 1: never credit. Phase 2 will verify txSignature on-chain first.
  if (!txSignature) {
    return {
      ok: true,
      wallet,
      action,
      requestedAmount,
      txSignature: null,
      wouldCredit: false,
      reason:
        "Phase 1: stake credit requires on-chain tx (Phase 2). amount alone cannot credit stake.",
    };
  }

  return {
    ok: true,
    wallet,
    action,
    requestedAmount,
    txSignature,
    wouldCredit: false,
    reason:
      "Phase 1: tx verification not enabled yet — signature accepted as intent only, no credit.",
  };
}

/** True if a mutation decision would change staked balance (Phase 1 always false). */
export function mutationWouldCreditStake(
  decision: StakeMutationDecision
): boolean {
  return decision.ok === true && decision.wouldCredit === true;
}

export type StakeOpResult =
  | { ok: true; clawBalance: number; stakedClaw: number; tier: StakeTier }
  | { ok: false; error: string; clawBalance: number; stakedClaw: number };

/**
 * Pure internal ledger move (balance ↔ staked).
 * Phase 2+ only after verified tx — do NOT call from public API on bare amount.
 */
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

/**
 * Pure internal unstake ledger. Phase 2+ controlled path only —
 * not free client-driven balance mint.
 */
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
