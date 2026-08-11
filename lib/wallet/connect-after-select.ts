/**
 * Pure helpers for PC wallet connect after WalletModal select.
 * Modal only select()s; autoConnect=false → we connect() after modal close.
 * Phantom: official docs path (wait inject → provider.connect()).
 * Solflare: ready-gate Installed|Loadable then adapter.connect().
 */

import {
  isWalletReadyForConnect,
  waitForWalletReady,
  type WaitForReadyOptions,
  type WalletReadyStateName,
} from "./ready";
import {
  connectPhantomOfficial,
  PHANTOM_INSTALL_MESSAGE,
  type PhantomWindowLike,
  type WaitProviderOptions,
} from "./phantom-official";

export type ConnectAfterModalInput = {
  userOpenedModal: boolean;
  prevVisible: boolean;
  visible: boolean;
  hasWallet: boolean;
  connected: boolean;
  connecting: boolean;
  inFlight: boolean;
};

export function shouldConnectAfterModalClose(
  input: ConnectAfterModalInput
): boolean {
  if (!input.userOpenedModal) return false;
  if (!input.prevVisible || input.visible) return false;
  if (!input.hasWallet) return false;
  if (input.connected || input.connecting || input.inFlight) return false;
  return true;
}

export type ConnectResult =
  | { ok: true }
  | { ok: false; message: string };

export function formatWalletConnectError(e: unknown): string {
  if (e instanceof Error) {
    const name = e.name || "";
    const msg = e.message || "";
    if (
      /install phantom/i.test(msg) ||
      msg.includes("https://phantom.app")
    ) {
      return msg.includes("https://phantom.app")
        ? msg
        : PHANTOM_INSTALL_MESSAGE;
    }
    if (
      name === "WalletNotReadyError" ||
      /not ready|WalletNotReady/i.test(msg)
    ) {
      // Never surface raw WalletNotReadyError — guide to install/unlock
      return PHANTOM_INSTALL_MESSAGE;
    }
    if (
      name === "WalletConnectionError" ||
      /WalletConnectionError|connection error|User rejected/i.test(msg)
    ) {
      return msg || "Wallet connection failed. Approve the request in Phantom/Solflare.";
    }
    if (msg) return msg;
  }
  if (typeof e === "string" && e.trim()) return e;
  return "Wallet connect failed. Unlock Phantom/Solflare and try again.";
}

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

export async function runWalletConnectWhenReady(
  connect: () => Promise<void>,
  getReadyState: () => WalletReadyStateName | null | undefined,
  opts?: WaitForReadyOptions
): Promise<ConnectResult> {
  if (!isWalletReadyForConnect(getReadyState())) {
    const wait = await waitForWalletReady(getReadyState, opts);
    if (!wait.ready) {
      return { ok: false, message: wait.message };
    }
  }
  return runWalletConnect(connect);
}

/**
 * Official Phantom connect (docs), then sync wallet-adapter UI via adapter.connect().
 * Opens extension popup via provider.connect(); does not throw WalletNotReadyError.
 */
export async function runPhantomOfficialConnect(
  getWin: () => PhantomWindowLike | null | undefined,
  syncAdapterConnect: () => Promise<void>,
  opts?: WaitProviderOptions
): Promise<ConnectResult> {
  const official = await connectPhantomOfficial(getWin, opts);
  if (!official.ok) {
    return { ok: false, message: official.message };
  }
  // Provider already connected — sync adapter so publicKey appears in header
  try {
    await syncAdapterConnect();
    return { ok: true };
  } catch (e) {
    // If adapter races after official success, retry once
    try {
      await syncAdapterConnect();
      return { ok: true };
    } catch (e2) {
      // Official connect succeeded — adapter may still emit; prefer install/error text
      return { ok: false, message: formatWalletConnectError(e2) };
    }
  }
}

/** Route Phantom → official path; Solflare/others → ready-gated adapter connect. */
export async function runSelectedWalletConnect(input: {
  walletName: string | null | undefined;
  connect: () => Promise<void>;
  getReadyState: () => WalletReadyStateName | null | undefined;
  getWin: () => PhantomWindowLike | null | undefined;
  readyOpts?: WaitForReadyOptions;
  phantomOpts?: WaitProviderOptions;
}): Promise<ConnectResult> {
  const name = String(input.walletName ?? "");
  if (name === "Phantom") {
    return runPhantomOfficialConnect(
      input.getWin,
      input.connect,
      input.phantomOpts ?? { timeoutMs: 12_000, pollMs: 100 }
    );
  }
  return runWalletConnectWhenReady(
    input.connect,
    input.getReadyState,
    input.readyOpts ?? { timeoutMs: 12_000, pollMs: 100 }
  );
}

export { isWalletReadyForConnect, waitForWalletReady };
export {
  PHANTOM_INSTALL_MESSAGE,
  PHANTOM_INSTALL_URL,
  getPhantomProvider,
  connectPhantomOfficial,
  waitForPhantomProvider,
  isPhantomInstallMessage,
} from "./phantom-official";
