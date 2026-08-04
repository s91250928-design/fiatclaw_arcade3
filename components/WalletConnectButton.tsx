/**
 * Кнопка подключения кошелька (официальная WalletMultiButton).
 * Можно стилизовать через CSS-переменные или className.
 */

"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletConnectButton() {
  return (
    <WalletMultiButton
      style={{
        background: "linear-gradient(180deg,#FF3E5C,#C4102A 62%,#8C0A1E)",
        borderRadius: 11,
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: "0.08em",
        height: 42,
        padding: "0 18px",
      }}
    />
  );
}
