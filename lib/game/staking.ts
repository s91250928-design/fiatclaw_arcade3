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

// ── Term positions (transparent table) ───────────────────────────────────
/** Allowed lock periods (days). Client may only pick from this set. */
export const ALLOWED_TERM_DAYS = [7, 30, 90] as const;
export type StakeTermDays = (typeof ALLOWED_TERM_DAYS)[number];

/**
 * Server APR config (basis points). Client cannot override.
 * reward = floor(amount * aprBps/10000 * termDays/365)
 * expectedPayout = amount + reward
 */
export const STAKE_TERM_APR_BPS: Record<StakeTermDays, number> = {
  7: 800, // 8% APR
  30: 1200, // 12% APR
  90: 1800, // 18% APR
};

export type StakePositionStatus = "active" | "completed" | "claimed";

export type StakePosition = {
  id: string;
  wallet: string;
  amount: number;
  termDays: StakeTermDays;
  startedAt: string;
  endsAt: string;
  /** APR in basis points (server config at open) */
  aprBps: number;
  /** Human APR percent for UI (server-derived) */
  apr: number;
  /** Principal + reward (server formula only) */
  expectedPayout: number;
  /** Reward portion only */
  expectedReward: number;
  status: StakePositionStatus;
  txSignature: string;
};

/** Pure: reward for amount over termDays at aprBps (floor). */
export function computeStakeReward(
  amount: number,
  termDays: number,
  aprBps: number
): number {
  if (
    !Number.isInteger(amount) ||
    amount < 1 ||
    !Number.isInteger(termDays) ||
    termDays < 1 ||
    !Number.isFinite(aprBps) ||
    aprBps < 0
  ) {
    return 0;
  }
  // amount * (aprBps/10000) * (termDays/365)
  return Math.floor((amount * aprBps * termDays) / (10_000 * 365));
}

/** Pure: principal + reward. Never trust client expectedPayout. */
export function computeExpectedPayout(
  amount: number,
  termDays: number,
  aprBps: number
): { expectedReward: number; expectedPayout: number; apr: number } {
  const expectedReward = computeStakeReward(amount, termDays, aprBps);
  return {
    expectedReward,
    expectedPayout: amount + expectedReward,
    apr: aprBps / 100,
  };
}

export function isAllowedTermDays(n: number): n is StakeTermDays {
  return (ALLOWED_TERM_DAYS as readonly number[]).includes(n);
}

export function aprBpsForTerm(termDays: StakeTermDays): number {
  return STAKE_TERM_APR_BPS[termDays];
}

/** Build server-owned position fields (ids/timestamps injected by store). */
export function buildTermStakeFields(opts: {
  amount: number;
  termDays: StakeTermDays;
  startedAtMs?: number;
}): {
  termDays: StakeTermDays;
  aprBps: number;
  apr: number;
  expectedReward: number;
  expectedPayout: number;
  startedAt: string;
  endsAt: string;
  status: "active";
} {
  const startedAtMs = opts.startedAtMs ?? Date.now();
  const aprBps = aprBpsForTerm(opts.termDays);
  const pay = computeExpectedPayout(opts.amount, opts.termDays, aprBps);
  const endsAtMs = startedAtMs + opts.termDays * 24 * 60 * 60 * 1000;
  return {
    termDays: opts.termDays,
    aprBps,
    apr: pay.apr,
    expectedReward: pay.expectedReward,
    expectedPayout: pay.expectedPayout,
    startedAt: new Date(startedAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    status: "active",
  };
}

/** Refresh status: active → completed when now >= endsAt (claimed is manual). */
export function refreshPositionStatus(
  pos: StakePosition,
  nowMs: number = Date.now()
): StakePosition {
  if (pos.status === "claimed") return pos;
  const end = Date.parse(pos.endsAt);
  if (Number.isFinite(end) && nowMs >= end) {
    return { ...pos, status: "completed" };
  }
  return { ...pos, status: "active" };
}

export function publicStakePositionDto(pos: StakePosition) {
  return {
    id: pos.id,
    wallet: pos.wallet,
    amount: pos.amount,
    termDays: pos.termDays,
    startedAt: pos.startedAt,
    endsAt: pos.endsAt,
    apr: pos.apr,
    aprBps: pos.aprBps,
    expectedPayout: pos.expectedPayout,
    expectedReward: pos.expectedReward,
    status: pos.status,
    txSignature: pos.txSignature,
  };
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
  termDays?: unknown;
  stakedAmount?: unknown;
  staked_amount?: unknown;
  stakedClaw?: unknown;
  txSignature?: unknown;
  signature?: unknown;
  /** Spoof fields — always rejected */
  expectedPayout?: unknown;
  apr?: unknown;
  aprBps?: unknown;
  status?: unknown;
  startedAt?: unknown;
  endsAt?: unknown;
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
      /** Server-validated term for stake credit */
      termDays: StakeTermDays | null;
      txSignature: string | null;
      wouldCredit: boolean;
      needsOnChainVerify: boolean;
      isUnstakeRequest: boolean;
      reason: string;
    };

/**
 * Parse/validate stake POST body (no RPC).
 * - Rejects stakedAmount / expectedPayout / apr / status spoofs
 * - amount alone never credits
 * - stake + amount + termDays + txSignature → credit candidate after verify
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
    body.stakedClaw !== undefined ||
    body.expectedPayout !== undefined ||
    body.apr !== undefined ||
    body.aprBps !== undefined ||
    body.status !== undefined ||
    body.startedAt !== undefined ||
    body.endsAt !== undefined
  ) {
    return {
      ok: false,
      error:
        "client cannot set stakedAmount/expectedPayout/apr/status — server-owned",
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
    const termRaw = body.termDays;
    const termN = typeof termRaw === "number" ? termRaw : Number(termRaw);
    const termDays = isAllowedTermDays(termN) ? termN : null;

    if (!txSignature) {
      return {
        ok: true,
        wallet,
        action,
        requestedAmount: amt,
        termDays,
        txSignature: null,
        wouldCredit: false,
        needsOnChainVerify: false,
        isUnstakeRequest: false,
        reason:
          "stake credit requires on-chain txSignature — amount alone cannot credit stake",
      };
    }
    if (termDays == null) {
      return {
        ok: false,
        error: `termDays must be one of ${ALLOWED_TERM_DAYS.join(",")}`,
        spoofAttempt: false,
        wouldCredit: false,
        needsOnChainVerify: false,
        isUnstakeRequest: false,
      };
    }
    return {
      ok: true,
      wallet,
      action,
      requestedAmount: amt,
      termDays,
      txSignature,
      wouldCredit: true,
      needsOnChainVerify: true,
      isUnstakeRequest: false,
      reason: "stake candidate — credit only after treasury payment verified",
    };
  }

  return {
    ok: true,
    wallet,
    action,
    requestedAmount: amt,
    termDays: null,
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
