"use client";

/**
 * Solana wallet root — Phantom + Solflare in one modal list.
 * Phantom: ArcadePhantom adapter (isPhantom detect) — not the package phantom
 * adapter that gates on isPhantomInstalled (WalletNotReady).
 * WalletProvider merges Wallet Standard and filters same-name legacy adapters
 * so Standard Phantom owns connect when registered (no dual conflict).
 * autoConnect=false. RPC/cluster from NEXT_PUBLIC_* env. Client-only.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import {
  WalletAdapterNetwork,
  type WalletError,
} from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletConnectAfterSelect } from "@/components/WalletConnectAfterSelect";
import { buildArcadeWalletAdapters } from "@/lib/wallet/adapters";

interface Props {
  children: ReactNode;
}

type WalletUiCtx = {
  error: string | null;
  setError: (msg: string | null) => void;
};

const WalletUiContext = createContext<WalletUiCtx>({
  error: null,
  setError: () => {},
});

export function useWalletUiError() {
  return useContext(WalletUiContext);
}

function resolveNetwork(): WalletAdapterNetwork {
  const raw = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet").toLowerCase();
  if (raw === "mainnet-beta" || raw === "mainnet") {
    return WalletAdapterNetwork.Mainnet;
  }
  if (raw === "testnet") return WalletAdapterNetwork.Testnet;
  return WalletAdapterNetwork.Devnet;
}

export function SolanaProvider({ children }: Props) {
  const [error, setError] = useState<string | null>(null);
  const network = useMemo(() => resolveNetwork(), []);

  /** Endpoint prefers NEXT_PUBLIC_SOLANA_RPC_URL so mainnet env matches Connection. */
  const endpoint = useMemo(() => {
    const custom = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
    if (custom && /^https?:\/\//i.test(custom)) return custom;
    return clusterApiUrl(network);
  }, [network]);

  /**
   * Explicit Phantom + Solflare for the modal.
   * Construct in useMemo only (client component — no window at module scope).
   * Standard merge inside WalletProvider dedupes Phantom by name.
   */
  const wallets = useMemo(
    () => buildArcadeWalletAdapters(network),
    [network]
  );

  const onError = useCallback((err: WalletError) => {
    const msg = err?.message || err?.name || "Wallet error";
    console.error("[FiatClaw wallet]", err?.name, msg);
    setError(msg);
  }, []);

  const uiValue = useMemo(() => ({ error, setError }), [error]);

  return (
    <WalletUiContext.Provider value={uiValue}>
      <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
        <WalletProvider
          wallets={wallets}
          autoConnect={false}
          onError={onError}
          localStorageKey="fiatclaw-wallet"
        >
          <WalletModalProvider>
            {/* Modal only select()s — gated connect() after ready */}
            <WalletConnectAfterSelect />
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </WalletUiContext.Provider>
  );
}
