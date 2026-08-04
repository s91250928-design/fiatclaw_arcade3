/**
 * Play-credit ledger rules (pure).
 * Available plays increase on buy; start attempt deducts exactly one.
 */

export interface CreditLedger {
  availablePlays: number;
}

export type CreditResult =
  | { ok: true; availablePlays: number }
  | { ok: false; error: string; availablePlays: number };

export function addPlays(state: CreditLedger, count: number): CreditResult {
  if (!Number.isFinite(count) || count <= 0 || !Number.isInteger(count)) {
    return {
      ok: false,
      error: "play count must be a positive integer",
      availablePlays: state.availablePlays,
    };
  }
  return { ok: true, availablePlays: state.availablePlays + count };
}

/**
 * Consume exactly one play for an attempt.
 * Rejects when plays are zero — never goes negative.
 */
export function consumePlay(state: CreditLedger): CreditResult {
  if (state.availablePlays < 1) {
    return {
      ok: false,
      error: "no plays available",
      availablePlays: state.availablePlays,
    };
  }
  return { ok: true, availablePlays: state.availablePlays - 1 };
}

/** SOL buy cost in lamports for N plays after fee multiplier (staking). */
export function solCostLamports(
  plays: number,
  basePriceLamports: number,
  feeMultiplier: number
): number {
  if (plays <= 0) return 0;
  const unit = Math.ceil(basePriceLamports * feeMultiplier);
  return unit * plays;
}

/** $CLAW cost for N plays after fee multiplier. */
export function clawCost(plays: number, baseClawPrice: number, feeMultiplier: number): number {
  if (plays <= 0) return 0;
  return Math.ceil(baseClawPrice * feeMultiplier) * plays;
}

export function canAffordClaw(balance: number, cost: number): boolean {
  return balance >= cost && cost > 0;
}

export function debitClaw(
  balance: number,
  cost: number
): { ok: true; balance: number } | { ok: false; error: string; balance: number } {
  if (cost <= 0) return { ok: false, error: "invalid cost", balance };
  if (balance < cost) return { ok: false, error: "insufficient $CLAW", balance };
  return { ok: true, balance: balance - cost };
}

export function creditClaw(balance: number, amount: number): number {
  if (amount <= 0) return balance;
  return balance + amount;
}
