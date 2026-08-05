/**
 * Pure helpers for PC wallet connect after WalletModal select.
 * Modal only calls select(); with autoConnect=false we must connect() ourselves.
 * Same-name reselect is a no-op in WalletProvider — only modal-close triggers connect.
 */

export type ConnectAfterModalInput = {
  /** User opened the wallet modal this session (click path). */
  userOpenedModal: boolean;
  /** Previous render: modal visible */
  prevVisible: boolean;
  /** Current: modal visible */
  visible: boolean;
  /** A wallet adapter is selected (name in localStorage / context) */
  hasWallet: boolean;
  connected: boolean;
  connecting: boolean;
  /** A connect() promise is already in flight */
  inFlight: boolean;
};

/**
 * True when we should call connect() after the user closed the modal
 * having opened it intentionally, with a selected wallet and no active session.
 * Covers first select AND re-click of already-selected Phantom (select no-op).
 */
export function shouldConnectAfterModalClose(
  input: ConnectAfterModalInput
): boolean {
  if (!input.userOpenedModal) return false;
  // only on true → false transition
  if (!input.prevVisible || input.visible) return false;
  if (!input.hasWallet) return false;
  if (input.connected || input.connecting || input.inFlight) return false;
  return true;
}

export type ConnectResult =
  | { ok: true }
  | { ok: false; message: string };

/** Normalize connect() rejection into UI-safe message (shipped path). */
export function formatWalletConnectError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  return "Wallet connect failed. Unlock Phantom/Solflare and try again.";
}

/**
 * Run connect once; used by bridge and unit-tested with a mock connect fn.
 * Does not cancel mid-flight based on React effect cleanup flags.
 */
export async function runWalletConnect(
  connect: () => Promise<void>
): Promise<ConnectResult> {
  try {
    await connect();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: formatWalletConnectError(e) };
  }
}
