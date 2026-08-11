"use client";

/**
 * WalletModal only select()s. With autoConnect=false, PC connects after modal close.
 * Phantom → official docs.phantom.com provider.connect() (wait inject, then popup).
 * Solflare → ready-gated adapter.connect() (Installed|Loadable).
 */

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWalletUiError } from "@/components/SolanaProvider";
import {
  runSelectedWalletConnect,
  shouldConnectAfterModalClose,
} from "@/lib/wallet/connect-after-select";
import type { PhantomWindowLike } from "@/lib/wallet/phantom-official";

export function WalletConnectAfterSelect() {
  const { wallet, connect, connected, connecting } = useWallet();
  const { visible } = useWalletModal();
  const { setError } = useWalletUiError();

  const userOpenedModal = useRef(false);
  const prevVisible = useRef(false);
  const inFlight = useRef(false);
  const gen = useRef(0);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const connectRef = useRef(connect);
  connectRef.current = connect;

  useEffect(() => {
    const wasVisible = prevVisible.current;
    prevVisible.current = visible;

    if (visible) {
      userOpenedModal.current = true;
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

    if (!should) return;

    inFlight.current = true;
    const myGen = ++gen.current;
    const walletName = wallet?.adapter?.name
      ? String(wallet.adapter.name)
      : null;

    void (async () => {
      const result = await runSelectedWalletConnect({
        walletName,
        connect: () => connectRef.current(),
        getReadyState: () => walletRef.current?.adapter?.readyState,
        getWin: () =>
          typeof window !== "undefined"
            ? (window as unknown as PhantomWindowLike)
            : null,
        readyOpts: { timeoutMs: 12_000, pollMs: 100 },
        phantomOpts: { timeoutMs: 12_000, pollMs: 100 },
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
  }, [visible, wallet, connected, connecting, setError]);

  useEffect(() => {
    if (connected) {
      userOpenedModal.current = false;
      inFlight.current = false;
      setError(null);
    }
  }, [connected, setError]);

  return null;
}
