/**
 * Official Phantom Solana provider path (docs.phantom.com).
 * Detect: window.phantom?.solana when isPhantom (legacy: window.solana if isPhantom).
 * Connect: await provider.connect() → publicKey.
 * Missing: "Install Phantom" + https://phantom.app
 * Pure helpers — pass window-like objects; no module-scope window access.
 *
 * @see https://docs.phantom.com/solana/detecting-the-provider
 * @see https://docs.phantom.com/solana/establishing-a-connection
 */

export const PHANTOM_INSTALL_URL = "https://phantom.app";

export const PHANTOM_INSTALL_MESSAGE =
  "Install Phantom: https://phantom.app";

/** Minimal provider shape from Phantom docs. */
export type OfficialPhantomProvider = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: {
    toString(): string;
    toBytes?(): Uint8Array;
    toBase58?(): string;
  } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey?: { toString(): string; toBytes?(): Uint8Array };
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
 * Official getProvider() — docs.phantom.com/solana/detecting-the-provider
 * Prefer window.phantom.solana; legacy window.solana if isPhantom.
 * Does not open install page (return null; caller shows Install link).
 */
export function getPhantomProvider(
  win: PhantomWindowLike | null | undefined
): OfficialPhantomProvider | null {
  if (!win) return null;

  // Official: if ('phantom' in window) { const provider = window.phantom?.solana }
  if (win.phantom) {
    const provider = win.phantom.solana;
    if (provider?.isPhantom) return provider;
  }

  // Legacy support (docs note solana object also on window.solana)
  const legacy = win.solana;
  if (legacy?.isPhantom) return legacy;

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
 * Wait/retry for extension inject before failing.
 * Does NOT throw WalletNotReadyError — returns install message if still missing.
 */
export async function waitForPhantomProvider(
  getWin: () => PhantomWindowLike | null | undefined,
  opts: WaitProviderOptions = {}
): Promise<WaitProviderResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const pollMs = opts.pollMs ?? 100;
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
  | { ok: false; message: string };

/**
 * Official connect: wait for provider, then await provider.connect().
 * Surfaces publicKey string on success.
 */
export async function connectPhantomOfficial(
  getWin: () => PhantomWindowLike | null | undefined,
  opts?: WaitProviderOptions & {
    /** If true, only connect when already trusted (eager). Default false. */
    onlyIfTrusted?: boolean;
  }
): Promise<OfficialConnectResult> {
  const waited = await waitForPhantomProvider(getWin, opts);
  if (!waited.ok) {
    return { ok: false, message: waited.message };
  }

  const provider = waited.provider;
  try {
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
        message: "Phantom connected but no public key returned. Try again.",
      };
    }
    const withBase58 = key as {
      toString(): string;
      toBase58?: () => string;
    };
    const publicKey =
      typeof withBase58.toBase58 === "function"
        ? withBase58.toBase58()
        : key.toString();
    return { ok: true, publicKey };
  } catch (err: unknown) {
    // Docs: { code: 4001, message: 'User rejected the request.' }
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
      return { ok: false, message: msg || "User rejected the request." };
    }
    return { ok: false, message: msg };
  }
}

/** True if UI message is the install-missing path. */
export function isPhantomInstallMessage(message: string): boolean {
  return (
    message.includes(PHANTOM_INSTALL_URL) ||
    /install phantom/i.test(message)
  );
}
