"use client";

/**
 * Solana wallet root — Wallet Standard first.
 * Phantom: registered by the extension via Wallet Standard (do NOT also pass
 * legacy PhantomWalletAdapter — dual registration causes WalletConnectionError
 * and the "Phantom was registered as a Standard Wallet" console warning).
 * Solflare: legacy SolflareWalletAdapter (no Standard dup when extension absent).
 * WalletProvider merges Standard wallets and filters same-name legacy entries.
 * autoConnect=false. RPC/cluster from NEXT_PUBLIC_* env.
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
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletConnectAfterSelect } from "@/components/WalletConnectAfterSelect";

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

  const endpoint = useMemo(() => {
    const custom = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
    if (custom && /^https?:\/\//i.test(custom)) return custom;
    return clusterApiUrl(network);
  }, [network]);

  /**
   * Legacy wallets list: Solflare only.
   * Phantom arrives via Wallet Standard (useStandardWalletAdapters inside
   * WalletProvider). Construct adapters only in useMemo (no window at module scope).
   * Mobile Wallet Adapter deep-link is still injected by wallet-adapter-react.
   */
  const wallets = useMemo(
    () => [new SolflareWalletAdapter({ network })],
    [network]
  );

  const onError = useCallback((err: WalletError) => {
    const msg = err?.message || err?.name || "Wallet error";
    console.error("[FiatClaw wallet]", err?.name, msg);
    // Surface to UI (not silent)
    setError(msg);
  }, []);

  const uiValue = useMemo(
    () => ({ error, setError }),
    [error]
  );

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
            {/* Modal only select()s — this calls connect() after user picks a wallet */}
            <WalletConnectAfterSelect />
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </WalletUiContext.Provider>
  );
}
