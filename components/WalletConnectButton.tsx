/**
 * Connect wallet — official WalletMultiButton (modal → Phantom extension on PC,
 * mobile deep-link via Wallet Standard / MWA).
 * Client-only mount avoids SSR/hydration issues with wallet adapters.
 */

"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletConnectButton() {
  const [mounted, setMounted] = useState(false);
  const { publicKey, connected, wallets } = useWallet();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        data-wallet-connect="pending"
        aria-label="Connect wallet"
        disabled
        style={btnStyle}
      >
        Select Wallet
      </button>
    );
  }

  return (
    <div
      data-wallet-connect="ready"
      data-wallet-connected={connected ? "true" : "false"}
      data-wallet-address={publicKey?.toBase58() ?? ""}
      data-wallet-count={String(wallets.length)}
      data-wallet-names={wallets.map((w) => w.adapter.name).join(",")}
      style={{ display: "inline-flex", flexShrink: 0, position: "relative", zIndex: 30 }}
    >
      <WalletMultiButton style={btnStyle} className="fiatclaw-wallet-btn" />
    </div>
  );
}

const btnStyle: import("react").CSSProperties = {
  background: "linear-gradient(180deg,#FF3E5C,#C4102A 62%,#8C0A1E)",
  borderRadius: 11,
  fontFamily: "Inter, system-ui, sans-serif",
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: "0.08em",
  height: 42,
  minHeight: 42,
  padding: "0 16px",
  whiteSpace: "nowrap",
  flexShrink: 0,
  border: "none",
  color: "#fff",
  cursor: "pointer",
};
