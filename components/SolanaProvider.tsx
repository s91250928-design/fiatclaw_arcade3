"use client";

import React, { useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";

interface Props {
  children: ReactNode;
}

const Conn = ConnectionProvider as React.ComponentType<{
  endpoint: string;
  config?: { commitment?: string };
  children?: ReactNode;
}>;
const Wallets = WalletProvider as React.ComponentType<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallets: any[];
  autoConnect?: boolean;
  children?: ReactNode;
}>;
const Modal = WalletModalProvider as React.ComponentType<{
  children?: ReactNode;
}>;

export function SolanaProvider({ children }: Props) {
  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet").toLowerCase();

  const network =
    cluster === "mainnet-beta"
      ? WalletAdapterNetwork.Mainnet
      : cluster === "testnet"
        ? WalletAdapterNetwork.Testnet
        : WalletAdapterNetwork.Devnet;

  const endpoint = useMemo(() => {
    const custom = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    if (custom && custom.startsWith("http")) return custom;
    return clusterApiUrl(network);
  }, [network]);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })],
    [network]
  );

  return (
    <Conn endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <Wallets wallets={wallets} autoConnect={false}>
        <Modal>{children}</Modal>
      </Wallets>
    </Conn>
  );
}
