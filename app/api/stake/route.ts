/**
 * Stake status + mutation API (Phase 2–3).
 *
 * GET  ?wallet=… → server stake status (+ history when ?history=1)
 * POST stake     → wallet + amount + txSignature → verify SOL → credit
 * POST unstake   → wallet + amount → request (no claw mint)
 *
 * Rate-limited per wallet + IP. Never body.stakedAmount credit.
 * Staking never mutates WIN_PROBABILITY.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getGameStore,
  solLamportsForStakeAmount,
} from "@/lib/game";
import {
  evaluateStakeMutationRequest,
  MIN_STAKE_AMOUNT,
  MAX_STAKE_AMOUNT,
  type StakeMutationBody,
} from "@/lib/game/staking";
import {
  stakeMutationLimiter,
  stakeReadLimiter,
} from "@/lib/game/rate-limit";
import { verifySolPayment } from "@/lib/verify-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, code = 400, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error: msg, credited: false, ...extra },
    { status: code }
  );
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateKey(wallet: string, ip: string) {
  return `${wallet.slice(0, 16)}|${ip}`;
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet || wallet.length < 32) {
    return bad("wallet required");
  }

  const ip = clientIp(req);
  const rl = stakeReadLimiter.check(rateKey(wallet, ip));
  if (!rl.ok) {
    return bad("rate limit exceeded — try again shortly", 429, {
      retryAfterMs: rl.retryAfterMs,
    });
  }

  const store = getGameStore();
  const status = store.getStakeStatus(wallet);
  const wantHistory = req.nextUrl.searchParams.get("history") === "1";
  const history = wantHistory ? store.listStakeHistory(wallet, 40) : undefined;

  return NextResponse.json({
    ok: true,
    ...status,
    minStakeAmount: MIN_STAKE_AMOUNT,
    maxStakeAmount: MAX_STAKE_AMOUNT,
    tiers: store.getStakeTiers().map((t) => ({
      minStaked: t.minStaked,
      feeMultiplier: t.feeMultiplier,
      vip: t.vip,
      label: t.label,
    })),
    ...(history ? { history } : {}),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as StakeMutationBody | null;
  const decision = evaluateStakeMutationRequest(body);

  if (!decision.ok) {
    return bad(decision.error, 400, {
      spoofAttempt: decision.spoofAttempt,
      wouldCredit: false,
    });
  }

  const ip = clientIp(req);
  const rl = stakeMutationLimiter.check(rateKey(decision.wallet, ip));
  if (!rl.ok) {
    return bad("rate limit exceeded — slow down stake requests", 429, {
      retryAfterMs: rl.retryAfterMs,
    });
  }

  const store = getGameStore();

  // ── Unstake request ─────────────────────────────────────────────────
  if (decision.isUnstakeRequest) {
    const r = store.requestUnstake(decision.wallet, decision.requestedAmount);
    if (!r.ok) {
      store.logStake({
        wallet: decision.wallet,
        action: "unstake",
        amount: decision.requestedAmount,
        result: "error",
        detail: r.error,
        stakedClaw: store.ensurePlayer(decision.wallet).stakedClaw,
      });
      return bad(r.error);
    }
    return NextResponse.json({
      ok: true,
      action: "unstake",
      credited: false,
      clawMinted: false,
      unstaked: r.unstaked,
      stakedClaw: r.stakedClaw,
      staked_amount: r.stakedClaw,
      tier: r.tier,
      vip: r.vip,
      feeMultiplier: r.feeMultiplier,
      updated_at: r.updated_at,
      clawBalance: r.clawBalance,
      payoutStatus: r.payoutStatus,
      affectsWinProbability: false,
      phase: 3,
      history: store.listStakeHistory(decision.wallet, 10),
    });
  }

  // ── Stake without signature ─────────────────────────────────────────
  if (!decision.needsOnChainVerify || !decision.txSignature) {
    const before = store.getStakeStatus(decision.wallet);
    store.recordStakeIntent({
      wallet: decision.wallet,
      action: "stake",
      requestedAmount: decision.requestedAmount,
      txSignature: null,
      note: decision.reason,
    });
    store.logStake({
      wallet: decision.wallet,
      action: "stake_no_tx",
      amount: decision.requestedAmount,
      result: "denied",
      detail: decision.reason,
      stakedClaw: before.stakedClaw,
    });
    const after = store.getStakeStatus(decision.wallet);
    if (after.stakedClaw !== before.stakedClaw) {
      return bad("internal error: unexpected stake change", 500);
    }
    return NextResponse.json({
      ok: true,
      credited: false,
      action: "stake",
      reason: decision.reason,
      error:
        "txSignature required — send SOL to treasury then POST signature",
      stakedClaw: after.stakedClaw,
      staked_amount: after.staked_amount,
      tier: after.tier,
      vip: after.vip,
      feeMultiplier: after.feeMultiplier,
      updated_at: after.updated_at,
      clawBalance: store.ensurePlayer(decision.wallet).clawBalance,
      affectsWinProbability: false,
      phase: 3,
      stakeLamportsPerUnit: after.stakeLamportsPerUnit,
    });
  }

  // ── Stake with tx ───────────────────────────────────────────────────
  const minLamports = solLamportsForStakeAmount(decision.requestedAmount);
  if (minLamports <= 0n) {
    return bad("invalid stake amount");
  }

  if (store.isSignatureUsed(decision.txSignature)) {
    store.logStake({
      wallet: decision.wallet,
      action: "stake_replay",
      amount: decision.requestedAmount,
      txSignature: decision.txSignature,
      result: "denied",
      detail: "payment already used",
      stakedClaw: store.ensurePlayer(decision.wallet).stakedClaw,
    });
    return bad("payment already used", 409);
  }

  const verified = await verifySolPayment({
    wallet: decision.wallet,
    signature: decision.txSignature,
    minLamports,
  });

  if (!verified.ok) {
    store.recordStakeIntent({
      wallet: decision.wallet,
      action: "stake",
      requestedAmount: decision.requestedAmount,
      txSignature: decision.txSignature,
      note: `verify failed: ${verified.error}`,
    });
    store.logStake({
      wallet: decision.wallet,
      action: "stake_verify",
      amount: decision.requestedAmount,
      txSignature: decision.txSignature,
      result: "error",
      detail: verified.error,
      stakedClaw: store.ensurePlayer(decision.wallet).stakedClaw,
    });
    return bad(verified.error, verified.status ?? 400);
  }

  const credited = store.creditStakeFromVerifiedTx({
    wallet: decision.wallet,
    amount: decision.requestedAmount,
    signature: decision.txSignature,
    receivedLamports: verified.receivedLamports,
  });

  if (!credited.ok) {
    store.logStake({
      wallet: decision.wallet,
      action: "stake_credit",
      amount: decision.requestedAmount,
      txSignature: decision.txSignature,
      result: "error",
      detail: credited.error,
      stakedClaw: store.ensurePlayer(decision.wallet).stakedClaw,
    });
    return bad(credited.error, credited.error.includes("already") ? 409 : 400);
  }

  return NextResponse.json({
    ok: true,
    action: "stake",
    credited: true,
    stakedClaw: credited.stakedClaw,
    staked_amount: credited.stakedClaw,
    tier: credited.tier,
    vip: credited.vip,
    feeMultiplier: credited.feeMultiplier,
    updated_at: credited.updated_at,
    clawBalance: credited.clawBalance,
    receivedLamports: String(verified.receivedLamports),
    minLamportsRequired: String(minLamports),
    txSignature: decision.txSignature,
    affectsWinProbability: false,
    phase: 3,
    history: store.listStakeHistory(decision.wallet, 10),
  });
}
