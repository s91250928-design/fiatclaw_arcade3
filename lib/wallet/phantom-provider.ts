/**
 * Pure Phantom provider detection for PC Chrome extension.
 * Does NOT require window.isPhantomInstalled (broken/absent on many builds —
 * legacy PhantomWalletAdapter stays NotDetected → WalletNotReadyError).
 * No window access at module top-level for callers that pass a getter.
 */

export type PhantomSolanaProvider = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: { toBytes(): Uint8Array } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<unknown>;
  disconnect?: () => Promise<void>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type PhantomWindowLike = {
  phantom?: { solana?: PhantomSolanaProvider };
  solana?: PhantomSolanaProvider;
};

/** Resolve Phantom injected provider from a window-like object. */
export function resolvePhantomProvider(
  win: PhantomWindowLike | null | undefined
): PhantomSolanaProvider | null {
  if (!win) return null;
  const fromPhantom = win.phantom?.solana;
  if (fromPhantom?.isPhantom) return fromPhantom;
  const fromSolana = win.solana;
  if (fromSolana?.isPhantom) return fromSolana;
  return null;
}

/** Whether Phantom extension provider is present (ready to open popup). */
export function isPhantomProviderPresent(
  win: PhantomWindowLike | null | undefined
): boolean {
  return resolvePhantomProvider(win) != null;
}
