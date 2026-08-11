/**
 * Pure ready-gate for PC wallet connect.
 * Never call connect() while readyState is NotDetected / Unsupported.
 * Loadable is not treated as ready on desktop (Phantom universal-link redirect).
 */

export type WalletReadyStateName =
  | "Installed"
  | "Loadable"
  | "NotDetected"
  | "Unsupported"
  | string;

/** True only when adapter can open the extension popup and connect. */
export function isWalletReadyForConnect(
  readyState: WalletReadyStateName | null | undefined
): boolean {
  return readyState === "Installed";
}

export type WaitForReadyResult =
  | { ready: true }
  | { ready: false; message: string };

export type WaitForReadyOptions = {
  timeoutMs?: number;
  pollMs?: number;
  /** Injected sleep for tests */
  sleep?: (ms: number) => Promise<void>;
  /** Optional wall-clock (tests) */
  now?: () => number;
};

/**
 * Poll getReadyState until Installed or timeout.
 * Use after modal select so Standard registration / extension inject can finish.
 */
export async function waitForWalletReady(
  getReadyState: () => WalletReadyStateName | null | undefined,
  opts: WaitForReadyOptions = {}
): Promise<WaitForReadyResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const pollMs = opts.pollMs ?? 80;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  const start = now();

  // Immediate success if already ready
  if (isWalletReadyForConnect(getReadyState())) {
    return { ready: true };
  }

  while (now() - start < timeoutMs) {
    await sleep(pollMs);
    if (isWalletReadyForConnect(getReadyState())) {
      return { ready: true };
    }
  }

  const last = getReadyState() ?? "unknown";
  if (last === "NotDetected" || last === "unknown" || last === "Unsupported") {
    return {
      ready: false,
      message:
        "Phantom is not ready. Unlock the browser extension, then try Connect again.",
    };
  }
  if (last === "Loadable") {
    return {
      ready: false,
      message:
        "Wallet extension not detected in this browser. Install Phantom/Solflare and retry.",
    };
  }
  return {
    ready: false,
    message: `Wallet not ready (${last}). Unlock the extension and try again.`,
  };
}
