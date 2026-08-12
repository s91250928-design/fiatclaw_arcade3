"use client";

/**
 * Stake UI — displays server stake status only.
 * Phase 1: Stake/Unstake disabled (no amount-as-credit). Phase 2: on-chain tx.
 * Staking never changes win probability.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { fetchStakeStatus, type StakeStatusResponse } from "@/lib/pay";

type TierRow = {
  minStaked: number;
  feeMultiplier: number;
  vip: boolean;
  label: string;
};

export default function StakePage() {
  const wallet = useWallet();
  const [staked, setStaked] = useState(0);
  const [tier, setTier] = useState("Standard");
  const [fee, setFee] = useState(1);
  const [vip, setVip] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>("—");
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet.publicKey) return;
    setLoading(true);
    try {
      const d: StakeStatusResponse = await fetchStakeStatus(
        wallet.publicKey.toBase58()
      );
      if (d?.ok) {
        setStaked(Number(d.stakedClaw ?? d.staked_amount ?? 0));
        setTier(String(d.tier ?? "Standard"));
        setFee(Number(d.feeMultiplier ?? 1));
        setVip(Boolean(d.vip));
        setUpdatedAt(String(d.updated_at ?? "—"));
        if (Array.isArray(d.tiers)) setTiers(d.tiers);
      } else {
        setMsg(d?.error ?? "Failed to load stake status");
      }
    } catch {
      setMsg("Failed to load stake status");
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#06070B",
        color: "#EDEEF2",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Link
          href="/play"
          style={{
            color: "#FF3E5C",
            textDecoration: "none",
            fontFamily: "Orbitron, sans-serif",
            fontSize: 12,
          }}
        >
          ← PLAY
        </Link>
        <WalletConnectButton />
      </header>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: 28 }}>
        <h1
          style={{ fontFamily: "Orbitron, sans-serif", letterSpacing: "0.08em" }}
        >
          STAKE $FIATCLAW
        </h1>
        <p style={{ color: "#9BA1AE", fontSize: 14, lineHeight: 1.6 }}>
          Staking reduces play fees and unlocks VIP. It does{" "}
          <strong>not</strong> change win probability or prize weights
          (server WIN_PROBABILITY stays 0.2).
        </p>

        <div
          data-stake-status="server"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            margin: "20px 0",
          }}
        >
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(14,16,22,0.8)",
            }}
          >
            <div style={{ fontSize: 11, color: "#5c6478" }}>STAKED (SERVER)</div>
            <div
              data-stake-staked
              style={{ fontSize: 20, fontFamily: "Orbitron, sans-serif" }}
            >
              {loading ? "…" : staked.toLocaleString()}
            </div>
          </div>
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(14,16,22,0.8)",
            }}
          >
            <div style={{ fontSize: 11, color: "#5c6478" }}>FEE MULTIPLIER</div>
            <div
              data-stake-fee
              style={{ fontSize: 20, fontFamily: "Orbitron, sans-serif" }}
            >
              {Math.round(fee * 100)}%
            </div>
          </div>
        </div>

        <p style={{ color: "#22D3FF" }} data-stake-tier>
          {tier}
          {vip ? " · VIP" : ""} · updated {updatedAt}
        </p>

        <div
          style={{
            margin: "20px 0",
            padding: 14,
            borderRadius: 12,
            border: "1px solid rgba(255,62,92,0.35)",
            background: "rgba(255,62,92,0.06)",
            fontSize: 13,
            color: "#9BA1AE",
            lineHeight: 1.5,
          }}
          data-stake-phase="1"
        >
          <strong style={{ color: "#FF3E5C" }}>Phase 1</strong> — stake status is
          server-owned. Stake/Unstake credit requires an on-chain transaction
          (Phase 2). You cannot set stake by posting an amount from the client.
        </div>

        <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
          <button
            type="button"
            data-stake-action="stake"
            disabled
            title="Phase 2: on-chain tx required"
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: "#3a1520",
              border: "none",
              color: "#6a4a52",
              cursor: "not-allowed",
            }}
          >
            Stake (Phase 2)
          </button>
          <button
            type="button"
            data-stake-action="unstake"
            disabled
            title="Phase 2: controlled unstake"
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: "#121820",
              border: "1px solid #2a4050",
              color: "#4a7080",
              cursor: "not-allowed",
            }}
          >
            Unstake (Phase 2)
          </button>
          <button
            type="button"
            onClick={() => refresh()}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: "transparent",
              border: "1px solid #555",
              color: "#9BA1AE",
              cursor: "pointer",
            }}
          >
            Refresh status
          </button>
        </div>
        {msg && (
          <p style={{ color: "#9BA1AE", fontSize: 13 }} data-stake-msg>
            {msg}
          </p>
        )}

        <h2
          style={{
            fontFamily: "Orbitron, sans-serif",
            fontSize: 14,
            marginTop: 32,
          }}
        >
          REWARD TIERS (SERVER TABLE)
        </h2>
        <ul style={{ listStyle: "none", padding: 0 }} data-stake-tiers>
          {(tiers.length
            ? tiers
            : [
                { minStaked: 0, label: "Standard", feeMultiplier: 1, vip: false },
                {
                  minStaked: 1000,
                  label: "Bronze",
                  feeMultiplier: 0.95,
                  vip: false,
                },
                {
                  minStaked: 5000,
                  label: "Silver VIP",
                  feeMultiplier: 0.9,
                  vip: true,
                },
                {
                  minStaked: 25000,
                  label: "Gold VIP",
                  feeMultiplier: 0.85,
                  vip: true,
                },
                {
                  minStaked: 100000,
                  label: "Diamond VIP",
                  feeMultiplier: 0.8,
                  vip: true,
                },
              ]
          ).map((t) => (
            <li
              key={t.label}
              style={{
                padding: "10px 0",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                justifyContent: "space-between",
                color: staked >= t.minStaked ? "#14F195" : "#9BA1AE",
              }}
            >
              <span>
                {t.label} · ≥{t.minStaked.toLocaleString()} staked
              </span>
              <span>{Math.round(t.feeMultiplier * 100)}% fees</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
