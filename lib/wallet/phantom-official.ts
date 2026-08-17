/**
 * Official Phantom provider path (docs.phantom.com) — Jupiter-like UX.
 *
 * Detect (only): window.phantom?.solana?.isPhantom === true
 *   legacy: window.solana?.isPhantom === true
 * Connect: await provider.connect() → extension popup → publicKey
 * Install message: ONLY when provider is still missing after short post-load wait.
 *
 * Never window.open() install pages. Never map adapter races to Install.
 *
 * @see https://docs.phantom.com/solana/detecting-the-provider
 * @see https://docs.phantom.com/solana/establishing-a-connection
 */

export const PHANTOM_INSTALL_URL = "https://phantom.app";

/** Single calm install line — only when extension truly absent. */
export const PHANTOM_INSTALL_MESSAGE =
  "Install Phantom: https://phantom.app";

/** Unlock / retry — when extension may be present but connect failed. */
export const PHANTOM_UNLOCK_MESSAGE =
  "Unlock Phantom and try Connect again.";

export type OfficialPhantomProvider = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: {
    toString(): string;
    toBytes?(): Uint8Array;
    toBase58?(): string;
  } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey?: { toString(): string; toBytes?(): Uint8Array; toBase58?(): string };
  } | void>;
  disconnect?: () => Promise<void>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
  signTransaction?: (tx: unknown) => Promise<unknown>;
  signAllTransactions?: (txs: unknown[]) => Promise<unknown[]>;
  signMessage?: (
    message: Uint8Array,
    display?: string
  ) => Promise<{ signature: Uint8Array } | Uint8Array>;
};

export type PhantomWindowLike = {
  phantom?: { solana?: OfficialPhantomProvider };
  solana?: OfficialPhantomProvider;
};

/**
 * Official getProvider — strict isPhantom check.
 * Returns provider only when installed and injectable.
 */
export function getPhantomProvider(
  win: PhantomWindowLike | null | undefined
): OfficialPhantomProvider | null {
  if (!win) return null;

  try {
    // docs: const isPhantomInstalled = window.phantom?.solana?.isPhantom
    const fromNamespace = win.phantom?.solana;
    if (
      fromNamespace &&
      fromNamespace.isPhantom === true &&
      typeof fromNamespace.connect === "function"
    ) {
      return fromNamespace;
    }

    // legacy window.solana when isPhantom
    const legacy = win.solana;
    if (
      legacy &&
      legacy.isPhantom === true &&
      typeof legacy.connect === "function"
    ) {
      return legacy;
    }
  } catch {
    // Some injectors throw on property access — treat as absent
  }

  return null;
}

export function isPhantomInstalled(
  win: PhantomWindowLike | null | undefined
): boolean {
  return getPhantomProvider(win) != null;
}

export type WaitProviderOptions = {
  timeoutMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type WaitProviderResult =
  | { ok: true; provider: OfficialPhantomProvider }
  | { ok: false; message: string };

/**
 * Short wait for late inject. Install message ONLY if still missing.
 * Default timeout is short (2s) so installed extensions connect quickly;
 * absent extension fails fast to one Install link (no redirect loop).
 */
export async function waitForPhantomProvider(
  getWin: () => PhantomWindowLike | null | undefined,
  opts: WaitProviderOptions = {}
): Promise<WaitProviderResult> {
  const timeoutMs = opts.timeoutMs ?? 2_500;
  const pollMs = opts.pollMs ?? 50;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  const start = now();

  const first = getPhantomProvider(getWin());
  if (first) return { ok: true, provider: first };

  while (now() - start < timeoutMs) {
    await sleep(pollMs);
    const p = getPhantomProvider(getWin());
    if (p) return { ok: true, provider: p };
  }

  return { ok: false, message: PHANTOM_INSTALL_MESSAGE };
}

export type OfficialConnectResult =
  | { ok: true; publicKey: string }
  | { ok: false; message: string; kind: "install" | "reject" | "error" };

function publicKeyToString(key: {
  toString(): string;
  toBase58?: () => string;
}): string {
  if (typeof key.toBase58 === "function") return key.toBase58();
  return key.toString();
}

/**
 * Jupiter/docs flow: wait (brief) → await provider.connect() → publicKey.
 * Opens the Phantom extension popup when installed (desktop / in-app browser).
 * On mobile without inject, callers should open deep link first (see phantom-mobile).
 */
export async function connectPhantomOfficial(
  getWin: () => PhantomWindowLike | null | undefined,
  opts?: WaitProviderOptions & {
    onlyIfTrusted?: boolean;
    /** When true, absent provider returns unlock/mobile message instead of Install. */
    allowMobileDeepLink?: boolean;
  }
): Promise<OfficialConnectResult> {
  const waited = await waitForPhantomProvider(getWin, opts);
  if (!waited.ok) {
    if (opts?.allowMobileDeepLink) {
      return {
        ok: false,
        message: waited.message,
        kind: "error",
      };
    }
    return { ok: false, message: waited.message, kind: "install" };
  }

  const provider = waited.provider;

  // Already connected — return key without re-prompt when possible
  if (provider.isConnected && provider.publicKey) {
    return {
      ok: true,
      publicKey: publicKeyToString(provider.publicKey),
    };
  }

  try {
    // docs: const resp = await provider.connect();
    const resp = await provider.connect(
      opts?.onlyIfTrusted ? { onlyIfTrusted: true } : undefined
    );
    const key =
      resp && typeof resp === "object" && resp.publicKey
        ? resp.publicKey
        : provider.publicKey;
    if (!key) {
      return {
        ok: false,
        message: PHANTOM_UNLOCK_MESSAGE,
        kind: "error",
      };
    }
    return { ok: true, publicKey: publicKeyToString(key) };
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? Number((err as { code: number }).code)
        : undefined;
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Phantom connection failed";

    if (code === 4001 || /reject|denied|user/i.test(msg)) {
      return {
        ok: false,
        message: msg || "User rejected the request.",
        kind: "reject",
      };
    }

    // Provider was present — never "Install"
    return {
      ok: false,
      message: msg || PHANTOM_UNLOCK_MESSAGE,
      kind: "error",
    };
  }
}

export function isPhantomInstallMessage(message: string): boolean {
  return (
    message.includes(PHANTOM_INSTALL_URL) ||
    /^install phantom/i.test(message.trim())
  );
}
