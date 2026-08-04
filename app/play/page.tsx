"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { ClawMachine, type ClawPhase } from "@/components/ClawMachine";
import { startPlay } from "@/lib/pay";
import Link from "next/link";

type Status = "idle" | "paying" | "verifying" | "playing" | "success" | "error";

export default function PlayPage() {
  const wallet = useWallet();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [playId, setPlayId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ClawPhase>("idle");

  const runClawSequence = useCallback((won: boolean) => {
    setPhase("drop");
    setTimeout(() => setPhase("grab"), 1100);
    setTimeout(() => setPhase("pull"), 1950);
    setTimeout(() => {
      setPhase(won ? "win" : "lose");
      setStatus(won ? "success" : "error");
      setMessage(won ? "Prize secured." : "Better luck next pull.");
    }, 3200);
    setTimeout(() => setPhase("ready"), 5400);
  }, []);

  const onStartPay = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey) {
      setStatus("error");
      setMessage("Connect wallet first");
      return;
    }
    setStatus("paying");
    setMessage("Confirm payment in wallet…");
    setPlayId(null);
    setPhase("idle");
    try {
      setStatus("verifying");
      setMessage("Verifying on-chain…");
      const result = await startPlay(wallet);
      setPlayId(result.playId);
      setStatus("playing");
      setMessage("Session live — press PULL");
      setPhase("ready");
    } catch (e: unknown) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Payment failed");
      setPhase("idle");
    }
  }, [wallet]);

  const onPull = useCallback(() => {
    if (phase !== "ready" && phase !== "idle") return;
    if (!playId) {
      onStartPay();
      return;
    }
    // Temporary client outcome — Phase 2 moves this server-side (VRF).
    // Never display probability / rates to the user.
    const won = Math.random() < 0.3;
    setStatus("playing");
    setMessage(won ? "Locking target…" : "Dropping…");
    runClawSequence(won);
  }, [phase, playId, onStartPay, runClawSequence]);

  const busy =
    status === "paying" ||
    status === "verifying" ||
    ["drop", "grab", "pull"].includes(phase);

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700&family=Exo+2:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <main
        style={{
          minHeight: "100vh",
          background: "#06070B",
          color: "#EDEEF2",
          fontFamily: "Exo 2, Inter, system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            background:
              "radial-gradient(ellipse 70% 45% at 50% -5%, rgba(255,37,68,0.14), transparent 55%), radial-gradient(ellipse 35% 30% at 90% 70%, rgba(34,211,255,0.05), transparent), radial-gradient(ellipse 30% 25% at 10% 80%, rgba(153,69,255,0.04), transparent)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        <header
          style={{
            position: "relative",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(6,7,11,0.85)",
            backdropFilter: "blur(12px)",
          }}
        >
          <Link
            href="/"
            style={{
              textDecoration: "none",
              fontFamily: "Orbitron, sans-serif",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.2em",
              color: "#FF3E5C",
              textShadow: "0 0 14px rgba(255,37,68,0.45)",
            }}
          >
            ← FIATCLAW
          </Link>
          <WalletConnectButton />
        </header>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 520,
            margin: "0 auto",
            padding: "28px 16px 48px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 22,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                margin: "0 0 8px",
                fontFamily: "Orbitron, sans-serif",
                fontSize: 10,
                letterSpacing: "0.32em",
                color: "#FF3E5C",
                fontWeight: 600,
              }}
            >
              LIVE SESSION
            </p>
            <h1
              style={{
                margin: 0,
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 700,
                fontSize: "clamp(22px, 5vw, 30px)",
                letterSpacing: "0.06em",
                lineHeight: 1.2,
              }}
            >
              CLAW MACHINE
            </h1>
          </div>

          <ClawMachine
            phase={phase}
            onPull={onPull}
            disabled={busy && phase === "idle"}
          />

          <div
            style={{
              width: "100%",
              maxWidth: 440,
              padding: "14px 18px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.07)",
              background: "rgba(14,16,22,0.75)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 12,
                letterSpacing: "0.04em",
                color:
                  status === "success"
                    ? "#14F195"
                    : status === "error"
                      ? "#FF6B7A"
                      : "#9BA1AE",
                minHeight: 18,
              }}
            >
              {message ||
                (wallet.connected
                  ? "Press PULL to start a paid session"
                  : "Connect wallet to play")}
            </p>
            {playId && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10,
                  color: "#5c6478",
                  letterSpacing: "0.08em",
                }}
              >
                ID {playId.slice(0, 8)}…
              </p>
            )}
          </div>

          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: "#5c6478",
              textAlign: "center",
              lineHeight: 1.5,
              maxWidth: 360,
            }}
          >
            Payment verified on-chain before every session. Outcome settled after
            the pull.
          </p>
        </div>
      </main>
    </>
  );
}
