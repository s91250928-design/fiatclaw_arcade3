"use client";

/**
 * Transparent term staking: form (amount + term) + Active table + My stakes.
 * All payout/APR/status from server only.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import {
  fetchActiveStakes,
  fetchStakeStatus,
  stakeClawApi,
  stakeWithSol,
  type StakePositionRow,
  type StakeStatusResponse,
} from "@/lib/pay";

type TermOpt = { termDays: number; apr: number; aprBps: number };

function shortWallet(w: string) {
  if (!w || w.length < 10) return w;
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function StakePage() {
  const wallet = useWallet();
  const [staked, setStaked] = useState(0);
  const [tier, setTier] = useState("Standard");
  const [fee, setFee] = useState(1);
  const [vip, setVip] = useState(false);
  const [terms, setTerms] = useState<TermOpt[]>([
    { termDays: 7, apr: 8, aprBps: 800 },
    { termDays: 30, apr: 12, aprBps: 1200 },
    { termDays: 90, apr: 18, aprBps: 1800 },
  ]);
  const [activePositions, setActivePositions] = useState<StakePositionRow[]>(
    []
  );
  const [myPositions, setMyPositions] = useState<StakePositionRow[]>([]);
  const [lamportsPerUnit, setLamportsPerUnit] = useState(10_000);
  const [amount, setAmount] = useState(1000);
  const [termDays, setTermDays] = useState(30);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setErr("");
    try {
      const table = await fetchActiveStakes(50);
      if (table.ok) {
        if (Array.isArray(table.positions)) setActivePositions(table.positions);
        if (Array.isArray(table.terms) && table.terms.length) {
          setTerms(table.terms);
        }
      }

      if (!wallet.publicKey) {
        setMyPositions([]);
        return;
      }
      const d: StakeStatusResponse & {
        myPositions?: StakePositionRow[];
        terms?: TermOpt[];
      } = await fetchStakeStatus(wallet.publicKey.toBase58(), {
        history: true,
      });
      if (d?.ok) {
        setStaked(Number(d.stakedClaw ?? d.staked_amount ?? 0));
        setTier(String(d.tier ?? "Standard"));
        setFee(Number(d.feeMultiplier ?? 1));
        setVip(Boolean(d.vip));
        if (typeof d.stakeLamportsPerUnit === "number") {
          setLamportsPerUnit(d.stakeLamportsPerUnit);
        }
        if (Array.isArray(d.terms) && d.terms.length) setTerms(d.terms);
        if (Array.isArray(d.myPositions)) setMyPositions(d.myPositions);
      } else if (d?.error) {
        setErr(d.error);
      }
    } catch {
      setErr("Failed to load stakes");
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const selectedTerm = terms.find((t) => t.termDays === termDays) ?? terms[1];
  const estSol = ((amount * lamportsPerUnit) / 1e9).toFixed(6);
  // Client preview only — server is authoritative on credit
  const previewReward =
    selectedTerm && amount > 0
      ? Math.floor(
          (amount * selectedTerm.aprBps * selectedTerm.termDays) /
            (10_000 * 365)
        )
      : 0;

  const onStake = async () => {
    if (!wallet.publicKey || !wallet.connected) {
      setErr("Connect wallet first");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("Confirm SOL transfer to treasury…");
    try {
      const r = await stakeWithSol(
        wallet,
        amount,
        lamportsPerUnit,
        termDays
      );
      setMsg(
        r.credited
          ? `Staked +${amount} · ${termDays}d · payout ${r.position?.expectedPayout ?? r.expectedPayout ?? "—"} · ${r.tier}`
          : String(r.reason ?? r.error ?? "Not credited")
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
    try {
      const r = await stakeClawApi(
        wallet.publicKey.toBase58(),
        "unstake",
        amount
      );
      setMsg(
        `Unstake request ${amount} · payout ${r.payoutStatus ?? "pending"}`
      );
      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Unstake failed");
    } finally {
      setBusy(false);
    }
  };

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
  };
  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 6px",
    color: "#5c6478",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  };
  const td: React.CSSProperties = {
    padding: "8px 6px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    color: "#EDEEF2",
  };

  const renderTable = (
    rows: StakePositionRow[],
    empty: string,
    attr: string
  ) => (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle} data-stake-table={attr}>
        <thead>
          <tr>
            <th style={th}>Wallet</th>
            <th style={th}>Amount</th>
            <th style={th}>Term</th>
            <th style={th}>Start</th>
            <th style={th}>End</th>
            <th style={th}>APR</th>
            <th style={th}>Payout</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} style={{ ...td, color: "#5c6478" }}>
                {empty}
              </td>
            </tr>
          )}
          {rows.map((p) => (
            <tr key={p.id}>
              <td style={td}>{shortWallet(p.wallet)}</td>
              <td style={td}>{p.amount.toLocaleString()}</td>
              <td style={td}>{p.termDays}d</td>
              <td style={td}>{fmtDate(p.startedAt)}</td>
              <td style={td}>{fmtDate(p.endsAt)}</td>
              <td style={td}>{p.apr}%</td>
              <td style={{ ...td, color: "#14F195" }}>
                {p.expectedPayout.toLocaleString()}
              </td>
              <td style={td}>{p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

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

      <div style={{ maxWidth: 960, margin: "0 auto", padding: 28 }}>
        <h1
          style={{ fontFamily: "Orbitron, sans-serif", letterSpacing: "0.08em" }}
        >
          STAKING
        </h1>
        <p style={{ color: "#9BA1AE", fontSize: 14, lineHeight: 1.6 }}>
          Lock stake for a fixed term. APR and expected payout are calculated on
          the <strong>server</strong>. Does not change win probability (0.2).
        </p>

        {/* Summary */}
        <div
          data-stake-status="server"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
            gap: 12,
            margin: "20px 0",
          }}
        >
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(14,16,22,0.8)",
            }}
          >
            <div style={{ fontSize: 10, color: "#5c6478" }}>MY STAKED</div>
            <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: 18 }}>
              {wallet.connected ? staked.toLocaleString() : "—"}
            </div>
          </div>
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(14,16,22,0.8)",
            }}
          >
            <div style={{ fontSize: 10, color: "#5c6478" }}>VIP / FEE</div>
            <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: 16 }}>
              {wallet.connected
                ? `${tier}${vip ? " VIP" : ""} · ${Math.round(fee * 100)}%`
                : "—"}
            </div>
          </div>
        </div>

        {/* Form */}
        <section
          data-stake-form
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(255,62,92,0.3)",
            background: "rgba(255,62,92,0.05)",
            marginBottom: 28,
          }}
        >
          <h2
            style={{
              fontFamily: "Orbitron, sans-serif",
              fontSize: 13,
              letterSpacing: "0.1em",
              marginTop: 0,
            }}
          >
            STAKE
          </h2>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
            }}
          >
            <label style={{ fontSize: 12, color: "#9BA1AE" }}>
              Amount{" "}
              <input
                type="number"
                min={1}
                value={amount}
                data-stake-input="amount"
                onChange={(e) =>
                  setAmount(Math.max(1, Number(e.target.value) || 1))
                }
                style={{
                  marginLeft: 6,
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #333",
                  background: "#0e1016",
                  color: "#fff",
                  width: 110,
                }}
              />
            </label>
            <label style={{ fontSize: 12, color: "#9BA1AE" }}>
              Term{" "}
              <select
                data-stake-input="term"
                value={termDays}
                onChange={(e) => setTermDays(Number(e.target.value))}
                style={{
                  marginLeft: 6,
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #333",
                  background: "#0e1016",
                  color: "#fff",
                }}
              >
                {terms.map((t) => (
                  <option key={t.termDays} value={t.termDays}>
                    {t.termDays} days · {t.apr}% APR
                  </option>
                ))}
              </select>
            </label>
            <span style={{ fontSize: 11, color: "#5c6478" }}>
              ≈ {estSol} SOL · preview reward ~{previewReward.toLocaleString()}{" "}
              (server finalizes)
            </span>
            <button
              type="button"
              data-stake-action="stake"
              disabled={busy || !wallet.connected}
              onClick={() => onStake()}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                background: !wallet.connected || busy ? "#3a1520" : "#FF3E5C",
                border: "none",
                color: "#fff",
                cursor:
                  !wallet.connected || busy ? "not-allowed" : "pointer",
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
          </div>
          {msg && (
            <p data-stake-msg style={{ color: "#9BA1AE", fontSize: 13 }}>
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
        </section>

        {/* Active public table */}
        <section style={{ marginBottom: 32 }} data-stake-section="active">
          <h2
            style={{
              fontFamily: "Orbitron, sans-serif",
              fontSize: 13,
              letterSpacing: "0.1em",
            }}
          >
            ACTIVE STAKES
          </h2>
          {renderTable(activePositions, "No active stakes yet.", "active")}
        </section>

        {/* My stakes */}
        <section data-stake-section="my">
          <h2
            style={{
              fontFamily: "Orbitron, sans-serif",
              fontSize: 13,
              letterSpacing: "0.1em",
            }}
          >
            MY STAKES
          </h2>
          {!wallet.connected ? (
            <p style={{ color: "#5c6478", fontSize: 13 }}>
              Connect wallet to see your positions.
            </p>
          ) : (
            renderTable(myPositions, "You have no stakes yet.", "mine")
          )}
        </section>
      </div>
    </main>
  );
}
