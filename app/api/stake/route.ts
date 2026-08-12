/**
 * Stake status + mutation API (Phase 1).
 *
 * GET  ?wallet=…  → server-owned stake status (staked, tier, fee, updated_at)
 * POST body       → never credits stake from amount / stakedAmount alone
 *
 * Staking never mutates WIN_PROBABILITY (see lib/game/staking.ts, prizes.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { getGameStore, STAKE_TIERS } from "@/lib/game";
import {
  evaluateStakeMutationRequest,
  mutationWouldCreditStake,
  type StakeMutationBody,
} from "@/lib/game/staking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, code = 400, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error: msg, credited: false, ...extra },
    { status: code }
  );
}

/** Server stake status — wallet from query only, never from forged body totals. */
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

/**
 * Phase 1 POST: reject spoof fields; never credit from amount.
 * Optional intent is logged without changing staked_amount.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as StakeMutationBody | null;
  const decision = evaluateStakeMutationRequest(body);

  if (!decision.ok) {
    return bad(decision.error, 400, {
      spoofAttempt: decision.spoofAttempt,
      wouldCredit: false,
    });
  }

  // Defense in depth — Phase 1 never credits
  if (mutationWouldCreditStake(decision)) {
    return bad("stake credit denied", 403, { wouldCredit: false });
  }

  const store = getGameStore();
  const before = store.getStakeStatus(decision.wallet);

  const recorded = store.recordStakeIntent({
    wallet: decision.wallet,
    action: decision.action,
    requestedAmount: decision.requestedAmount,
    txSignature: decision.txSignature,
    note: decision.reason,
  });

  const after = store.getStakeStatus(decision.wallet);

  // Prove no credit: staked must be unchanged
  if (after.stakedClaw !== before.stakedClaw) {
    return bad("internal error: unexpected stake change", 500);
  }

  return NextResponse.json({
    ok: true,
    credited: false,
    action: decision.action,
    requestedAmount: decision.requestedAmount,
    txSignature: decision.txSignature,
    reason: decision.reason,
    phase: 1,
    // Server status after no-op credit
    stakedClaw: after.stakedClaw,
    staked_amount: after.staked_amount,
    tier: after.tier,
    vip: after.vip,
    feeMultiplier: after.feeMultiplier,
    updated_at: after.updated_at,
    clawBalance: store.ensurePlayer(decision.wallet).clawBalance,
    affectsWinProbability: false,
    intentRecorded: recorded.ok,
  });
}
