"use client";

/**
 * Solana wallet root: Phantom + Solflare.
 * autoConnect=false. RPC/cluster from NEXT_PUBLIC_* env.
 * Always wraps children in providers so useWallet / useWalletModal work.
 */

import React, { useCallback, useMemo, useEffect, useState, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork, type WalletError } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";

interface Props {
  children: ReactNode;
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
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  const network = useMemo(() => resolveNetwork(), []);

  const endpoint = useMemo(() => {
    const custom = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
    if (custom && /^https?:\/\//i.test(custom)) return custom;
    return clusterApiUrl(network);
  }, [network]);

  // Instantiate adapters only in the browser after mount (Phantom injects window.solana)
  const wallets = useMemo(() => {
    if (!ready || typeof window === "undefined") return [];
    return [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ];
  }, [network, ready]);

  const onError = useCallback((error: WalletError) => {
    console.error("[FiatClaw wallet]", error?.name, error?.message ?? error);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider
        wallets={wallets}
        autoConnect={false}
        onError={onError}
        localStorageKey="fiatclaw-wallet"
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
