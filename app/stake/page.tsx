"use client";

/**
 * Stake UI — server status + Phase 2 on-chain stake (SOL → treasury).
 * Staking never changes win probability.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import {
  fetchStakeStatus,
  stakeClawApi,
  stakeWithSol,
  type StakeHistoryItem,
  type StakeStatusResponse,
} from "@/lib/pay";

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
  const [history, setHistory] = useState<StakeHistoryItem[]>([]);
  const [lamportsPerUnit, setLamportsPerUnit] = useState(10_000);
  const [amount, setAmount] = useState(1000);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet.publicKey) return;
    setLoading(true);
    setErr("");
    try {
      const d: StakeStatusResponse & { history?: StakeHistoryItem[] } =
        await fetchStakeStatus(wallet.publicKey.toBase58(), { history: true });
      if (d?.ok) {
        setStaked(Number(d.stakedClaw ?? d.staked_amount ?? 0));
        setTier(String(d.tier ?? "Standard"));
        setFee(Number(d.feeMultiplier ?? 1));
        setVip(Boolean(d.vip));
        setUpdatedAt(String(d.updated_at ?? "—"));
        if (Array.isArray(d.tiers)) setTiers(d.tiers);
        if (typeof d.stakeLamportsPerUnit === "number") {
          setLamportsPerUnit(d.stakeLamportsPerUnit);
        }
        if (Array.isArray(d.history)) setHistory(d.history);
      } else {
        setErr(d?.error ?? "Failed to load stake status");
      }
    } catch {
      setErr("Failed to load stake status");
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const estSol = ((amount * lamportsPerUnit) / 1e9).toFixed(6);

  const onStake = async () => {
    if (!wallet.publicKey || !wallet.connected) {
      setErr("Connect wallet first");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("Confirm SOL transfer to treasury in wallet…");
    try {
      const r = await stakeWithSol(wallet, amount, lamportsPerUnit);
      setStaked(Number(r.stakedClaw ?? 0));
      setTier(String(r.tier ?? "Standard"));
      setFee(Number(r.feeMultiplier ?? 1));
      setVip(Boolean(r.vip));
      setUpdatedAt(String(r.updated_at ?? "—"));
      if (Array.isArray(r.history)) setHistory(r.history);
      setMsg(
        r.credited
          ? `Staked +${amount} · ${r.tier} · fee ${Math.round(Number(r.feeMultiplier) * 100)}%`
          : String(r.reason ?? r.error ?? "Stake not credited")
      );
      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Stake failed");
      setMsg("");
    } finally {
      setBusy(false);
    }
  };

  const onUnstake = async () => {
    if (!wallet.publicKey) return;
    setBusy(true);
    setErr("");
    setMsg("Submitting unstake request…");
    try {
      const r = await stakeClawApi(
        wallet.publicKey.toBase58(),
        "unstake",
        amount
      );
      setStaked(Number(r.stakedClaw ?? 0));
      setTier(String(r.tier ?? "Standard"));
      setFee(Number(r.feeMultiplier ?? 1));
      setVip(Boolean(r.vip));
      if (Array.isArray(r.history)) setHistory(r.history);
      setMsg(
        `Unstake request ${amount} · payout ${r.payoutStatus ?? "pending"} · ${r.tier}`
      );
      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Unstake failed");
      setMsg("");
    } finally {
      setBusy(false);
    }
  };

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
          Stake via on-chain SOL payment to treasury. VIP fee discount only —
          does <strong>not</strong> change win probability (server 0.2).
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
            margin: "16px 0",
            padding: 14,
            borderRadius: 12,
            border: "1px solid rgba(34,211,255,0.25)",
            background: "rgba(34,211,255,0.05)",
            fontSize: 12,
            color: "#9BA1AE",
            lineHeight: 1.5,
          }}
          data-stake-phase="2"
        >
          <strong style={{ color: "#22D3FF" }}>Phase 2</strong> — Stake sends
          SOL to treasury; server verifies tx then credits. Replay protected.
          Unstake is a request (no free claw mint / no browser keys).
        </div>

        <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="number"
            min={1}
            value={amount}
            data-stake-input="amount"
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #333",
              background: "#0e1016",
              color: "#fff",
              width: 120,
            }}
          />
          <span style={{ fontSize: 12, color: "#5c6478" }}>≈ {estSol} SOL</span>
          <button
            type="button"
            data-stake-action="stake"
            disabled={busy || !wallet.connected}
            onClick={() => onStake()}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: busy || !wallet.connected ? "#3a1520" : "#FF3E5C",
              border: "none",
              color: "#fff",
              cursor: busy || !wallet.connected ? "not-allowed" : "pointer",
            }}
          >
            Stake (SOL tx)
          </button>
          <button
            type="button"
            data-stake-action="unstake"
            disabled={busy || !wallet.connected || staked < 1}
            onClick={() => onUnstake()}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: "#1a3040",
              border: "1px solid #22D3FF",
              color: "#22D3FF",
              cursor:
                busy || !wallet.connected || staked < 1
                  ? "not-allowed"
                  : "pointer",
              opacity: busy || !wallet.connected || staked < 1 ? 0.5 : 1,
            }}
          >
            Unstake request
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
            Refresh
          </button>
        </div>
        {msg && (
          <p style={{ color: "#9BA1AE", fontSize: 13 }} data-stake-msg>
            {msg}
          </p>
        )}
        {err && (
          <p
            role="alert"
            data-stake-error
            style={{ color: "#FF6B7A", fontSize: 13 }}
          >
            {err}
          </p>
        )}

        <h2
          style={{
            fontFamily: "Orbitron, sans-serif",
            fontSize: 14,
            marginTop: 32,
          }}
        >
          HISTORY
        </h2>
        <ul
          data-stake-history
          style={{ listStyle: "none", padding: 0, marginBottom: 28 }}
        >
          {history.length === 0 && (
            <li style={{ color: "#5c6478", fontSize: 12 }}>No stake events yet.</li>
          )}
          {history.map((h) => (
            <li
              key={h.id}
              style={{
                padding: "10px 0",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                fontSize: 12,
                color: "#9BA1AE",
              }}
            >
              <span style={{ color: h.type === "stake" ? "#14F195" : "#22D3FF" }}>
                {h.type.toUpperCase()}
              </span>{" "}
              · {h.amount.toLocaleString()} · {h.createdAt}
              {h.txSignature ? (
                <span style={{ display: "block", fontSize: 10, color: "#5c6478" }}>
                  tx {String(h.txSignature).slice(0, 12)}…
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        <h2
          style={{
            fontFamily: "Orbitron, sans-serif",
            fontSize: 14,
            marginTop: 32,
          }}
        >
          REWARD TIERS (SERVER)
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
