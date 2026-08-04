/**
 * Shared game-domain types. Pure — no I/O, no env.
 */

export type RewardKind = "sol" | "claw" | "nft" | "mystery" | "jackpot";

export type LeaderboardWindow = "daily" | "weekly" | "all";

export interface PrizeEntry {
  id: string;
  code: string;
  kind: RewardKind;
  title: string;
  /** SOL-equivalent value in lamports (for EV / SOL prizes). */
  valueLamports: number;
  /** $CLAW token amount when kind is claw (or claw component of mystery). */
  clawAmount: number;
  weight: number;
  active: boolean;
  maxMultiplierCap: number;
  metadata?: Record<string, unknown>;
}

export interface DrawnPrize {
  prize: PrizeEntry | null;
  outcome: "win" | "lose";
  /** Actual awarded SOL-equivalent lamports (jackpot uses live pot). */
  awardedLamports: number;
  awardedClaw: number;
  isJackpot: boolean;
  message: string;
}

export interface PlayCreditsState {
  wallet: string;
  availablePlays: number;
  clawBalance: number;
  stakedClaw: number;
  solWonLamports: number;
  clawWon: number;
  totalPlays: number;
  wins: number;
  losses: number;
  biggestWinLamports: number;
}

export interface JackpotState {
  balanceLamports: number;
  baseLamports: number;
  contributionLamports: number;
  lastWonAt: string | null;
  lastWinnerWallet: string | null;
}

export interface GameConfig {
  /** Base price per play in lamports (SOL path). */
  priceLamports: number;
  /** $CLAW cost per play (before staking discount). */
  clawPrice: number;
  maxWinMultiplier: number;
  jackpotBaseLamports: number;
  jackpotContributionLamports: number;
  machineEnabled: boolean;
}

export interface StakeTier {
  minStaked: number;
  feeMultiplier: number;
  vip: boolean;
  label: string;
}

export interface ResolvedPlay {
  playId: string;
  wallet: string;
  outcome: "win" | "lose";
  prizeCode: string | null;
  prizeKind: RewardKind | null;
  prizeTitle: string | null;
  awardedLamports: number;
  awardedClaw: number;
  isJackpot: boolean;
  message: string;
  remainingPlays: number;
  jackpotBalanceLamports: number;
  createdAt: string;
}

export interface LeaderboardRow {
  wallet: string;
  totalPlays: number;
  wins: number;
  losses: number;
  solWonLamports: number;
  clawWon: number;
  biggestWinLamports: number;
}

export interface TransactionRecord {
  id: string;
  wallet: string;
  type:
    | "buy_sol"
    | "buy_claw"
    | "play"
    | "win"
    | "lose"
    | "stake"
    | "unstake"
    | "jackpot";
  amount: number;
  asset: "SOL" | "CLAW" | "PLAY" | "NFT" | "MYSTERY";
  meta?: Record<string, unknown>;
  createdAt: string;
}

export const LOSE_MESSAGE = "Better Luck Next Pull.";
