/**
 * Stake status + term positions + mutation API.
 *
 * GET  ?wallet=…           → player status (+ history, my positions)
 * GET  ?view=table         → public active stakes table (no wallet required)
 * GET  ?view=terms         → allowed terms + APR config (server)
 * POST stake               → amount + termDays + txSignature → verify → position
 * POST unstake             → amount → request (no claw mint)
 *
 * Never trust body expectedPayout/apr/status/stakedAmount.
 * Staking never mutates WIN_PROBABILITY.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getGameStore,
  solLamportsForStakeAmount,
} from "@/lib/game";
import {
  ALLOWED_TERM_DAYS,
  STAKE_TERM_APR_BPS,
  evaluateStakeMutationRequest,
  MIN_STAKE_AMOUNT,
  MAX_STAKE_AMOUNT,
  computeExpectedPayout,
  aprBpsForTerm,
  type StakeMutationBody,
  type StakeTermDays,
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

function termsPayload() {
  return ALLOWED_TERM_DAYS.map((termDays) => {
    const aprBps = aprBpsForTerm(termDays);
    return {
      termDays,
      aprBps,
      apr: aprBps / 100,
    };
  });
}

export async function GET(req: NextRequest) {
  const view = req.nextUrl.searchParams.get("view");
  const ip = clientIp(req);
  const store = getGameStore();

  // Public active table — no wallet required
  if (view === "table" || view === "active") {
    const rl = stakeReadLimiter.check(`table|${ip}`);
    if (!rl.ok) {
      return bad("rate limit exceeded — try again shortly", 429, {
        retryAfterMs: rl.retryAfterMs,
      });
    }
    const limit = Math.min(
      100,
      Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 40) || 40)
    );
    return NextResponse.json({
      ok: true,
      positions: store.listActiveStakePositions(limit),
      terms: termsPayload(),
      affectsWinProbability: false,
    });
  }

  if (view === "terms") {
    return NextResponse.json({
      ok: true,
      terms: termsPayload(),
      allowedTermDays: [...ALLOWED_TERM_DAYS],
      aprBps: { ...STAKE_TERM_APR_BPS },
      // Preview formula helper constants only — server still computes on credit
      note: "expectedPayout = amount + floor(amount * aprBps/10000 * termDays/365)",
    });
  }

  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet || wallet.length < 32) {
    return bad("wallet required (or use view=table)");
  }

  const rl = stakeReadLimiter.check(rateKey(wallet, ip));
  if (!rl.ok) {
    return bad("rate limit exceeded — try again shortly", 429, {
      retryAfterMs: rl.retryAfterMs,
    });
  }

  const status = store.getStakeStatus(wallet);
  const wantHistory = req.nextUrl.searchParams.get("history") === "1";
  const history = wantHistory ? store.listStakeHistory(wallet, 40) : undefined;
  const myPositions = store.listMyStakePositions(wallet, 50);

  return NextResponse.json({
    ok: true,
    ...status,
    minStakeAmount: MIN_STAKE_AMOUNT,
    maxStakeAmount: MAX_STAKE_AMOUNT,
    terms: termsPayload(),
    allowedTermDays: [...ALLOWED_TERM_DAYS],
    tiers: store.getStakeTiers().map((t) => ({
      minStaked: t.minStaked,
      feeMultiplier: t.feeMultiplier,
      vip: t.vip,
      label: t.label,
    })),
    myPositions,
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
      myPositions: store.listMyStakePositions(decision.wallet, 50),
      history: store.listStakeHistory(decision.wallet, 10),
    });
  }

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
    return NextResponse.json({
      ok: true,
      credited: false,
      action: "stake",
      reason: decision.reason,
      error:
        "txSignature required — send SOL to treasury then POST signature + termDays",
      stakedClaw: before.stakedClaw,
      terms: termsPayload(),
      affectsWinProbability: false,
    });
  }

  const termDays = decision.termDays as StakeTermDays | null;
  if (termDays == null) {
    return bad(`termDays must be one of ${ALLOWED_TERM_DAYS.join(",")}`);
  }

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
    termDays,
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

  // Server preview of formula (already on position)
  const preview = computeExpectedPayout(
    decision.requestedAmount,
    termDays,
    aprBpsForTerm(termDays)
  );

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
    position: credited.position,
    expectedPayout: credited.position?.expectedPayout ?? preview.expectedPayout,
    affectsWinProbability: false,
    myPositions: store.listMyStakePositions(decision.wallet, 50),
    history: store.listStakeHistory(decision.wallet, 10),
  });
}
