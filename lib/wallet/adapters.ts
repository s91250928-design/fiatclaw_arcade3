/**
 * Explicit wallet adapters for the Connect modal list.
 * Phantom + Solflare only. WalletProvider's useStandardWalletAdapters merges
 * Wallet Standard and drops same-name legacy entries (avoids dual Phantom).
 * Construct only on the client (inside useMemo) — no window at module scope.
 */

import type { Adapter } from "@solana/wallet-adapter-base";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";

/** Display names expected in the modal / useWallet().wallets */
export const ARCADE_WALLET_NAMES = ["Phantom", "Solflare"] as const;

/**
 * Build the legacy adapter list passed to WalletProvider.
 * Exactly one Phantom + one Solflare — never register Phantom twice here.
 * When the extension registers Standard Phantom, WalletProvider filters this
 * legacy Phantom out and keeps the Standard adapter for connect.
 */
export function buildArcadeWalletAdapters(
  network: WalletAdapterNetwork = WalletAdapterNetwork.Devnet
): Adapter[] {
  return [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter({ network }),
  ];
}

/** Adapter display names in list order (for tests / UI markers). */
export function arcadeWalletAdapterNames(
  adapters: Adapter[] = buildArcadeWalletAdapters()
): string[] {
  return adapters.map((a) => String(a.name));
}
