"use client";

/**
 * Solana wallet root: explicit Phantom + Solflare adapters.
 * autoConnect=false. RPC/cluster from NEXT_PUBLIC_* env.
 * Always mounts Connection / Wallet / Modal providers.
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
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
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
   * OBJECTIVE: always list Phantom + Solflare in the modal.
   * Adapters are constructed in useMemo only (no window at module scope).
   * Wallet Standard may also surface Phantom; legacy dupes are filtered by name
   * inside wallet-adapter-react — Solflare still appears via SolflareWalletAdapter.
   */
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ],
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
