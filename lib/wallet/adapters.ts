/**
 * Connect modal wallets: Phantom (official provider path adapter) + Solflare.
 * No package @solana/wallet-adapter-phantom (broken isPhantomInstalled gate).
 * WalletProvider Standard merge drops same-name Phantom when Standard registers —
 * bridge still runs official provider.connect() first for Phantom selects.
 * Client-only construction inside useMemo.
 */

import type { Adapter } from "@solana/wallet-adapter-base";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { ArcadePhantomWalletAdapter } from "./arcade-phantom-adapter";

/** Display names expected in the modal / useWallet().wallets */
export const ARCADE_WALLET_NAMES = ["Phantom", "Solflare"] as const;

/**
 * Exactly one Phantom + one Solflare.
 * Phantom uses docs.phantom.com getProvider + connect inside ArcadePhantomWalletAdapter.
 */
export function buildArcadeWalletAdapters(
  network: WalletAdapterNetwork = WalletAdapterNetwork.Devnet
): Adapter[] {
  return [
    new ArcadePhantomWalletAdapter(),
    new SolflareWalletAdapter({ network }),
  ];
}

export function arcadeWalletAdapterNames(
  adapters: Adapter[] = buildArcadeWalletAdapters()
): string[] {
  return adapters.map((a) => String(a.name));
}

/** Must stay false — package phantom adapter is not used. */
export function usesPackagePhantomWalletAdapter(): boolean {
  return false;
}
