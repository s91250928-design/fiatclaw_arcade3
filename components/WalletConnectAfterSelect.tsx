"use client";

/**
 * WalletModal only calls select() (autoConnect=false) — without this bridge,
 * PC shows Phantom as "Detected" then silently never connects.
 * After the user opens the modal and picks a wallet, we call connect().
 * Does NOT auto-connect on page load (localStorage restore alone is ignored).
 */

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWalletUiError } from "@/components/SolanaProvider";

export function WalletConnectAfterSelect() {
  const { wallet, connect, connected, connecting } = useWallet();
  const { visible } = useWalletModal();
  const { setError } = useWalletUiError();
  const userOpenedModal = useRef(false);
  const connectingRef = useRef(false);

  // Track intentional open of the wallet modal (user click path)
  useEffect(() => {
    if (visible) {
      userOpenedModal.current = true;
      setError(null);
    }
  }, [visible, setError]);

  useEffect(() => {
    if (!userOpenedModal.current) return;
    if (!wallet || connected || connecting || connectingRef.current) return;

    // User selected a wallet from the modal — complete the PC extension handshake
    connectingRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        await connect();
        if (!cancelled) {
          setError(null);
          userOpenedModal.current = false;
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg =
            e instanceof Error
              ? e.message
              : typeof e === "string"
                ? e
                : "Wallet connect failed. Unlock Phantom and try again.";
          setError(msg);
          // Allow retry on next select
          userOpenedModal.current = true;
        }
      } finally {
        connectingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallet, connected, connecting, connect, setError]);

  return null;
}
