/**
 * Connect button — WalletMultiButton opens modal (Phantom + Solflare).
 * Connect-after-select handles official Phantom connect / Solflare adapter.
 * Errors (incl. Install Phantom + link) shown under the button.
 */

"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWalletUiError } from "@/components/SolanaProvider";
import {
  isPhantomInstallMessage,
  PHANTOM_INSTALL_URL,
} from "@/lib/wallet/phantom-official";

export function WalletConnectButton() {
  const [mounted, setMounted] = useState(false);
  const { publicKey, connected, wallets } = useWallet();
  const { error, setError } = useWalletUiError();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (connected) setError(null);
  }, [connected, setError]);

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

  const names = wallets.map((w) => String(w.adapter.name));
  const address = publicKey?.toBase58() ?? "";
  // Install link only for true install copy — not "Opening Phantom…" mobile deep-link
  const showInstall = Boolean(
    error &&
      isPhantomInstallMessage(error) &&
      !/opening phantom/i.test(error)
  );

  return (
    <div
      data-wallet-connect="ready"
      data-wallet-connected={connected ? "true" : "false"}
      data-wallet-address={address}
      data-wallet-count={String(wallets.length)}
      data-wallet-names={names.join(",")}
      data-has-phantom={names.includes("Phantom") ? "true" : "false"}
      data-has-solflare={names.includes("Solflare") ? "true" : "false"}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-end",
        flexShrink: 0,
        position: "relative",
        zIndex: 30,
        gap: 4,
        maxWidth: "100%",
      }}
    >
      <WalletMultiButton style={btnStyle} className="fiatclaw-wallet-btn" />
      {error && (
        <p
          data-wallet-error
          data-phantom-install={showInstall ? "true" : "false"}
          role="alert"
          style={{
            margin: 0,
            maxWidth: 240,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            lineHeight: 1.35,
            color: "#FF6B7A",
            textAlign: "right",
          }}
        >
          {showInstall ? (
            <>
              Install Phantom:{" "}
              <a
                href={PHANTOM_INSTALL_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-phantom-install-link
                style={{ color: "#22D3FF", textDecoration: "underline" }}
              >
                {PHANTOM_INSTALL_URL}
              </a>
            </>
          ) : (
            error
          )}
        </p>
      )}
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
