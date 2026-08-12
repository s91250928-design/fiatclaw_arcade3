/**
 * In-memory game store — authoritative for V1 when Supabase tables are absent,
 * and the single persistence surface pure unit tests exercise via service helpers.
 * Process-local singleton; not durable across restarts.
 */

import {
  awardAndResetJackpot,
  contributeJackpot,
  createJackpotState,
  setJackpotConfig,
} from "./jackpot";
import { applyPlayToPlayerStats } from "./leaderboard";
import {
  addPlays,
  clawCost,
  consumePlay,
  creditClaw,
  debitClaw,
  solCostLamports,
} from "./plays";
import {
  defaultGameConfig,
  defaultPrizeCatalog,
  resolveOutcome,
} from "./prizes";
import { secureRandom } from "./rng";
import {
  buildStakeStatus,
  buildTermStakeFields,
  canCreditStakeFromPayment,
  feeMultiplierForStake,
  isAllowedTermDays,
  publicStakePositionDto,
  refreshPositionStatus,
  stakeClaw,
  STAKE_TIERS,
  tierForStake,
  unstakeClaw,
  validateStakeTiers,
  type StakePosition,
  type StakeStatusView,
  type StakeTermDays,
} from "./staking";
import type {
  GameConfig,
  JackpotState,
  PrizeEntry,
  ResolvedPlay,
  StakeTier,
  TransactionRecord,
} from "./types";
import { LOSE_MESSAGE } from "./types";

export interface PlayerRecord {
  wallet: string;
  availablePlays: number;
  clawBalance: number;
  stakedClaw: number;
  totalPlays: number;
  wins: number;
  losses: number;
  solWonLamports: number;
  clawWon: number;
  biggestWinLamports: number;
  createdAt: string;
  /** Last stake/balance mutation timestamp (ISO) — server-owned */
  updatedAt: string;
}

export interface AttemptRecord {
  id: string;
  wallet: string;
  status: "armed" | "resolved";
  createdAt: string;
  resolved?: ResolvedPlay;
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class GameStore {
  config: GameConfig;
  prizes: PrizeEntry[];
  jackpot: JackpotState;
  players = new Map<string, PlayerRecord>();
  attempts = new Map<string, AttemptRecord>();
  resolved: ResolvedPlay[] = [];
  transactions: TransactionRecord[] = [];
  consumedSignatures = new Set<string>();
  adminWallets: Set<string>;
  /**
   * VIP / fee tiers (admin-editable). NEVER mutates WIN_PROBABILITY / prizes.
   */
  stakeTiers: StakeTier[] = STAKE_TIERS.map((t) => ({ ...t }));
  /** Structured stake audit log lines (also mirrored in transactions). */
  stakeLogs: Array<{
    at: string;
    wallet: string;
    action: string;
    amount: number;
    txSignature: string | null;
    result: "ok" | "error" | "denied";
    detail: string;
    stakedClaw: number;
  }> = [];
  /** Term stake positions (transparent table). */
  stakePositions: StakePosition[] = [];

  constructor(opts?: {
    config?: GameConfig;
    prizes?: PrizeEntry[];
    adminWallets?: string[];
  }) {
    this.config = opts?.config ?? defaultGameConfig();
    this.prizes = opts?.prizes ?? defaultPrizeCatalog(this.config.priceLamports);
    this.jackpot = createJackpotState(
      this.config.jackpotBaseLamports,
      this.config.jackpotContributionLamports
    );
    this.adminWallets = new Set(opts?.adminWallets ?? []);
  }

  /** Resolve tier using store's admin-configurable table. */
  tierFor(stakedClaw: number): StakeTier {
    return tierForStake(stakedClaw, this.stakeTiers);
  }

  feeFor(stakedClaw: number): number {
    return feeMultiplierForStake(stakedClaw, this.stakeTiers);
  }

  logStake(entry: {
    wallet: string;
    action: string;
    amount: number;
    txSignature?: string | null;
    result: "ok" | "error" | "denied";
    detail: string;
    stakedClaw: number;
  }) {
    this.stakeLogs.push({
      at: new Date().toISOString(),
      wallet: entry.wallet,
      action: entry.action,
      amount: entry.amount,
      txSignature: entry.txSignature ?? null,
      result: entry.result,
      detail: entry.detail,
      stakedClaw: entry.stakedClaw,
    });
    if (this.stakeLogs.length > 2000) {
      this.stakeLogs = this.stakeLogs.slice(-1500);
    }
  }

  ensurePlayer(wallet: string): PlayerRecord {
    let p = this.players.get(wallet);
    if (!p) {
      const now = new Date().toISOString();
      p = {
        wallet,
        availablePlays: 0,
        clawBalance: 0,
        stakedClaw: 0,
        totalPlays: 0,
        wins: 0,
        losses: 0,
        solWonLamports: 0,
        clawWon: 0,
        biggestWinLamports: 0,
        createdAt: now,
        updatedAt: now,
      };
      this.players.set(wallet, p);
    } else if (!p.updatedAt) {
      p.updatedAt = p.createdAt;
    }
    return p;
  }

  getPlayerState(wallet: string) {
    const p = this.ensurePlayer(wallet);
    const tier = this.tierFor(p.stakedClaw);
    return {
      wallet: p.wallet,
      availablePlays: p.availablePlays,
      clawBalance: p.clawBalance,
      stakedClaw: p.stakedClaw,
      feeMultiplier: this.feeFor(p.stakedClaw),
      tier: tier.label,
      vip: tier.vip,
      totalPlays: p.totalPlays,
      wins: p.wins,
      losses: p.losses,
      solWonLamports: p.solWonLamports,
      clawWon: p.clawWon,
      biggestWinLamports: p.biggestWinLamports,
      jackpotBalanceLamports: this.jackpot.balanceLamports,
      priceLamports: this.config.priceLamports,
      clawPrice: this.config.clawPrice,
      machineEnabled: this.config.machineEnabled,
      updatedAt: p.updatedAt,
      /** Product rule: stake never changes win odds */
      affectsWinProbability: false as const,
    };
  }

  /** Server-owned stake status only — never from client body totals. */
  getStakeStatus(wallet: string): StakeStatusView {
    const p = this.ensurePlayer(wallet);
    return buildStakeStatus(p.wallet, p.stakedClaw, p.updatedAt, {
      stakeCreditEnabled: true,
      tiers: this.stakeTiers,
    });
  }

  listStakeHistory(wallet: string, limit = 50) {
    return this.transactions
      .filter(
        (t) =>
          t.wallet === wallet && (t.type === "stake" || t.type === "unstake")
      )
      .slice(-limit)
      .reverse()
      .map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        asset: t.asset,
        createdAt: t.createdAt,
        txSignature:
          (t.meta?.signature as string | undefined) ??
          (t.meta?.txSignature as string | undefined) ??
          null,
        credited: Boolean(t.meta?.credited),
        payout: t.meta?.payout ?? null,
        detail: t.meta?.note ?? t.meta?.phase ?? null,
        stakedClawAfter: t.meta?.stakedClaw ?? null,
      }));
  }

  getStakeTiers(): StakeTier[] {
    return this.stakeTiers.map((t) => ({ ...t }));
  }

  /**
   * Admin: update VIP fee table only. Does not touch prizes / WIN_PROBABILITY.
   */
  setStakeTiers(input: unknown) {
    const v = validateStakeTiers(input);
    if (!v.ok) return v;
    this.stakeTiers = v.tiers.map((t) => ({ ...t }));
    return { ok: true as const, tiers: this.getStakeTiers() };
  }

  /** Whether a stake/buy signature was already consumed (replay guard). */
  isSignatureUsed(signature: string): boolean {
    return this.consumedSignatures.has(signature);
  }

  /** Credit plays after verified SOL payment (signature anti-replay). */
  buyPlaysWithSol(wallet: string, plays: number, signature: string) {
    if (this.consumedSignatures.has(signature)) {
      return { ok: false as const, error: "payment already used" };
    }
    const mult = this.feeFor(this.ensurePlayer(wallet).stakedClaw);
    const expected = solCostLamports(plays, this.config.priceLamports, mult);
    if (plays < 1) return { ok: false as const, error: "invalid play count" };

    const p = this.ensurePlayer(wallet);
    const added = addPlays({ availablePlays: p.availablePlays }, plays);
    if (!added.ok) return { ok: false as const, error: added.error };

    this.consumedSignatures.add(signature);
    p.availablePlays = added.availablePlays;
    this.transactions.push({
      id: uid("tx"),
      wallet,
      type: "buy_sol",
      amount: expected,
      asset: "SOL",
      meta: { plays, signature },
      createdAt: new Date().toISOString(),
    });
    return {
      ok: true as const,
      availablePlays: p.availablePlays,
      costLamports: expected,
    };
  }

  /** Debit server-side $CLAW ledger and credit plays. */
  buyPlaysWithClaw(wallet: string, plays: number) {
    if (plays < 1) return { ok: false as const, error: "invalid play count" };
    const p = this.ensurePlayer(wallet);
    const mult = this.feeFor(p.stakedClaw);
    const cost = clawCost(plays, this.config.clawPrice, mult);
    const debited = debitClaw(p.clawBalance, cost);
    if (!debited.ok) return { ok: false as const, error: debited.error };

    const added = addPlays({ availablePlays: p.availablePlays }, plays);
    if (!added.ok) return { ok: false as const, error: added.error };

    p.clawBalance = debited.balance;
    p.availablePlays = added.availablePlays;
    this.transactions.push({
      id: uid("tx"),
      wallet,
      type: "buy_claw",
      amount: cost,
      asset: "CLAW",
      meta: { plays },
      createdAt: new Date().toISOString(),
    });
    return {
      ok: true as const,
      availablePlays: p.availablePlays,
      clawBalance: p.clawBalance,
      costClaw: cost,
    };
  }

  /** Dev/admin faucet for $CLAW when no on-chain mint is configured. */
  creditClawBalance(wallet: string, amount: number) {
    const p = this.ensurePlayer(wallet);
    p.clawBalance = creditClaw(p.clawBalance, amount);
    return { ok: true as const, clawBalance: p.clawBalance };
  }

  /**
   * Start attempt: consume exactly one play credit.
   * Returns attempt id for DROP/resolve.
   */
  startAttempt(wallet: string) {
    if (!this.config.machineEnabled) {
      return { ok: false as const, error: "machine disabled" };
    }
    const p = this.ensurePlayer(wallet);
    const consumed = consumePlay({ availablePlays: p.availablePlays });
    if (!consumed.ok) {
      return {
        ok: false as const,
        error: consumed.error,
        availablePlays: p.availablePlays,
      };
    }
    p.availablePlays = consumed.availablePlays;
    const id = uid("play");
    const attempt: AttemptRecord = {
      id,
      wallet,
      status: "armed",
      createdAt: new Date().toISOString(),
    };
    this.attempts.set(id, attempt);
    this.transactions.push({
      id: uid("tx"),
      wallet,
      type: "play",
      amount: 1,
      asset: "PLAY",
      meta: { playId: id },
      createdAt: attempt.createdAt,
    });
    return {
      ok: true as const,
      playId: id,
      availablePlays: p.availablePlays,
    };
  }

  /**
   * Resolve DROP: contribute jackpot, draw prize server-side, award, stats.
   * Never accepts client `won` flag.
   */
  resolveAttempt(playId: string, wallet: string, rng: () => number = secureRandom) {
    const attempt = this.attempts.get(playId);
    if (!attempt) return { ok: false as const, error: "play not found" };
    if (attempt.wallet !== wallet) return { ok: false as const, error: "wallet mismatch" };
    if (attempt.status === "resolved") {
      return {
        ok: true as const,
        alreadyResolved: true as const,
        result: attempt.resolved!,
      };
    }

    // Contribute first so this play funds the pot before jackpot draw.
    this.jackpot = contributeJackpot(this.jackpot);

    const drawn = resolveOutcome(this.prizes, {
      stakeLamports: this.config.priceLamports,
      maxWinMultiplier: this.config.maxWinMultiplier,
      jackpotBalanceLamports: this.jackpot.balanceLamports,
      rng,
    });

    let awardedLamports = drawn.awardedLamports;
    let awardedClaw = drawn.awardedClaw;
    let jackpotWon = false;

    if (drawn.outcome === "win" && drawn.isJackpot) {
      const jp = awardAndResetJackpot(this.jackpot, wallet);
      this.jackpot = jp.state;
      awardedLamports = jp.awarded;
      jackpotWon = true;
    }

    const p = this.ensurePlayer(wallet);
    if (drawn.outcome === "win") {
      if (awardedClaw > 0) p.clawBalance = creditClaw(p.clawBalance, awardedClaw);
      // SOL winnings tracked off-chain in player stats / winnings ledger.
    }

    const resolved: ResolvedPlay = {
      playId,
      wallet,
      outcome: drawn.outcome,
      prizeCode: drawn.prize?.code ?? null,
      prizeKind: drawn.prize && drawn.outcome === "win" ? drawn.prize.kind : null,
      prizeTitle: drawn.outcome === "win" ? drawn.prize?.title ?? null : null,
      awardedLamports: drawn.outcome === "win" ? awardedLamports : 0,
      awardedClaw: drawn.outcome === "win" ? awardedClaw : 0,
      isJackpot: jackpotWon,
      message: drawn.outcome === "lose" ? LOSE_MESSAGE : drawn.message,
      remainingPlays: p.availablePlays,
      jackpotBalanceLamports: this.jackpot.balanceLamports,
      createdAt: new Date().toISOString(),
    };

    const stats = applyPlayToPlayerStats(p, resolved);
    Object.assign(p, stats);

    attempt.status = "resolved";
    attempt.resolved = resolved;
    this.resolved.push(resolved);

    this.transactions.push({
      id: uid("tx"),
      wallet,
      type: drawn.outcome === "win" ? (jackpotWon ? "jackpot" : "win") : "lose",
      amount: awardedLamports || awardedClaw || 0,
      asset: drawn.prize?.kind === "claw" ? "CLAW" : drawn.prize?.kind === "nft" ? "NFT" : drawn.prize?.kind === "mystery" ? "MYSTERY" : "SOL",
      meta: {
        playId,
        prizeCode: resolved.prizeCode,
        message: resolved.message,
      },
      createdAt: resolved.createdAt,
    });

    return { ok: true as const, alreadyResolved: false as const, result: resolved };
  }

  /**
   * Internal ledger stake — NOT for public amount-only API (Phase 1).
   * Phase 2 will call only after verified on-chain tx.
   */
  stake(wallet: string, amount: number) {
    const p = this.ensurePlayer(wallet);
    const r = stakeClaw(p.clawBalance, p.stakedClaw, amount);
    if (!r.ok) return r;
    p.clawBalance = r.clawBalance;
    p.stakedClaw = r.stakedClaw;
    p.updatedAt = new Date().toISOString();
    this.transactions.push({
      id: uid("tx"),
      wallet,
      type: "stake",
      amount,
      asset: "CLAW",
      createdAt: p.updatedAt,
    });
    return {
      ok: true as const,
      clawBalance: p.clawBalance,
      stakedClaw: p.stakedClaw,
      tier: r.tier,
      feeMultiplier: r.tier.feeMultiplier,
    };
  }

  /**
   * Internal ledger unstake — NOT for public amount-only API (Phase 1).
   * Phase 2: controlled unstake request / service payout only.
   */
  unstake(wallet: string, amount: number) {
    const p = this.ensurePlayer(wallet);
    const r = unstakeClaw(p.clawBalance, p.stakedClaw, amount);
    if (!r.ok) return r;
    p.clawBalance = r.clawBalance;
    p.stakedClaw = r.stakedClaw;
    p.updatedAt = new Date().toISOString();
    this.transactions.push({
      id: uid("tx"),
      wallet,
      type: "unstake",
      amount,
      asset: "CLAW",
      createdAt: p.updatedAt,
    });
    return {
      ok: true as const,
      clawBalance: p.clawBalance,
      stakedClaw: p.stakedClaw,
      tier: r.tier,
      feeMultiplier: r.tier.feeMultiplier,
    };
  }

  /**
   * Record a non-crediting stake intent (audit). Never changes stakedClaw.
   */
  recordStakeIntent(opts: {
    wallet: string;
    action: "stake" | "unstake";
    requestedAmount: number | null;
    txSignature: string | null;
    note: string;
  }) {
    const p = this.ensurePlayer(opts.wallet);
    this.transactions.push({
      id: uid("tx"),
      wallet: opts.wallet,
      type: opts.action,
      amount: opts.requestedAmount ?? 0,
      asset: "CLAW",
      meta: {
        phase: 1,
        credited: false,
        txSignature: opts.txSignature,
        note: opts.note,
        stakedClaw: p.stakedClaw,
      },
      createdAt: new Date().toISOString(),
    });
    return {
      ok: true as const,
      credited: false as const,
      stakedClaw: p.stakedClaw,
      status: this.getStakeStatus(opts.wallet),
    };
  }

  /**
   * Phase 2: credit stake only after on-chain verify + unused signature.
   * Does NOT debit clawBalance — value is SOL paid to treasury.
   * Never trusts client stakedAmount; only server `amount` after canCreditStakeFromPayment.
   */
  creditStakeFromVerifiedTx(opts: {
    wallet: string;
    amount: number;
    signature: string;
    receivedLamports: bigint;
    /** Required for term position (7/30/90). Defaults 30 if missing for back-compat tests. */
    termDays?: number;
  }) {
    const gate = canCreditStakeFromPayment({
      verifyOk: true,
      signatureUnused: !this.consumedSignatures.has(opts.signature),
      amount: opts.amount,
      receivedLamports: opts.receivedLamports,
    });
    if (!gate.ok) {
      return { ok: false as const, error: gate.error };
    }

    const termRaw = opts.termDays ?? 30;
    if (!isAllowedTermDays(termRaw)) {
      return { ok: false as const, error: "invalid termDays" };
    }
    const termDays: StakeTermDays = termRaw;

    const p = this.ensurePlayer(opts.wallet);
    p.stakedClaw += opts.amount;
    p.updatedAt = new Date().toISOString();
    this.consumedSignatures.add(opts.signature);

    const fields = buildTermStakeFields({
      amount: opts.amount,
      termDays,
    });
    const position: StakePosition = {
      id: uid("stk"),
      wallet: opts.wallet,
      amount: opts.amount,
      termDays: fields.termDays,
      startedAt: fields.startedAt,
      endsAt: fields.endsAt,
      aprBps: fields.aprBps,
      apr: fields.apr,
      expectedPayout: fields.expectedPayout,
      expectedReward: fields.expectedReward,
      status: fields.status,
      txSignature: opts.signature,
    };
    this.stakePositions.push(position);

    const tier = this.tierFor(p.stakedClaw);
    this.transactions.push({
      id: uid("tx"),
      wallet: opts.wallet,
      type: "stake",
      amount: opts.amount,
      asset: "SOL",
      meta: {
        phase: 2,
        credited: true,
        signature: opts.signature,
        receivedLamports: String(opts.receivedLamports),
        stakedClaw: p.stakedClaw,
        positionId: position.id,
        termDays: position.termDays,
        expectedPayout: position.expectedPayout,
        aprBps: position.aprBps,
      },
      createdAt: p.updatedAt,
    });
    this.logStake({
      wallet: opts.wallet,
      action: "stake_credit",
      amount: opts.amount,
      txSignature: opts.signature,
      result: "ok",
      detail: `credited +${opts.amount} staked term=${termDays}d payout=${position.expectedPayout}`,
      stakedClaw: p.stakedClaw,
    });

    return {
      ok: true as const,
      credited: true as const,
      stakedClaw: p.stakedClaw,
      tier: tier.label,
      vip: tier.vip,
      feeMultiplier: tier.feeMultiplier,
      updated_at: p.updatedAt,
      clawBalance: p.clawBalance,
      position: publicStakePositionDto(position),
    };
  }

  /** Refresh active→completed for all positions; return public DTOs. */
  listStakePositions(opts?: {
    wallet?: string;
    status?: "active" | "completed" | "claimed" | "all";
    limit?: number;
  }) {
    const now = Date.now();
    this.stakePositions = this.stakePositions.map((p) =>
      refreshPositionStatus(p, now)
    );
    let list = this.stakePositions;
    if (opts?.wallet) {
      list = list.filter((p) => p.wallet === opts.wallet);
    }
    const status = opts?.status ?? "all";
    if (status !== "all") {
      list = list.filter((p) => p.status === status);
    }
    // Newest first
    list = [...list].sort(
      (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)
    );
    const limit = opts?.limit ?? 50;
    return list.slice(0, limit).map(publicStakePositionDto);
  }

  listActiveStakePositions(limit = 50) {
    return this.listStakePositions({ status: "active", limit });
  }

  listMyStakePositions(wallet: string, limit = 50) {
    return this.listStakePositions({ wallet, status: "all", limit });
  }

  /**
   * Phase 2 unstake request: reduce staked (VIP drops), do NOT mint claw.
   * Payout to user is a separate offline/service step (no treasury keys in browser).
   */
  requestUnstake(wallet: string, amount: number) {
    if (!Number.isInteger(amount) || amount < 1) {
      return { ok: false as const, error: "amount must be positive integer" };
    }
    const p = this.ensurePlayer(wallet);
    if (p.stakedClaw < amount) {
      return { ok: false as const, error: "insufficient staked amount" };
    }
    p.stakedClaw -= amount;
    p.updatedAt = new Date().toISOString();
    const tier = this.tierFor(p.stakedClaw);
    this.transactions.push({
      id: uid("tx"),
      wallet,
      type: "unstake",
      amount,
      asset: "CLAW",
      meta: {
        phase: 2,
        credited: false,
        clawMinted: false,
        payout: "pending_service",
        stakedClaw: p.stakedClaw,
      },
      createdAt: p.updatedAt,
    });
    this.logStake({
      wallet,
      action: "unstake_request",
      amount,
      result: "ok",
      detail: "unstake request — no claw mint",
      stakedClaw: p.stakedClaw,
    });
    return {
      ok: true as const,
      credited: false as const,
      unstaked: amount,
      stakedClaw: p.stakedClaw,
      tier: tier.label,
      vip: tier.vip,
      feeMultiplier: tier.feeMultiplier,
      updated_at: p.updatedAt,
      clawBalance: p.clawBalance,
      payoutStatus: "pending_service" as const,
    };
  }

  // ── Admin ────────────────────────────────────────────────────────────

  isAdmin(wallet: string): boolean {
    if (this.adminWallets.size === 0) {
      // Dev default: any wallet can admin when no list configured.
      return true;
    }
    return this.adminWallets.has(wallet);
  }

  listPrizes() {
    return [...this.prizes];
  }

  upsertPrize(prize: PrizeEntry) {
    const idx = this.prizes.findIndex((p) => p.id === prize.id || p.code === prize.code);
    if (idx >= 0) this.prizes[idx] = prize;
    else this.prizes.push(prize);
    return prize;
  }

  removePrize(idOrCode: string) {
    const before = this.prizes.length;
    this.prizes = this.prizes.filter((p) => p.id !== idOrCode && p.code !== idOrCode);
    return before !== this.prizes.length;
  }

  updateConfig(patch: Partial<GameConfig>) {
    // Only apply defined keys — never clobber with `undefined` from partial admin patches.
    const clean: Partial<GameConfig> = {};
    (Object.keys(patch) as (keyof GameConfig)[]).forEach((k) => {
      const v = patch[k];
      if (v !== undefined) {
        (clean as Record<string, unknown>)[k as string] = v;
      }
    });
    this.config = { ...this.config, ...clean };
    if (clean.jackpotBaseLamports != null || clean.jackpotContributionLamports != null) {
      this.jackpot = setJackpotConfig(this.jackpot, {
        baseLamports: clean.jackpotBaseLamports,
        contributionLamports: clean.jackpotContributionLamports,
      });
    }
    return this.config;
  }

  setMachineEnabled(enabled: boolean) {
    this.config.machineEnabled = enabled;
    return this.config.machineEnabled;
  }

  listPlayers() {
    return Array.from(this.players.values());
  }

  listTransactions(limit = 100) {
    return this.transactions.slice(-limit).reverse();
  }

  listStakeLogs(limit = 100) {
    return this.stakeLogs.slice(-limit).reverse();
  }

  listResolved() {
    return [...this.resolved];
  }
}

/** Process-wide singleton for API routes. */
const globalForGame = globalThis as unknown as { __clawGameStore?: GameStore };

export function getGameStore(): GameStore {
  if (!globalForGame.__clawGameStore) {
    const admins = (process.env.ADMIN_WALLETS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const store = new GameStore({ adminWallets: admins });
    // Seed demo $CLAW for empty wallets is done on first faucet call, not auto.
    globalForGame.__clawGameStore = store;
  }
  return globalForGame.__clawGameStore;
}

/** Test helper: fresh store, not the singleton. */
export function createTestStore(opts?: ConstructorParameters<typeof GameStore>[0]): GameStore {
  return new GameStore(opts);
}
