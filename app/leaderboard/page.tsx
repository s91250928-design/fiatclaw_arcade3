"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WalletConnectButton } from "@/components/WalletConnectButton";

type Row = {
  wallet: string;
  totalPlays: number;
  wins: number;
  losses: number;
  solWonLamports: string;
  clawWon: number;
  biggestWinLamports: string;
};

type WindowKey = "daily" | "weekly" | "all";

export default function LeaderboardPage() {
  const [window, setWindow] = useState<WindowKey>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard?window=${window}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setRows(d.rows ?? []);
      })
      .finally(() => setLoading(false));
  }, [window]);

  const tab = (w: WindowKey, label: string) => (
    <button
      type="button"
      key={w}
      onClick={() => setWindow(w)}
      style={{
        padding: "8px 16px",
        borderRadius: 8,
        border: window === w ? "1px solid rgba(255,62,92,0.5)" : "1px solid rgba(255,255,255,0.08)",
        background: window === w ? "rgba(255,37,68,0.15)" : "transparent",
        color: window === w ? "#FF3E5C" : "#9BA1AE",
        fontFamily: "Orbitron, sans-serif",
        fontSize: 11,
        letterSpacing: "0.1em",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <main style={{ minHeight: "100vh", background: "#06070B", color: "#EDEEF2", fontFamily: "Inter, system-ui, sans-serif" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Link href="/play" style={{ color: "#FF3E5C", textDecoration: "none", fontFamily: "Orbitron, sans-serif", fontSize: 12, letterSpacing: "0.15em" }}>
          ← PLAY
        </Link>
        <WalletConnectButton />
      </header>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 16px" }}>
        <h1 style={{ fontFamily: "Orbitron, sans-serif", fontSize: 24, letterSpacing: "0.08em", margin: "0 0 20px" }}>
          LEADERBOARD
        </h1>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {tab("daily", "DAILY")}
          {tab("weekly", "WEEKLY")}
          {tab("all", "ALL-TIME")}
        </div>

        {loading ? (
          <p style={{ color: "#5c6478" }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: "#5c6478" }}>No plays yet in this window.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "#5c6478", textAlign: "left" }}>
                  <th style={{ padding: "10px 8px" }}>#</th>
                  <th style={{ padding: "10px 8px" }}>Wallet</th>
                  <th style={{ padding: "10px 8px" }}>Plays</th>
                  <th style={{ padding: "10px 8px" }}>W</th>
                  <th style={{ padding: "10px 8px" }}>L</th>
                  <th style={{ padding: "10px 8px" }}>SOL Won</th>
                  <th style={{ padding: "10px 8px" }}>$CLAW</th>
                  <th style={{ padding: "10px 8px" }}>Biggest</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.wallet} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "10px 8px", color: "#FF3E5C" }}>{i + 1}</td>
                    <td style={{ padding: "10px 8px", fontFamily: "monospace", fontSize: 11 }}>
                      {r.wallet.slice(0, 4)}…{r.wallet.slice(-4)}
                    </td>
                    <td style={{ padding: "10px 8px" }}>{r.totalPlays}</td>
                    <td style={{ padding: "10px 8px", color: "#14F195" }}>{r.wins}</td>
                    <td style={{ padding: "10px 8px", color: "#FF6B7A" }}>{r.losses}</td>
                    <td style={{ padding: "10px 8px" }}>
                      {(Number(r.solWonLamports) / 1e9).toFixed(4)}
                    </td>
                    <td style={{ padding: "10px 8px" }}>{r.clawWon}</td>
                    <td style={{ padding: "10px 8px" }}>
                      {(Number(r.biggestWinLamports) / 1e9).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
