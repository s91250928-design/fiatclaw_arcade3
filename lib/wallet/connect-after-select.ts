/**
 * Wallet connect after modal select (Jupiter-like Phantom UX).
 * Desktop / Phantom in-app: official provider.connect().
 * Mobile (no inject): Phantom browse/connect deep link — not Install loop.
 * Solflare: adapter ready-gate (Installed|Loadable).
 * Install text ONLY when provider truly absent AND no mobile deep-link path.
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
import {
  browserPhantomStorage,
  buildPhantomMobileOpenUrl,
  clearPhantomConnectSecret,
  isMobileUserAgent,
  isPhantomInAppBrowser,
  loadPhantomConnectSecret,
  loadPhantomMobilePublicKey,
  parsePhantomConnectReturn,
  PHANTOM_MOBILE_OPEN_MESSAGE,
  phantomAbsentMessage,
  shouldUsePhantomMobileDeepLink,
  storePhantomMobileSession,
  withPhantomBrowseIntent,
  type StorageLike,
} from "./phantom-mobile";

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
 * When already connected / publicKey present, never surface unlock/install.
 */
export function formatWalletConnectError(
  e: unknown,
  opts?: {
    providerPresent?: boolean;
    /** True when inject or restored session already has a publicKey. */
    alreadyConnected?: boolean;
  }
): string {
  if (opts?.alreadyConnected) {
    // Connected UI owns success — do not paint false unlock/decrypt errors
    return "";
  }

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
      return PHANTOM_UNLOCK_MESSAGE;
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

/** Whether UI should show a connect error (never when session/provider already connected). */
export function shouldSurfaceConnectError(input: {
  connected?: boolean;
  publicKey?: string | null;
}): boolean {
  if (input.connected) return false;
  if (input.publicKey) return false;
  return true;
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

export type PhantomConnectEnv = {
  userAgent?: string;
  pageHref?: string;
  origin?: string;
  cluster?: "devnet" | "testnet" | "mainnet-beta";
  /** Assign location for deep link (default no-op in tests). */
  navigate?: (url: string) => void;
  /** Dual bag preferred (session+local). Falls back to browserPhantomStorage(). */
  storage?: StorageLike;
};

/**
 * Jupiter-like Phantom:
 * 1) Inject present → provider.connect() (desktop extension / Phantom in-app browser).
 * 2) Mobile no inject → open Phantom UL (browse or connect) — never Install-loop.
 * Then best-effort adapter sync for header publicKey.
 */
export async function runPhantomOfficialConnect(
  getWin: () => PhantomWindowLike | null | undefined,
  syncAdapterConnect: () => Promise<void>,
  opts?: WaitProviderOptions & PhantomConnectEnv
): Promise<ConnectResult> {
  const presentBefore = isPhantomInstalled(getWin());
  const ua =
    opts?.userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const useMobile = shouldUsePhantomMobileDeepLink({
    userAgent: ua,
    hasInjectedProvider: presentBefore,
  });

  // Mobile session restored from prior deep-link return (publicKey only)
  if (!presentBefore && opts?.storage) {
    const cached = loadPhantomMobilePublicKey(opts.storage);
    if (cached) {
      try {
        await syncAdapterConnect();
      } catch {
        /* adapter may still hydrate from storage in ArcadePhantomWalletAdapter */
      }
      return { ok: true, publicKey: cached };
    }
  }

  if (useMobile) {
    const pageHref =
      opts?.pageHref ??
      (typeof window !== "undefined" ? window.location.href : "");
    const origin =
      opts?.origin ??
      (typeof window !== "undefined" ? window.location.origin : "");
    const navigate =
      opts?.navigate ??
      ((url: string) => {
        if (typeof window !== "undefined") window.location.assign(url);
      });

    // jup.ag-style: browse UL → site in Phantom in-app browser → inject connect.
    // Encrypted connect UL + HTTPS redirect is fragile (new tab / decrypt fails).
    const target = withPhantomBrowseIntent(
      pageHref || origin || "https://localhost"
    );
    const openUrl = buildPhantomMobileOpenUrl({
      pageHref: target,
      origin: origin || "https://localhost",
      cluster: opts?.cluster ?? "devnet",
      mode: "browse",
    });

    navigate(openUrl);
    return { ok: false, message: PHANTOM_MOBILE_OPEN_MESSAGE };
  }

  const official = await connectPhantomOfficial(getWin, {
    timeoutMs: opts?.timeoutMs ?? 2_500,
    pollMs: opts?.pollMs ?? 50,
    sleep: opts?.sleep,
    now: opts?.now,
    allowMobileDeepLink: isMobileUserAgent(ua),
  });

  if (!official.ok) {
    // Phantom in-app without inject yet: unlock/retry, not Install
    if (isPhantomInAppBrowser(ua)) {
      return { ok: false, message: PHANTOM_UNLOCK_MESSAGE };
    }
    // On mobile residual absent: never Install-loop — offer deep link message
    if (
      (official.kind === "install" || official.kind === "error") &&
      isMobileUserAgent(ua)
    ) {
      const policy = phantomAbsentMessage({
        userAgent: ua,
        hasInjectedProvider: false,
      });
      return { ok: false, message: policy.message };
    }
    return { ok: false, message: official.message };
  }

  // Official success — extension popup / in-app. Sync wallet-adapter for UI.
  try {
    await syncAdapterConnect();
  } catch {
    try {
      await syncAdapterConnect();
    } catch {
      // Adapter race must not undo successful provider.connect()
    }
  }

  const after = getPhantomProvider(getWin());
  if (after?.publicKey || after?.isConnected || official.publicKey) {
    return { ok: true, publicKey: official.publicKey };
  }

  return {
    ok: false,
    message: presentBefore ? PHANTOM_UNLOCK_MESSAGE : PHANTOM_INSTALL_MESSAGE,
  };
}

function stripPhantomConnectReturnParams(
  href: string,
  replaceUrl?: (cleanHref: string) => void
): void {
  if (!replaceUrl) return;
  try {
    const u = new URL(href);
    [
      "phantom_encryption_public_key",
      "nonce",
      "data",
      "errorCode",
      "errorMessage",
    ].forEach((k) => u.searchParams.delete(k));
    replaceUrl(u.pathname + u.search + u.hash);
  } catch {
    /* ignore */
  }
}

/**
 * Handle return from Phantom connect deep link (?phantom_encryption_public_key&nonce&data).
 * Stores publicKey session and strips sensitive query from URL when possible.
 * If a publicKey session already exists, never surfaces decrypt/unlock as failure.
 */
export function tryRestorePhantomConnectReturn(input: {
  search: string;
  storage: StorageLike;
  replaceUrl?: (cleanHref: string) => void;
  currentHref?: string;
}): ConnectResult | null {
  const params = new URLSearchParams(
    input.search.startsWith("?") ? input.search.slice(1) : input.search
  );
  const hasReturn =
    params.has("data") ||
    params.has("phantom_encryption_public_key") ||
    params.has("errorCode");
  if (!hasReturn) return null;

  const existingPk = loadPhantomMobilePublicKey(input.storage);
  const secret = loadPhantomConnectSecret(input.storage);

  if (!secret) {
    // Stale return without secret: keep prior session if present
    if (existingPk) {
      if (input.currentHref) {
        stripPhantomConnectReturnParams(input.currentHref, input.replaceUrl);
      }
      return { ok: true, publicKey: existingPk };
    }
    return {
      ok: false,
      message: PHANTOM_UNLOCK_MESSAGE,
    };
  }

  const parsed = parsePhantomConnectReturn(params, secret);
  clearPhantomConnectSecret(input.storage);

  if (parsed.ok) {
    storePhantomMobileSession(
      input.storage,
      parsed.publicKey,
      parsed.session
    );
    if (input.currentHref) {
      stripPhantomConnectReturnParams(input.currentHref, input.replaceUrl);
    }
    return { ok: true, publicKey: parsed.publicKey };
  }

  // Decrypt failed but session already connected — do not false-unlock
  if (existingPk) {
    if (input.currentHref) {
      stripPhantomConnectReturnParams(input.currentHref, input.replaceUrl);
    }
    return { ok: true, publicKey: existingPk };
  }

  return { ok: false, message: parsed.message };
}

/** Phantom → official popup or mobile deep link; Solflare → ready-gated adapter. */
export async function runSelectedWalletConnect(input: {
  walletName: string | null | undefined;
  connect: () => Promise<void>;
  getReadyState: () => WalletReadyStateName | null | undefined;
  getWin: () => PhantomWindowLike | null | undefined;
  readyOpts?: WaitForReadyOptions;
  phantomOpts?: WaitProviderOptions & PhantomConnectEnv;
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
export {
  isMobileUserAgent,
  isPhantomInAppBrowser,
  shouldUsePhantomMobileDeepLink,
  buildPhantomBrowseDeepLink,
  buildPhantomConnectDeepLink,
  buildPhantomMobileOpenUrl,
  createPhantomConnectKeypair,
  parsePhantomConnectReturn,
  phantomAbsentMessage,
  PHANTOM_MOBILE_OPEN_MESSAGE,
  PHANTOM_BROWSE_INTENT,
  withPhantomBrowseIntent,
  hasPhantomBrowseIntent,
  stripPhantomBrowseIntent,
  loadPhantomMobilePublicKey,
  dualWriteStorage,
  browserPhantomStorage,
  clearPhantomMobileSession,
  storePhantomMobileSession,
  storePhantomConnectSecret,
  loadPhantomConnectSecret,
} from "./phantom-mobile";
