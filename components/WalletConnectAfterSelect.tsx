"use client";

/**
 * After user opens Connect modal and picks a wallet:
 * - Phantom desktop / in-app → official window.phantom.solana.connect()
 * - Phantom mobile (no inject) → deep link UL connect / browse (jup.ag-style)
 * - Solflare → adapter connect when Loadable/Installed
 *
 * Also restores Phantom deep-link return (?data&nonce&phantom_encryption_public_key).
 */

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWalletUiError } from "@/components/SolanaProvider";
import {
  loadPhantomMobilePublicKey,
  runSelectedWalletConnect,
  shouldConnectAfterModalClose,
  shouldConnectAfterWalletSelect,
  tryRestorePhantomConnectReturn,
} from "@/lib/wallet/connect-after-select";
import type { PhantomWindowLike } from "@/lib/wallet/phantom-official";

function getBrowserWin(): PhantomWindowLike | null {
  if (typeof window === "undefined") return null;
  return window as unknown as PhantomWindowLike;
}

function clusterFromEnv(): "devnet" | "testnet" | "mainnet-beta" {
  const raw = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet").toLowerCase();
  if (raw === "mainnet-beta" || raw === "mainnet") return "mainnet-beta";
  if (raw === "testnet") return "testnet";
  return "devnet";
}

export function WalletConnectAfterSelect() {
  const { wallet, connect, connected, connecting, select, wallets } =
    useWallet();
  const { visible } = useWalletModal();
  const { setError } = useWalletUiError();

  const userOpenedModal = useRef(false);
  const prevVisible = useRef(false);
  const inFlight = useRef(false);
  const gen = useRef(0);
  const lastAttemptWallet = useRef<string | null>(null);
  const restored = useRef(false);

  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const selectRef = useRef(select);
  selectRef.current = select;

  const runConnect = (reason: "select" | "close" | "restore") => {
    const w = walletRef.current;
    const walletName = w?.adapter?.name ? String(w.adapter.name) : null;
    if (!walletName) return;

    if (
      reason === "close" &&
      lastAttemptWallet.current === walletName &&
      inFlight.current
    ) {
      return;
    }

    inFlight.current = true;
    lastAttemptWallet.current = walletName;
    const myGen = ++gen.current;

    void (async () => {
      const result = await runSelectedWalletConnect({
        walletName,
        connect: () => connectRef.current(),
        getReadyState: () => walletRef.current?.adapter?.readyState,
        getWin: getBrowserWin,
        phantomOpts: {
          timeoutMs: 2_500,
          pollMs: 50,
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : "",
          pageHref:
            typeof window !== "undefined" ? window.location.href : undefined,
          origin:
            typeof window !== "undefined" ? window.location.origin : undefined,
          cluster: clusterFromEnv(),
          storage:
            typeof sessionStorage !== "undefined" ? sessionStorage : undefined,
        },
        readyOpts: { timeoutMs: 12_000, pollMs: 100 },
      });

      if (myGen !== gen.current) return;

      inFlight.current = false;
      if (result.ok) {
        setError(null);
        userOpenedModal.current = false;
      } else {
        setError(result.message);
        userOpenedModal.current = false;
      }
    })();
  };

  // Restore deep-link connect return on first mount (mobile Approve → redirect)
  useEffect(() => {
    if (restored.current) return;
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
      return;
    }
    restored.current = true;

    const restoredResult = tryRestorePhantomConnectReturn({
      search: window.location.search,
      storage: sessionStorage,
      currentHref: window.location.href,
      replaceUrl: (clean) => {
        window.history.replaceState({}, "", clean);
      },
    });

    if (restoredResult?.ok && restoredResult.publicKey) {
      setError(null);
      // Select Phantom adapter and connect (hydrates publicKey from session)
      const phantom = wallets.find(
        (w) => String(w.adapter.name) === "Phantom"
      );
      if (phantom) {
        selectRef.current(phantom.adapter.name);
        // connect after select settles
        window.setTimeout(() => {
          void connectRef.current().then(
            () => setError(null),
            (e: unknown) => {
              const msg =
                e instanceof Error ? e.message : "Wallet restore failed";
              setError(msg);
            }
          );
        }, 50);
      }
      return;
    }

    if (restoredResult && !restoredResult.ok) {
      setError(restoredResult.message);
      return;
    }

    // Cached mobile session (already returned earlier this tab)
    const cached = loadPhantomMobilePublicKey(sessionStorage);
    if (cached && !connected) {
      const phantom = wallets.find(
        (w) => String(w.adapter.name) === "Phantom"
      );
      if (phantom) {
        selectRef.current(phantom.adapter.name);
        window.setTimeout(() => {
          void connectRef.current().catch(() => {
            /* user can reconnect */
          });
        }, 50);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount restore only
  }, [wallets]);

  // Track modal open / close → connect (covers same-name reselect)
  useEffect(() => {
    const wasVisible = prevVisible.current;
    prevVisible.current = visible;

    if (visible) {
      userOpenedModal.current = true;
      lastAttemptWallet.current = null;
      setError(null);
      return;
    }

    const should = shouldConnectAfterModalClose({
      userOpenedModal: userOpenedModal.current,
      prevVisible: wasVisible,
      visible,
      hasWallet: Boolean(wallet),
      connected,
      connecting,
      inFlight: inFlight.current,
    });

    if (should) runConnect("close");
  }, [visible, wallet, connected, connecting, setError]);

  // Connect as soon as wallet is selected — closer to click
  useEffect(() => {
    if (connected || connecting) return;
    const should = shouldConnectAfterWalletSelect({
      userOpenedModal: userOpenedModal.current,
      hasWallet: Boolean(wallet),
      connected,
      connecting,
      inFlight: inFlight.current,
    });
    if (!should) return;

    const name = wallet?.adapter?.name ? String(wallet.adapter.name) : null;
    if (!name) return;
    if (lastAttemptWallet.current === name) return;

    runConnect("select");
  }, [wallet, connected, connecting]);

  useEffect(() => {
    if (connected) {
      userOpenedModal.current = false;
      inFlight.current = false;
      lastAttemptWallet.current = null;
      setError(null);
    }
  }, [connected, setError]);

  return null;
}
