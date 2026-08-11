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
import { feeMultiplierForStake, stakeClaw, tierForStake, unstakeClaw } from "./staking";
import type {
  GameConfig,
  JackpotState,
  PrizeEntry,
  ResolvedPlay,
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

  ensurePlayer(wallet: string): PlayerRecord {
    let p = this.players.get(wallet);
    if (!p) {
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
        createdAt: new Date().toISOString(),
      };
      this.players.set(wallet, p);
    }
    return p;
  }

  getPlayerState(wallet: string) {
    const p = this.ensurePlayer(wallet);
    const tier = tierForStake(p.stakedClaw);
    return {
      wallet: p.wallet,
      availablePlays: p.availablePlays,
      clawBalance: p.clawBalance,
      stakedClaw: p.stakedClaw,
      feeMultiplier: feeMultiplierForStake(p.stakedClaw),
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
    };
  }

  /** Credit plays after verified SOL payment (signature anti-replay). */
  buyPlaysWithSol(wallet: string, plays: number, signature: string) {
    if (this.consumedSignatures.has(signature)) {
      return { ok: false as const, error: "payment already used" };
    }
    const mult = feeMultiplierForStake(this.ensurePlayer(wallet).stakedClaw);
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
    const mult = feeMultiplierForStake(p.stakedClaw);
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

  stake(wallet: string, amount: number) {
    const p = this.ensurePlayer(wallet);
    const r = stakeClaw(p.clawBalance, p.stakedClaw, amount);
    if (!r.ok) return r;
    p.clawBalance = r.clawBalance;
    p.stakedClaw = r.stakedClaw;
    this.transactions.push({
      id: uid("tx"),
      wallet,
      type: "stake",
      amount,
      asset: "CLAW",
      createdAt: new Date().toISOString(),
    });
    return {
      ok: true as const,
      clawBalance: p.clawBalance,
      stakedClaw: p.stakedClaw,
      tier: r.tier,
      feeMultiplier: r.tier.feeMultiplier,
    };
  }

  unstake(wallet: string, amount: number) {
    const p = this.ensurePlayer(wallet);
    const r = unstakeClaw(p.clawBalance, p.stakedClaw, amount);
    if (!r.ok) return r;
    p.clawBalance = r.clawBalance;
    p.stakedClaw = r.stakedClaw;
    this.transactions.push({
      id: uid("tx"),
      wallet,
      type: "unstake",
      amount,
      asset: "CLAW",
      createdAt: new Date().toISOString(),
    });
    return {
      ok: true as const,
      clawBalance: p.clawBalance,
      stakedClaw: p.stakedClaw,
      tier: r.tier,
      feeMultiplier: r.tier.feeMultiplier,
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
