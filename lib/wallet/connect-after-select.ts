/**
 * PC wallet connect after modal select (Jupiter-like Phantom UX).
 * Phantom: official provider.connect() only when isPhantom provider exists.
 * Solflare: adapter ready-gate (Installed|Loadable).
 * Install text ONLY when provider truly absent — never for NotReady races.
 */

import {
  isWalletReadyForConnect,
  waitForWalletReady,
  type WaitForReadyOptions,
  type WalletReadyStateName,
} from "./ready";
import {
  connectPhantomOfficial,
  getPhantomProvider,
  isPhantomInstalled,
  PHANTOM_INSTALL_MESSAGE,
  PHANTOM_UNLOCK_MESSAGE,
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

/** Connect when user selected a wallet (modal may still be open) — closer to gesture. */
export function shouldConnectAfterWalletSelect(input: {
  userOpenedModal: boolean;
  hasWallet: boolean;
  connected: boolean;
  connecting: boolean;
  inFlight: boolean;
}): boolean {
  if (!input.userOpenedModal) return false;
  if (!input.hasWallet) return false;
  if (input.connected || input.connecting || input.inFlight) return false;
  return true;
}

export type ConnectResult =
  | { ok: true; publicKey?: string }
  | { ok: false; message: string };

/**
 * Format errors for UI.
 * CRITICAL: WalletNotReady / adapter races → unlock message, NOT Install.
 * Install only when message is already the install path or explicit absent.
 */
export function formatWalletConnectError(
  e: unknown,
  opts?: { providerPresent?: boolean }
): string {
  const providerPresent = opts?.providerPresent === true;

  if (e instanceof Error) {
    const name = e.name || "";
    const msg = e.message || "";

    if (isInstallText(msg)) {
      // If provider is actually present, never show install
      if (providerPresent) return PHANTOM_UNLOCK_MESSAGE;
      return msg.includes(PHANTOM_INSTALL_MESSAGE)
        ? msg
        : PHANTOM_INSTALL_MESSAGE;
    }

    if (
      name === "WalletNotReadyError" ||
      /not ready|WalletNotReady/i.test(msg) ||
      /not ready/i.test(name)
    ) {
      // Adapter race — NOT "Install Phantom"
      return providerPresent
        ? PHANTOM_UNLOCK_MESSAGE
        : PHANTOM_UNLOCK_MESSAGE;
    }

    if (
      name === "WalletConnectionError" ||
      /WalletConnectionError|connection error|User rejected/i.test(msg)
    ) {
      if (isInstallText(msg) && !providerPresent) {
        return PHANTOM_INSTALL_MESSAGE;
      }
      return msg || "Wallet connection failed. Approve in Phantom/Solflare.";
    }

    if (msg) return msg;
  }
  if (typeof e === "string" && e.trim()) {
    if (isInstallText(e) && providerPresent) return PHANTOM_UNLOCK_MESSAGE;
    return e;
  }
  return "Wallet connect failed. Unlock Phantom/Solflare and try again.";
}

function isInstallText(msg: string): boolean {
  return (
    /install phantom/i.test(msg) || msg.includes("https://phantom.app")
  );
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
 * Jupiter-like Phantom: provider.connect() opens extension popup.
 * Then best-effort adapter sync for header publicKey.
 * If official connect succeeds → always ok (never flip to Install on adapter race).
 */
export async function runPhantomOfficialConnect(
  getWin: () => PhantomWindowLike | null | undefined,
  syncAdapterConnect: () => Promise<void>,
  opts?: WaitProviderOptions
): Promise<ConnectResult> {
  const presentBefore = isPhantomInstalled(getWin());

  const official = await connectPhantomOfficial(getWin, {
    timeoutMs: opts?.timeoutMs ?? 2_500,
    pollMs: opts?.pollMs ?? 50,
    sleep: opts?.sleep,
    now: opts?.now,
  });

  if (!official.ok) {
    // install | reject | error — do not upgrade reject/error to install
    return { ok: false, message: official.message };
  }

  // Official success — extension popup was used. Sync wallet-adapter for UI.
  try {
    await syncAdapterConnect();
  } catch {
    try {
      await syncAdapterConnect();
    } catch {
      // Adapter race (Standard vs legacy) must not undo a successful provider.connect()
    }
  }

  // Confirm provider still holds session
  const after = getPhantomProvider(getWin());
  if (after?.publicKey || after?.isConnected || official.publicKey) {
    return { ok: true, publicKey: official.publicKey };
  }

  // Extremely rare: official ok but key gone
  return {
    ok: false,
    message: presentBefore ? PHANTOM_UNLOCK_MESSAGE : PHANTOM_INSTALL_MESSAGE,
  };
}

/** Phantom → official popup path; Solflare → ready-gated adapter. */
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
      input.phantomOpts ?? { timeoutMs: 2_500, pollMs: 50 }
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
  PHANTOM_UNLOCK_MESSAGE,
  getPhantomProvider,
  isPhantomInstalled,
  connectPhantomOfficial,
  waitForPhantomProvider,
  isPhantomInstallMessage,
} from "./phantom-official";
