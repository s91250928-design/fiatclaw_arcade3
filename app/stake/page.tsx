"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { fetchPlayerState, faucetClaw, stakeClawApi } from "@/lib/pay";

const TIERS = [
  { min: 0, label: "Standard", fee: "100%" },
  { min: 1000, label: "Bronze", fee: "95%" },
  { min: 5000, label: "Silver VIP", fee: "90%" },
  { min: 25000, label: "Gold VIP", fee: "85%" },
  { min: 100000, label: "Diamond VIP", fee: "80%" },
];

export default function StakePage() {
  const wallet = useWallet();
  const [claw, setClaw] = useState(0);
  const [staked, setStaked] = useState(0);
  const [tier, setTier] = useState("Standard");
  const [fee, setFee] = useState(1);
  const [vip, setVip] = useState(false);
  const [amount, setAmount] = useState(1000);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    if (!wallet.publicKey) return;
    const d = await fetchPlayerState(wallet.publicKey.toBase58());
    if (d?.ok) {
      setClaw(Number(d.clawBalance ?? 0));
      setStaked(Number(d.stakedClaw ?? 0));
      setTier(String(d.tier ?? "Standard"));
      setFee(Number(d.feeMultiplier ?? 1));
      setVip(Boolean(d.vip));
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const act = async (action: "stake" | "unstake") => {
    if (!wallet.publicKey) return;
    try {
      const r = await stakeClawApi(wallet.publicKey.toBase58(), action, amount);
      setClaw(r.clawBalance);
      setStaked(r.stakedClaw);
      setTier(r.tier);
      setFee(r.feeMultiplier);
      setVip(r.vip);
      setMsg(`${action} ok · ${r.tier} · fee ${Math.round(r.feeMultiplier * 100)}%`);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "#06070B", color: "#EDEEF2", fontFamily: "Inter, system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/play" style={{ color: "#FF3E5C", textDecoration: "none", fontFamily: "Orbitron, sans-serif", fontSize: 12 }}>
          ← PLAY
        </Link>
        <WalletConnectButton />
      </header>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: 28 }}>
        <h1 style={{ fontFamily: "Orbitron, sans-serif", letterSpacing: "0.08em" }}>STAKE $CLAW</h1>
        <p style={{ color: "#9BA1AE", fontSize: 14, lineHeight: 1.6 }}>
          Staking reduces play fees and unlocks VIP labels. It does <strong>not</strong> change
          win probability or prize weights.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "20px 0" }}>
          <div style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(14,16,22,0.8)" }}>
            <div style={{ fontSize: 11, color: "#5c6478" }}>BALANCE</div>
            <div style={{ fontSize: 20, fontFamily: "Orbitron, sans-serif" }}>{claw.toLocaleString()}</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(14,16,22,0.8)" }}>
            <div style={{ fontSize: 11, color: "#5c6478" }}>STAKED</div>
            <div style={{ fontSize: 20, fontFamily: "Orbitron, sans-serif" }}>{staked.toLocaleString()}</div>
          </div>
        </div>

        <p style={{ color: "#22D3FF" }}>
          {tier}
          {vip ? " · VIP" : ""} · Fee multiplier {Math.round(fee * 100)}%
        </p>

        <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#0e1016", color: "#fff", width: 120 }}
          />
          <button type="button" onClick={() => act("stake")} style={{ padding: "10px 16px", borderRadius: 8, background: "#FF3E5C", border: "none", color: "#fff", cursor: "pointer" }}>
            Stake
          </button>
          <button type="button" onClick={() => act("unstake")} style={{ padding: "10px 16px", borderRadius: 8, background: "#1a3040", border: "1px solid #22D3FF", color: "#22D3FF", cursor: "pointer" }}>
            Unstake
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!wallet.publicKey) return;
              await faucetClaw(wallet.publicKey.toBase58(), 5000);
              refresh();
            }}
            style={{ padding: "10px 16px", borderRadius: 8, background: "transparent", border: "1px solid #555", color: "#9BA1AE", cursor: "pointer" }}
          >
            Faucet 5k
          </button>
        </div>
        {msg && <p style={{ color: "#9BA1AE", fontSize: 13 }}>{msg}</p>}

        <h2 style={{ fontFamily: "Orbitron, sans-serif", fontSize: 14, marginTop: 32 }}>REWARD TIERS</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {TIERS.map((t) => (
            <li
              key={t.label}
              style={{
                padding: "10px 0",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                justifyContent: "space-between",
                color: staked >= t.min ? "#14F195" : "#9BA1AE",
              }}
            >
              <span>
                {t.label} · ≥{t.min.toLocaleString()} staked
              </span>
              <span>{t.fee} fees</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
