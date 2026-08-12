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

export function tierForStake(
  stakedClaw: number,
  tiers: StakeTier[] = STAKE_TIERS
): StakeTier {
  const table = tiers.length > 0 ? tiers : STAKE_TIERS;
  let current = table[0]!;
  for (const t of table) {
    if (stakedClaw >= t.minStaked) current = t;
  }
  return current;
}

/** Fee multiplier in (0, 1] — multiplies play cost only. Never affects odds. */
export function feeMultiplierForStake(
  stakedClaw: number,
  tiers: StakeTier[] = STAKE_TIERS
): number {
  return tierForStake(stakedClaw, tiers).feeMultiplier;
}

/**
 * Validate admin VIP/fee table. Does NOT touch WIN_PROBABILITY / prizes.
 * feeMultiplier must be in (0, 1]; minStaked non-negative sorted unique-ish.
 */
export function validateStakeTiers(
  input: unknown
): { ok: true; tiers: StakeTier[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length < 1) {
    return { ok: false, error: "tiers must be a non-empty array" };
  }
  const tiers: StakeTier[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "invalid tier entry" };
    }
    const r = raw as Record<string, unknown>;
    const minStaked = Number(r.minStaked);
    const feeMultiplier = Number(r.feeMultiplier);
    const label = String(r.label ?? "").trim();
    const vip = Boolean(r.vip);
    if (!Number.isFinite(minStaked) || minStaked < 0 || !Number.isInteger(minStaked)) {
      return { ok: false, error: "minStaked must be non-negative integer" };
    }
    if (
      !Number.isFinite(feeMultiplier) ||
      feeMultiplier <= 0 ||
      feeMultiplier > 1
    ) {
      return { ok: false, error: "feeMultiplier must be in (0, 1]" };
    }
    if (!label || label.length > 40) {
      return { ok: false, error: "label required (max 40 chars)" };
    }
    tiers.push({ minStaked, feeMultiplier, vip, label });
  }
  tiers.sort((a, b) => a.minStaked - b.minStaked);
  if (tiers[0]!.minStaked !== 0) {
    return { ok: false, error: "first tier must have minStaked 0" };
  }
  return { ok: true, tiers };
}

// ── SOL pricing for on-chain stake (server-only) ─────────────────────────
/**
 * Lamports required per stake unit (server config).
 * Client may estimate; server re-checks after getTransaction.
 * Override with STAKE_LAMPORTS_PER_UNIT env on server only (not trusted from client).
 */
export const STAKE_LAMPORTS_PER_UNIT = Math.max(
  1,
  Number(
    typeof process !== "undefined" && process.env?.STAKE_LAMPORTS_PER_UNIT
      ? process.env.STAKE_LAMPORTS_PER_UNIT
      : "10000"
  ) || 10_000
);

export const MIN_STAKE_AMOUNT = 1;
export const MAX_STAKE_AMOUNT = 10_000_000;

/** Server-authoritative SOL cost for staking `amount` units. */
export function solLamportsForStakeAmount(amount: number): bigint {
  if (!Number.isInteger(amount) || amount < MIN_STAKE_AMOUNT) return 0n;
  return BigInt(amount) * BigInt(STAKE_LAMPORTS_PER_UNIT);
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
  /** Phase 2: on-chain stake credit enabled when treasury configured */
  stakeCreditEnabled: boolean;
  /** Explicit product rule for clients */
  affectsWinProbability: false;
  /** Lamports per stake unit (server) for client estimate */
  stakeLamportsPerUnit: number;
};

export function buildStakeStatus(
  wallet: string,
  stakedClaw: number,
  updatedAt: string,
  opts?: { stakeCreditEnabled?: boolean; tiers?: StakeTier[] }
): StakeStatusView {
  const staked = Math.max(0, Math.floor(Number(stakedClaw) || 0));
  const tier = tierForStake(staked, opts?.tiers);
  return {
    wallet,
    stakedClaw: staked,
    staked_amount: staked,
    tier: tier.label,
    vip: tier.vip,
    feeMultiplier: tier.feeMultiplier,
    updated_at: updatedAt,
    stakeCreditEnabled: opts?.stakeCreditEnabled ?? true,
    affectsWinProbability: false,
    stakeLamportsPerUnit: STAKE_LAMPORTS_PER_UNIT,
  };
}

// ── Public API mutation policy (Phase 1 anti-spoof + Phase 2 gates) ─────

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
      spoofAttempt: boolean;
      wouldCredit: false;
      needsOnChainVerify: false;
      isUnstakeRequest: false;
    }
  | {
      ok: true;
      wallet: string;
      action: StakeMutationAction;
      requestedAmount: number;
      txSignature: string | null;
      /**
       * Stake credit candidate — only after on-chain verify (Phase 2).
       * Never true from amount alone.
       */
      wouldCredit: boolean;
      needsOnChainVerify: boolean;
      /** Unstake request (no free claw mint) */
      isUnstakeRequest: boolean;
      reason: string;
    };

/**
 * Parse/validate stake POST body (no RPC).
 * - Rejects absolute stakedAmount spoofs
 * - amount alone never credits
 * - stake + amount + txSignature → candidate for on-chain credit (verify separately)
 * - unstake + amount → unstake request path (no claw mint)
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
      needsOnChainVerify: false,
      isUnstakeRequest: false,
    };
  }

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
      needsOnChainVerify: false,
      isUnstakeRequest: false,
    };
  }

  const wallet = body.wallet;
  if (typeof wallet !== "string" || wallet.length < 32) {
    return {
      ok: false,
      error: "wallet required",
      spoofAttempt: false,
      wouldCredit: false,
      needsOnChainVerify: false,
      isUnstakeRequest: false,
    };
  }

  const action = body.action;
  if (action !== "stake" && action !== "unstake") {
    return {
      ok: false,
      error: "action must be stake or unstake",
      spoofAttempt: false,
      wouldCredit: false,
      needsOnChainVerify: false,
      isUnstakeRequest: false,
    };
  }

  const amtRaw = body.amount;
  const amt = typeof amtRaw === "number" ? amtRaw : Number(amtRaw);
  if (!Number.isInteger(amt) || amt < MIN_STAKE_AMOUNT || amt > MAX_STAKE_AMOUNT) {
    return {
      ok: false,
      error: `amount must be integer ${MIN_STAKE_AMOUNT}–${MAX_STAKE_AMOUNT}`,
      spoofAttempt: false,
      wouldCredit: false,
      needsOnChainVerify: false,
      isUnstakeRequest: false,
    };
  }

  const txRaw = body.txSignature ?? body.signature;
  const txSignature =
    typeof txRaw === "string" && txRaw.trim().length >= 32
      ? txRaw.trim()
      : null;

  if (action === "stake") {
    if (!txSignature) {
      return {
        ok: true,
        wallet,
        action,
        requestedAmount: amt,
        txSignature: null,
        wouldCredit: false,
        needsOnChainVerify: false,
        isUnstakeRequest: false,
        reason:
          "stake credit requires on-chain txSignature — amount alone cannot credit stake",
      };
    }
    return {
      ok: true,
      wallet,
      action,
      requestedAmount: amt,
      txSignature,
      wouldCredit: true, // only after verifySolPayment succeeds
      needsOnChainVerify: true,
      isUnstakeRequest: false,
      reason: "stake candidate — credit only after treasury payment verified",
    };
  }

  // unstake: request path (reduce staked, no claw mint, no free payout)
  return {
    ok: true,
    wallet,
    action,
    requestedAmount: amt,
    txSignature,
    wouldCredit: false,
    needsOnChainVerify: false,
    isUnstakeRequest: true,
    reason:
      "unstake request — decreases staked (VIP) without minting claw; payout is separate service",
  };
}

/** True if decision is a stake credit candidate (still needs on-chain verify). */
export function mutationWouldCreditStake(
  decision: StakeMutationDecision
): boolean {
  return decision.ok === true && decision.wouldCredit === true;
}

/** Pure gate: credit only when verify ok + unique signature + amount valid. */
export function canCreditStakeFromPayment(opts: {
  verifyOk: boolean;
  signatureUnused: boolean;
  amount: number;
  receivedLamports: bigint;
}): { ok: true } | { ok: false; error: string } {
  if (!opts.verifyOk) return { ok: false, error: "payment verification failed" };
  if (!opts.signatureUnused) return { ok: false, error: "payment already used" };
  if (
    !Number.isInteger(opts.amount) ||
    opts.amount < MIN_STAKE_AMOUNT ||
    opts.amount > MAX_STAKE_AMOUNT
  ) {
    return { ok: false, error: "invalid stake amount" };
  }
  const required = solLamportsForStakeAmount(opts.amount);
  if (opts.receivedLamports < required) {
    return { ok: false, error: "insufficient payment amount for stake" };
  }
  return { ok: true };
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
