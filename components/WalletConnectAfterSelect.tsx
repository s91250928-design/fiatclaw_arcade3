"use client";

/**
 * WalletModal only select()s. With autoConnect=false, PC needs connect() after
 * the user closes the modal (covers same-name reselect when localStorage already
 * has Phantom — select is a no-op so wallet dep never changes).
 */

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWalletUiError } from "@/components/SolanaProvider";
import {
  runWalletConnect,
  shouldConnectAfterModalClose,
} from "@/lib/wallet/connect-after-select";

export function WalletConnectAfterSelect() {
  const { wallet, connect, connected, connecting } = useWallet();
  const { visible } = useWalletModal();
  const { setError } = useWalletUiError();

  const userOpenedModal = useRef(false);
  const prevVisible = useRef(false);
  const inFlight = useRef(false);
  /** Bumps so stale async results are ignored without cancelling mid-connect */
  const gen = useRef(0);

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

    void (async () => {
      const result = await runWalletConnect(() => connect());
      // Ignore if a newer attempt started
      if (myGen !== gen.current) return;

      inFlight.current = false;
      if (result.ok) {
        setError(null);
        userOpenedModal.current = false;
      } else {
        setError(result.message);
        // Intent cleared; next open of modal sets it again for retry
        userOpenedModal.current = false;
      }
    })();
  }, [visible, wallet, connected, connecting, connect, setError]);

  // Clear intent once fully connected (e.g. success after async)
  useEffect(() => {
    if (connected) {
      userOpenedModal.current = false;
      inFlight.current = false;
      setError(null);
    }
  }, [connected, setError]);

  return null;
}
