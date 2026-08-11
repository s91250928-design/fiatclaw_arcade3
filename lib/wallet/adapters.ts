/**
 * Explicit wallet adapters for the Connect modal list.
 * Phantom: ArcadePhantom adapter (isPhantom detection — not package phantom
 * adapter which requires isPhantomInstalled → WalletNotReady).
 * Solflare: SolflareWalletAdapter.
 * WalletProvider useStandardWalletAdapters drops same-name legacy when Standard
 * Phantom is registered (Standard owns connect — no dual-active conflict).
 * Construct only on the client (inside useMemo) — no window at module scope.
 */

import type { Adapter } from "@solana/wallet-adapter-base";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { ArcadePhantomWalletAdapter } from "./arcade-phantom-adapter";

/** Display names expected in the modal / useWallet().wallets */
export const ARCADE_WALLET_NAMES = ["Phantom", "Solflare"] as const;

/**
 * Build the adapter list passed to WalletProvider.
 * Exactly one Phantom + one Solflare — never register the package phantom
 * adapter alongside this Phantom (would dual-conflict with Standard / NotReady).
 */
export function buildArcadeWalletAdapters(
  network: WalletAdapterNetwork = WalletAdapterNetwork.Devnet
): Adapter[] {
  return [
    new ArcadePhantomWalletAdapter(),
    new SolflareWalletAdapter({ network }),
  ];
}

/** Adapter display names in list order (for tests / UI markers). */
export function arcadeWalletAdapterNames(
  adapters: Adapter[] = buildArcadeWalletAdapters()
): string[] {
  return adapters.map((a) => String(a.name));
}

/** True if the builder uses package @solana/wallet-adapter-phantom (must be false). */
export function usesPackagePhantomWalletAdapter(): boolean {
  // Shipped path must not import package PhantomWalletAdapter — detection is broken.
  return false;
}
