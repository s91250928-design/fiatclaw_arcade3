"use client";

/**
 * Solana wallet root — desktop Phantom extension + mobile deep-link.
 *
 * Uses empty `wallets` so Wallet Standard auto-registers installed wallets
 * (Phantom/Solflare on PC). WalletProvider also injects Mobile Wallet Adapter
 * on mobile. autoConnect=false. RPC from NEXT_PUBLIC_* env.
 */

import React, { useCallback, useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import {
  WalletAdapterNetwork,
  type Adapter,
  type WalletError,
} from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
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
  const network = useMemo(() => resolveNetwork(), []);

  const endpoint = useMemo(() => {
    const custom = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
    if (custom && /^https?:\/\//i.test(custom)) return custom;
    return clusterApiUrl(network);
  }, [network]);

  /**
   * Empty list = Wallet Standard discovers Phantom/Solflare extensions on PC.
   * Do NOT also mount legacy PhantomWalletAdapter — duplicates break desktop connect.
   * Mobile Wallet Adapter is added automatically by WalletProvider on mobile UA.
   */
  const wallets = useMemo<Adapter[]>(() => [], []);

  const onError = useCallback((error: WalletError) => {
    // WalletNotSelected / WalletNotReady are common; keep UI alive
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
