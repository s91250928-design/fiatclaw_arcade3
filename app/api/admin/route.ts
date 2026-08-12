/**
 * Admin panel API: rewards CRUD, cost/jackpot config, machine toggle,
 * player stats, transactions.
 */

import { NextRequest, NextResponse } from "next/server";
import { getGameStore, type PrizeEntry, type RewardKind } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

function authorize(req: NextRequest, bodyWallet?: string): string | null {
  const header = req.headers.get("x-admin-wallet") ?? bodyWallet ?? "";
  if (!header || header.length < 32) return null;
  const store = getGameStore();
  if (!store.isAdmin(header)) return null;
  return header;
}

export async function GET(req: NextRequest) {
  const wallet = authorize(req);
  if (!wallet) return bad("admin wallet required", 401);

  const store = getGameStore();
  const view = req.nextUrl.searchParams.get("view") ?? "overview";

  if (view === "prizes") {
    return NextResponse.json({ ok: true, prizes: store.listPrizes() });
  }
  if (view === "players") {
    return NextResponse.json({ ok: true, players: store.listPlayers() });
  }
  if (view === "transactions") {
    return NextResponse.json({ ok: true, transactions: store.listTransactions(200) });
  }
  if (view === "config") {
    return NextResponse.json({
      ok: true,
      config: store.config,
      jackpot: store.jackpot,
    });
  }
  if (view === "stake") {
    return NextResponse.json({
      ok: true,
      // VIP fee table only — does not include WIN_PROBABILITY / prize weights
      tiers: store.getStakeTiers(),
      stakeLogs: store.listStakeLogs(100),
      note: "staking never mutates WIN_PROBABILITY",
    });
  }

  return NextResponse.json({
    ok: true,
    config: store.config,
    jackpot: store.jackpot,
    prizeCount: store.listPrizes().length,
    playerCount: store.listPlayers().length,
    transactionCount: store.transactions.length,
    resolvedCount: store.resolved.length,
    stakeTiers: store.getStakeTiers(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("invalid body");

  const adminWallet = authorize(req, (body as { adminWallet?: string }).adminWallet);
  if (!adminWallet) return bad("admin wallet required", 401);

  const store = getGameStore();
  const action = (body as { action?: string }).action;

  switch (action) {
    case "upsert_prize": {
      const p = (body as { prize?: Partial<PrizeEntry> }).prize;
      if (!p?.code || !p?.kind || !p?.title) return bad("prize.code, kind, title required");
      const kinds: RewardKind[] = ["sol", "claw", "nft", "mystery", "jackpot"];
      if (!kinds.includes(p.kind as RewardKind)) return bad("invalid kind");
      const prize: PrizeEntry = {
        id: p.id ?? `prize-${p.code}`,
        code: p.code,
        kind: p.kind as RewardKind,
        title: p.title,
        valueLamports: Number(p.valueLamports ?? 0),
        clawAmount: Number(p.clawAmount ?? 0),
        weight: Number(p.weight ?? 1),
        active: p.active !== false,
        maxMultiplierCap: Number(p.maxMultiplierCap ?? 2.5),
        metadata: p.metadata ?? {},
      };
      store.upsertPrize(prize);
      return NextResponse.json({ ok: true, prize });
    }
    case "remove_prize": {
      const id = (body as { id?: string }).id;
      if (!id) return bad("id required");
      const removed = store.removePrize(id);
      return NextResponse.json({ ok: true, removed });
    }
    case "update_config": {
      const patch = (body as { config?: Record<string, unknown> }).config ?? {};
      const cfg: Record<string, number | boolean> = {};
      if (patch.priceLamports != null) cfg.priceLamports = Number(patch.priceLamports);
      if (patch.clawPrice != null) cfg.clawPrice = Number(patch.clawPrice);
      if (patch.maxWinMultiplier != null) {
        cfg.maxWinMultiplier = Number(patch.maxWinMultiplier);
      }
      if (patch.jackpotBaseLamports != null) {
        cfg.jackpotBaseLamports = Number(patch.jackpotBaseLamports);
      }
      if (patch.jackpotContributionLamports != null) {
        cfg.jackpotContributionLamports = Number(patch.jackpotContributionLamports);
      }
      if (patch.machineEnabled != null) {
        cfg.machineEnabled = Boolean(patch.machineEnabled);
      }
      const next = store.updateConfig(cfg);
      return NextResponse.json({ ok: true, config: next, jackpot: store.jackpot });
    }
    case "set_machine": {
      const enabled = Boolean((body as { enabled?: boolean }).enabled);
      store.setMachineEnabled(enabled);
      return NextResponse.json({ ok: true, machineEnabled: enabled });
    }
    case "update_stake_tiers": {
      // Admin VIP / fee table only — never touches prize weights or WIN_PROBABILITY
      const tiers = (body as { tiers?: unknown }).tiers;
      const r = store.setStakeTiers(tiers);
      if (!r.ok) return bad(r.error);
      return NextResponse.json({
        ok: true,
        tiers: r.tiers,
        affectsWinProbability: false,
      });
    }
    default:
      return bad("unknown action");
  }
}
