"use client";

/**
 * Solana wallet root — Phantom + Solflare (Jupiter-like Phantom UX).
 * Phantom: official window.phantom.solana.connect() via bridge (extension popup).
 * Solflare: SolflareWalletAdapter. autoConnect=false. Client-only.
 * onError never maps NotReady → false Install when provider may be present.
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
import { formatWalletConnectError } from "@/lib/wallet/connect-after-select";
import {
  getPhantomProvider,
  type PhantomWindowLike,
} from "@/lib/wallet/phantom-official";

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

  const wallets = useMemo(
    () => buildArcadeWalletAdapters(network),
    [network]
  );

  const onError = useCallback((err: WalletError) => {
    const present =
      typeof window !== "undefined" &&
      getPhantomProvider(window as unknown as PhantomWindowLike) != null;
    const msg = formatWalletConnectError(err, { providerPresent: present });
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
            <WalletConnectAfterSelect />
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </WalletUiContext.Provider>
  );
}
