/**
 * Progressive jackpot: contribute on every play, reset after jackpot win.
 */

import type { JackpotState } from "./types";

export function createJackpotState(
  baseLamports: number,
  contributionLamports: number
): JackpotState {
  return {
    balanceLamports: baseLamports,
    baseLamports,
    contributionLamports,
    lastWonAt: null,
    lastWinnerWallet: null,
  };
}

/** Every play adds the configured contribution to the live pot. */
export function contributeJackpot(state: JackpotState): JackpotState {
  return {
    ...state,
    balanceLamports: state.balanceLamports + state.contributionLamports,
  };
}

/**
 * Award current pot to winner and reset to base.
 * Returns awarded amount and new state.
 */
export function awardAndResetJackpot(
  state: JackpotState,
  winnerWallet: string,
  at: string = new Date().toISOString()
): { awarded: number; state: JackpotState } {
  const awarded = state.balanceLamports;
  return {
    awarded,
    state: {
      ...state,
      balanceLamports: state.baseLamports,
      lastWonAt: at,
      lastWinnerWallet: winnerWallet,
    },
  };
}

export function setJackpotConfig(
  state: JackpotState,
  patch: { baseLamports?: number; contributionLamports?: number; balanceLamports?: number }
): JackpotState {
  const next = { ...state };
  if (patch.baseLamports != null && patch.baseLamports > 0) {
    next.baseLamports = patch.baseLamports;
  }
  if (patch.contributionLamports != null && patch.contributionLamports >= 0) {
    next.contributionLamports = patch.contributionLamports;
  }
  if (patch.balanceLamports != null && patch.balanceLamports >= 0) {
    next.balanceLamports = patch.balanceLamports;
  }
  return next;
}
