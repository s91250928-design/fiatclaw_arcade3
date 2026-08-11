"use client";

/**
 * After user opens Connect modal and picks a wallet:
 * - Phantom → official window.phantom.solana.connect() (extension popup)
 * - Solflare → adapter connect when Loadable/Installed
 *
 * Connects on wallet select (and on modal close for same-name reselect)
 * so the call stays close to the user click (Jupiter-like).
 */

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWalletUiError } from "@/components/SolanaProvider";
import {
  runSelectedWalletConnect,
  shouldConnectAfterModalClose,
  shouldConnectAfterWalletSelect,
} from "@/lib/wallet/connect-after-select";
import type { PhantomWindowLike } from "@/lib/wallet/phantom-official";

function getBrowserWin(): PhantomWindowLike | null {
  if (typeof window === "undefined") return null;
  return window as unknown as PhantomWindowLike;
}

export function WalletConnectAfterSelect() {
  const { wallet, connect, connected, connecting } = useWallet();
  const { visible } = useWalletModal();
  const { setError } = useWalletUiError();

  const userOpenedModal = useRef(false);
  const prevVisible = useRef(false);
  const inFlight = useRef(false);
  const gen = useRef(0);
  const lastAttemptWallet = useRef<string | null>(null);

  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const connectRef = useRef(connect);
  connectRef.current = connect;

  const runConnect = (reason: "select" | "close") => {
    const w = walletRef.current;
    const walletName = w?.adapter?.name ? String(w.adapter.name) : null;
    if (!walletName) return;

    // Avoid double fire select+close for same wallet in one open session
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
        // Short wait: installed Phantom injects immediately
        phantomOpts: { timeoutMs: 2_500, pollMs: 50 },
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

  // Connect as soon as wallet is selected (while/after modal) — closer to click
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
