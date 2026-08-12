/**
 * Stake status + mutation API (Phase 2).
 *
 * GET  ?wallet=… → server stake status (staked, tier, fee, updated_at)
 * POST stake     → wallet + amount + txSignature → verify SOL to treasury → credit
 * POST unstake   → wallet + amount → request (reduce staked, no claw mint)
 *
 * Never: body.stakedAmount → save. Never credit from amount alone.
 * Staking never mutates WIN_PROBABILITY.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getGameStore,
  STAKE_TIERS,
  solLamportsForStakeAmount,
} from "@/lib/game";
import {
  evaluateStakeMutationRequest,
  type StakeMutationBody,
} from "@/lib/game/staking";
import { verifySolPayment } from "@/lib/verify-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, code = 400, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error: msg, credited: false, ...extra },
    { status: code }
  );
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet || wallet.length < 32) {
    return bad("wallet required");
  }
  const store = getGameStore();
  const status = store.getStakeStatus(wallet);
  return NextResponse.json({
    ok: true,
    ...status,
    tiers: STAKE_TIERS.map((t) => ({
      minStaked: t.minStaked,
      feeMultiplier: t.feeMultiplier,
      vip: t.vip,
      label: t.label,
    })),
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

  const store = getGameStore();

  // ── Unstake request (no free claw mint) ─────────────────────────────
  if (decision.isUnstakeRequest) {
    const r = store.requestUnstake(decision.wallet, decision.requestedAmount);
    if (!r.ok) return bad(r.error);
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
      phase: 2,
    });
  }

  // ── Stake without signature: no credit ──────────────────────────────
  if (!decision.needsOnChainVerify || !decision.txSignature) {
    const before = store.getStakeStatus(decision.wallet);
    store.recordStakeIntent({
      wallet: decision.wallet,
      action: "stake",
      requestedAmount: decision.requestedAmount,
      txSignature: null,
      note: decision.reason,
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
      stakedClaw: after.stakedClaw,
      staked_amount: after.staked_amount,
      tier: after.tier,
      vip: after.vip,
      feeMultiplier: after.feeMultiplier,
      updated_at: after.updated_at,
      clawBalance: store.ensurePlayer(decision.wallet).clawBalance,
      affectsWinProbability: false,
      phase: 2,
      stakeLamportsPerUnit: after.stakeLamportsPerUnit,
    });
  }

  // ── Stake with txSignature: verify on-chain then credit ─────────────
  const minLamports = solLamportsForStakeAmount(decision.requestedAmount);
  if (minLamports <= 0n) {
    return bad("invalid stake amount");
  }

  if (store.isSignatureUsed(decision.txSignature)) {
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
    return bad(verified.error, verified.status ?? 400);
  }

  const credited = store.creditStakeFromVerifiedTx({
    wallet: decision.wallet,
    amount: decision.requestedAmount,
    signature: decision.txSignature,
    receivedLamports: verified.receivedLamports,
  });

  if (!credited.ok) {
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
    affectsWinProbability: false,
    phase: 2,
  });
}
