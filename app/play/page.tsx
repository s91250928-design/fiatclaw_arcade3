"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import {
  buyPlaysClaw,
  buyPlaysSol,
  faucetClaw,
  fetchPlayerState,
  resolveAttempt,
  stakeClawApi,
  startAttempt,
} from "@/lib/pay";
import { createDropGuard, isDropUiBusy } from "@/lib/game/drop-guard";
import {
  advancePullClick,
  canClickPull,
  canMoveClaw,
  clawStatusLabel,
  pullRecoverySequence,
  type ClawPhase,
} from "@/lib/game/claw-phases";
import Link from "next/link";

type Status =
  | "idle"
  | "buying"
  | "ready"
  | "starting"
  | "playing"
  | "success"
  | "error";

const LOSE_COPY = "Better Luck Next Pull.";

export default function PlayPage() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [playId, setPlayId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ClawPhase>("idle");
  const [clawX, setClawX] = useState(50);
  /** Server outcome for current pull — set on 1st PULL, used after 3rd. */
  const outcomeRef = useRef<{ won: boolean; message: string } | null>(null);

  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [clawBalance, setClawBalance] = useState(0);
  const [availablePlays, setAvailablePlays] = useState(0);
  const [stakedClaw, setStakedClaw] = useState(0);
  const [feeMultiplier, setFeeMultiplier] = useState(1);
  const [tier, setTier] = useState("Standard");
  const [vip, setVip] = useState(false);
  const [jackpot, setJackpot] = useState<string>("—");
  const [priceLamports, setPriceLamports] = useState(50_000_000);
  const [clawPrice, setClawPrice] = useState(500);
  const [buyCount, setBuyCount] = useState(1);
  const [stakeAmt, setStakeAmt] = useState(1000);
  /** Synchronous lock so double-click cannot burn two plays on 1st PULL. */
  const dropGuardRef = useRef(createDropGuard());

  const refreshState = useCallback(async () => {
    if (!wallet.publicKey) return;
    const addr = wallet.publicKey.toBase58();
    try {
      const lamports = await connection.getBalance(wallet.publicKey, "confirmed");
      setSolBalance(lamports / 1e9);
    } catch {
      setSolBalance(null);
    }
    try {
      const data = await fetchPlayerState(addr);
      if (data?.ok) {
        setClawBalance(Number(data.clawBalance ?? 0));
        setAvailablePlays(Number(data.availablePlays ?? 0));
        setStakedClaw(Number(data.stakedClaw ?? 0));
        setFeeMultiplier(Number(data.feeMultiplier ?? 1));
        setTier(String(data.tier ?? "Standard"));
        setVip(Boolean(data.vip));
        setJackpot(String(data.jackpotBalanceLamports ?? "0"));
        setPriceLamports(Number(data.priceLamports ?? 50_000_000));
        setClawPrice(Number(data.clawPrice ?? 500));
      }
    } catch {
      /* ignore */
    }
  }, [wallet.publicKey, connection]);

  useEffect(() => {
    if (!wallet.connected || !wallet.publicKey) {
      setSolBalance(null);
      setClawBalance(0);
      setAvailablePlays(0);
      return;
    }
    refreshState();
    const t = setInterval(refreshState, 12_000);
    return () => clearInterval(t);
  }, [wallet.connected, wallet.publicKey, refreshState]);

  /**
   * After 3rd PULL click reaches lift — auto hold/slip → return → win/lose → ready.
   * Does not start a new play; outcome already resolved on click 1.
   */
  const runRecoveryAfterLift = useCallback(
    (won: boolean, resultMessage: string) => {
      const seq = pullRecoverySequence(won);
      // hold | slip
      setTimeout(() => setPhase(seq[0]!), 700);
      // return
      setTimeout(() => setPhase(seq[1]!), 1400);
      // win | lose
      setTimeout(() => {
        setPhase(seq[2]!);
        setStatus(won ? "success" : "error");
        setMessage(won ? resultMessage : LOSE_COPY);
      }, 2200);
      // ready
      setTimeout(() => {
        setPhase("ready");
        setPlayId(null);
        setClawX(50);
        setStatus("ready");
        outcomeRef.current = null;
        dropGuardRef.current.release();
      }, 4200);
      setTimeout(() => refreshState(), 2500);
    },
    [refreshState]
  );

  const onMove = useCallback(
    (dir: "left" | "right") => {
      if (!canMoveClaw(phase)) return;
      const step = 7;
      if (dir === "left") setClawX((x) => Math.max(14, x - step));
      if (dir === "right") setClawX((x) => Math.min(86, x + step));
    },
    [phase]
  );

  const onBuySol = useCallback(async () => {
    if (!wallet.connected) {
      setMessage("Connect wallet first");
      setStatus("error");
      return;
    }
    setStatus("buying");
    setMessage("Confirm SOL payment in wallet…");
    try {
      const r = await buyPlaysSol(
        wallet,
        buyCount,
        feeMultiplier,
        BigInt(priceLamports)
      );
      setAvailablePlays(r.availablePlays);
      setMessage(`+${r.playsBought} plays. Ready when you are.`);
      setStatus("ready");
      setPhase("ready");
      await refreshState();
    } catch (e: unknown) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Purchase failed");
    }
  }, [wallet, buyCount, feeMultiplier, priceLamports, refreshState]);

  const onBuyClaw = useCallback(async () => {
    if (!wallet.connected) {
      setMessage("Connect wallet first");
      setStatus("error");
      return;
    }
    setStatus("buying");
    setMessage("Debiting $CLAW…");
    try {
      const r = await buyPlaysClaw(wallet, buyCount);
      setAvailablePlays(r.availablePlays);
      setClawBalance(r.clawBalance);
      setMessage(`+${buyCount} plays for ${r.costClaw} $CLAW.`);
      setStatus("ready");
      setPhase("ready");
    } catch (e: unknown) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Purchase failed");
    }
  }, [wallet, buyCount]);

  const onFaucet = useCallback(async () => {
    if (!wallet.publicKey) return;
    setMessage("Claiming dev $CLAW…");
    const r = await faucetClaw(wallet.publicKey.toBase58(), 5000);
    if (r.ok) {
      setClawBalance(r.clawBalance);
      setMessage("Credited 5000 $CLAW (dev faucet).");
    } else {
      setMessage(r.error ?? "Faucet failed");
    }
  }, [wallet.publicKey]);

  const onStake = useCallback(
    async (action: "stake" | "unstake") => {
      if (!wallet.publicKey) return;
      try {
        const r = await stakeClawApi(
          wallet.publicKey.toBase58(),
          action,
          stakeAmt
        );
        setClawBalance(r.clawBalance);
        setStakedClaw(r.stakedClaw);
        setFeeMultiplier(r.feeMultiplier);
        setTier(r.tier);
        setVip(r.vip);
        setMessage(
          action === "stake"
            ? `Staked ${stakeAmt} $CLAW · ${r.tier}`
            : `Unstaked ${stakeAmt} $CLAW · ${r.tier}`
        );
      } catch (e: unknown) {
        setMessage(e instanceof Error ? e.message : "Stake failed");
        setStatus("error");
      }
    },
    [wallet.publicKey, stakeAmt]
  );

  /**
   * 3-click PULL:
   * 1) ready/idle → arm server + resolve (once) → drop
   * 2) drop → close (grab)
   * 3) close → lift → auto recovery (win/lose)
   */
  const onDrop = useCallback(async () => {
    if (!canClickPull(phase)) return;
    if (isDropUiBusy(status, phase) && phase !== "drop" && phase !== "close") {
      return;
    }

    // Steps 2–3: local only — no second server charge
    if (phase === "drop" || phase === "close") {
      const next = advancePullClick(phase);
      if (!next) return;
      setPhase(next);
      if (next === "close") {
        setMessage("Locking claws…");
      } else if (next === "lift") {
        setMessage("Retracting…");
        const outcome = outcomeRef.current;
        if (outcome) {
          runRecoveryAfterLift(outcome.won, outcome.message);
        } else {
          // Fail-safe: treat as miss if outcome missing
          runRecoveryAfterLift(false, LOSE_COPY);
        }
      }
      return;
    }

    // Step 1: server arm + resolve (single play burn)
    if (!dropGuardRef.current.tryAcquire()) return;
    if (!wallet.connected || !wallet.publicKey) {
      dropGuardRef.current.release();
      setStatus("error");
      setMessage("Connect wallet first");
      return;
    }

    setStatus("starting");
    setMessage("Arming claw…");
    try {
      let id = playId;
      if (!id) {
        if (availablePlays < 1) {
          dropGuardRef.current.release();
          setStatus("error");
          setMessage("No plays available — buy plays first");
          return;
        }
        const started = await startAttempt(wallet);
        id = started.playId;
        setPlayId(id);
        setAvailablePlays(started.availablePlays);
        if (started.jackpotBalanceLamports) {
          setJackpot(started.jackpotBalanceLamports);
        }
      }

      setStatus("playing");
      setMessage("Claw descending — press PULL to grab");

      // Outcome is server-authoritative — never Math.random on client.
      const result = await resolveAttempt(wallet, id);
      setAvailablePlays(result.remainingPlays);
      setJackpot(result.jackpotBalanceLamports);
      setPlayId(id);
      outcomeRef.current = { won: result.won, message: result.message };

      // Click 1 complete → DESCENDING (player clicks again for grab)
      setPhase("drop");
    } catch (e: unknown) {
      dropGuardRef.current.release();
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Play failed");
      setPhase("idle");
      setPlayId(null);
      outcomeRef.current = null;
    }
  }, [
    phase,
    status,
    wallet,
    playId,
    availablePlays,
    runRecoveryAfterLift,
  ]);

  const busy =
    isDropUiBusy(status, phase) && phase !== "drop" && phase !== "close";

  const jackpotSol = (() => {
    const n = Number(jackpot);
    if (!Number.isFinite(n)) return "—";
    return (n / 1e9).toFixed(4);
  })();

  const solPrice = ((priceLamports * feeMultiplier) / 1e9).toFixed(4);
  const clawCost = Math.ceil(clawPrice * feeMultiplier);

  /* ── FiatClaw landing tokens ── */
  const RED = "#FF3E5C";
  const CYAN = "#22D3FF";
  const MUTED = "#9BA1AE";
  const DIM = "#5E6472";

  const glassCard: React.CSSProperties = {
    width: "100%",
    maxWidth: 500,
    padding: "18px 18px",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.085)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.014))",
    boxShadow:
      "0 26px 62px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.09), 0 0 40px rgba(255,37,68,0.06)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  };

  const glassCardCyan: React.CSSProperties = {
    ...glassCard,
    border: "1px solid rgba(34,211,255,0.22)",
    boxShadow:
      "0 26px 62px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.09), 0 0 32px rgba(34,211,255,0.08)",
  };

  const monoLabel: React.CSSProperties = {
    fontFamily: "JetBrains Mono, ui-monospace, monospace",
    fontSize: 9,
    letterSpacing: "0.22em",
    color: DIM,
    margin: 0,
    fontWeight: 500,
  };

  const orbitValue: React.CSSProperties = {
    fontFamily: "Orbitron, sans-serif",
    fontSize: 14,
    fontWeight: 600,
    color: "#EDEEF2",
    margin: "6px 0 0",
    letterSpacing: "0.04em",
  };

  const ctaPrimary = (off?: boolean): React.CSSProperties => ({
    padding: "12px 18px",
    borderRadius: 11,
    border: "1px solid rgba(255,120,140,0.45)",
    cursor: off ? "not-allowed" : "pointer",
    color: "#fff",
    fontFamily: "Orbitron, Inter, sans-serif",
    fontWeight: 800,
    fontSize: 10,
    letterSpacing: "0.14em",
    background: off
      ? "rgba(70,74,88,0.45)"
      : "linear-gradient(180deg,#FF3E5C,#C4102A 62%,#8C0A1E)",
    boxShadow: off
      ? "none"
      : "0 0 24px rgba(255,37,68,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
    opacity: off ? 0.55 : 1,
    transition: "transform 0.2s, box-shadow 0.2s",
  });

  const ctaGhost = (off?: boolean): React.CSSProperties => ({
    padding: "12px 18px",
    borderRadius: 11,
    border: "1px solid rgba(34,211,255,0.35)",
    cursor: off ? "not-allowed" : "pointer",
    color: CYAN,
    fontFamily: "Orbitron, Inter, sans-serif",
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: "0.14em",
    background:
      "linear-gradient(180deg, rgba(20,36,48,0.95), rgba(8,12,18,0.98))",
    boxShadow: off
      ? "none"
      : "0 0 18px rgba(34,211,255,0.15), inset 0 1px 0 rgba(255,255,255,0.08)",
    opacity: off ? 0.55 : 1,
  });

  const fieldInput: React.CSSProperties = {
    width: 88,
    padding: "12px 14px",
    borderRadius: 11,
    border: "1px solid rgba(34,211,255,0.28)",
    background: "rgba(4,6,10,0.85)",
    color: "#EDEEF2",
    fontFamily: "Orbitron, sans-serif",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.06em",
    outline: "none",
    boxShadow: "inset 0 0 18px rgba(34,211,255,0.06), 0 0 0 1px rgba(0,0,0,0.3)",
  };

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800&family=Exo+2:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
      <main
        style={{
          minHeight: "100vh",
          background: "#0a0b10",
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
              "radial-gradient(ellipse 70% 45% at 50% -5%, rgba(255,37,68,0.16), transparent 55%), radial-gradient(ellipse 35% 30% at 90% 70%, rgba(34,211,255,0.06), transparent), radial-gradient(ellipse 30% 25% at 10% 80%, rgba(153,69,255,0.05), transparent)",
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
            flexWrap: "wrap",
            gap: 10,
            padding: "14px clamp(14px,3vw,28px)",
            height: 64,
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            background: "linear-gradient(180deg, rgba(10,11,16,0.92), rgba(10,11,16,0.75))",
            backdropFilter: "blur(18px) saturate(150%)",
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
              color: RED,
              textShadow: "0 0 14px rgba(255,37,68,0.45)",
            }}
          >
            ← FIATCLAW
          </Link>
          <nav style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {[
              { href: "/leaderboard", label: "LEADERBOARD" },
              { href: "/stake", label: "STAKE" },
              { href: "/admin", label: "ADMIN" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  padding: "8px 11px",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  color: MUTED,
                  textDecoration: "none",
                  fontFamily: "Inter, sans-serif",
                }}
              >
                {l.label}
              </Link>
            ))}
            <WalletConnectButton />
          </nav>
        </header>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 540,
            margin: "0 auto",
            padding: "24px 16px 64px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 4 }}>
            <p
              style={{
                margin: "0 0 8px",
                fontFamily: "Orbitron, sans-serif",
                fontSize: 10,
                letterSpacing: "0.36em",
                color: RED,
                fontWeight: 600,
                textShadow: "0 0 16px rgba(255,37,68,0.45)",
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
                letterSpacing: "0.08em",
                lineHeight: 1.2,
              }}
            >
              CLAW MACHINE
            </h1>
          </div>

          {/* Balances — glass grid */}
          <div
            data-play-chrome="balances"
            style={{
              ...glassCard,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 0,
              padding: 0,
              overflow: "hidden",
            }}
          >
            {[
              {
                k: "SOL",
                v: wallet.connected
                  ? solBalance == null
                    ? "…"
                    : solBalance.toFixed(4)
                  : "—",
                color: "#EDEEF2",
                attr: "sol",
              },
              {
                k: "$CLAW",
                v: wallet.connected ? clawBalance.toLocaleString() : "—",
                color: "#EDEEF2",
                attr: "claw",
              },
              {
                k: "PLAYS",
                v: wallet.connected ? String(availablePlays) : "—",
                color: CYAN,
                attr: "plays",
              },
            ].map((cell, i) => (
              <div
                key={cell.k}
                style={{
                  padding: "16px 14px",
                  borderRight: i < 2 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                  textAlign: "center",
                }}
              >
                <p style={monoLabel}>{cell.k}</p>
                <p
                  style={{ ...orbitValue, color: cell.color, fontSize: 15 }}
                  data-balance={cell.attr}
                >
                  {cell.v}
                </p>
              </div>
            ))}
          </div>

          {/* Jackpot bar */}
          <div
            data-play-chrome="jackpot"
            style={{
              ...glassCardCyan,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 20px",
            }}
          >
            <div>
              <p style={monoLabel}>LIVE JACKPOT</p>
              <p
                style={{
                  ...orbitValue,
                  color: "#14F195",
                  fontSize: 18,
                  textShadow: "0 0 18px rgba(20,241,149,0.35)",
                }}
                data-jackpot="live"
              >
                {jackpotSol} SOL
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={monoLabel}>TIER</p>
              <p style={{ ...orbitValue, fontSize: 12, color: MUTED }}>
                {tier}
                {vip ? " · VIP" : ""}
              </p>
            </div>
          </div>

          {/* Claw machine UI removed — bare play controls only */}
          <div
            data-play-controls="bare"
            style={{
              ...glassCard,
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <p style={monoLabel}>STATUS</p>
              <p style={{ ...orbitValue, fontSize: 13 }} data-claw-status={clawStatusLabel(phase)}>
                {clawStatusLabel(phase)}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                data-claw-dir="left"
                disabled={
                  !wallet.connected ||
                  !canMoveClaw(phase) ||
                  availablePlays < 1 ||
                  busy
                }
                onClick={() => onMove("left")}
                style={ctaGhost(
                  !wallet.connected ||
                    !canMoveClaw(phase) ||
                    availablePlays < 1 ||
                    busy
                )}
              >
                ←
              </button>
              <span style={{ ...monoLabel, minWidth: 48, textAlign: "center" }}>
                {Math.round(clawX)}
              </span>
              <button
                type="button"
                data-claw-dir="right"
                disabled={
                  !wallet.connected ||
                  !canMoveClaw(phase) ||
                  availablePlays < 1 ||
                  busy
                }
                onClick={() => onMove("right")}
                style={ctaGhost(
                  !wallet.connected ||
                    !canMoveClaw(phase) ||
                    availablePlays < 1 ||
                    busy
                )}
              >
                →
              </button>
            </div>
            <button
              type="button"
              data-claw-action="pull"
              disabled={
                busy ||
                !canClickPull(phase) ||
                (!wallet.connected &&
                  phase !== "drop" &&
                  phase !== "close")
              }
              onClick={onDrop}
              style={ctaPrimary(
                busy ||
                  !canClickPull(phase) ||
                  (!wallet.connected &&
                    phase !== "drop" &&
                    phase !== "close")
              )}
            >
              PULL
            </button>
          </div>

          {/* BUY PLAYS — landing glass card */}
          <div style={glassCard} data-play-chrome="buy">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <p
                style={{
                  ...monoLabel,
                  color: RED,
                  letterSpacing: "0.26em",
                  fontSize: 10,
                }}
              >
                BUY PLAYS
              </p>
              <span
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10,
                  color: MUTED,
                  letterSpacing: "0.04em",
                }}
              >
                {solPrice} SOL · {clawCost} $CLAW
              </span>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                marginBottom: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <p style={{ ...monoLabel, marginBottom: 8 }}>QTY</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    data-buy-qty="dec"
                    onClick={() => setBuyCount((n) => Math.max(1, n - 1))}
                    style={ctaGhost(busy)}
                    disabled={busy}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={buyCount}
                    data-buy-input="qty"
                    onChange={(e) =>
                      setBuyCount(
                        Math.max(1, Math.min(20, Number(e.target.value) || 1))
                      )
                    }
                    style={{ ...fieldInput, width: 72, textAlign: "center" }}
                  />
                  <button
                    type="button"
                    data-buy-qty="inc"
                    onClick={() => setBuyCount((n) => Math.min(20, n + 1))}
                    style={ctaGhost(busy)}
                    disabled={busy}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <button
                type="button"
                data-buy-action="sol"
                style={ctaPrimary(busy || !wallet.connected)}
                disabled={busy || !wallet.connected}
                onClick={onBuySol}
              >
                BUY WITH SOL
              </button>
              <button
                type="button"
                data-buy-action="claw"
                style={ctaGhost(busy || !wallet.connected)}
                disabled={busy || !wallet.connected}
                onClick={onBuyClaw}
              >
                BUY WITH $CLAW
              </button>
              <button
                type="button"
                data-buy-action="faucet"
                style={ctaGhost(!wallet.connected)}
                disabled={!wallet.connected}
                onClick={onFaucet}
              >
                FAUCET $CLAW
              </button>
            </div>
          </div>

          {/* STAKE — landing glass card */}
          <div style={glassCard} data-play-chrome="stake">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <p
                style={{
                  ...monoLabel,
                  color: CYAN,
                  letterSpacing: "0.26em",
                  fontSize: 10,
                }}
              >
                STAKE $CLAW
              </p>
              <span
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10,
                  color: MUTED,
                }}
              >
                Staked {stakedClaw.toLocaleString()}
              </span>
            </div>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 12,
                color: MUTED,
                lineHeight: 1.5,
              }}
            >
              VIP fee discount only — does not change outcomes.
            </p>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <div>
                <p style={{ ...monoLabel, marginBottom: 8 }}>AMOUNT</p>
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={stakeAmt}
                  data-stake-input="amount"
                  onChange={(e) =>
                    setStakeAmt(Math.max(1, Number(e.target.value) || 0))
                  }
                  style={{ ...fieldInput, width: 120 }}
                />
              </div>
              <button
                type="button"
                data-stake-action="stake"
                style={ctaPrimary(!wallet.connected)}
                disabled={!wallet.connected}
                onClick={() => onStake("stake")}
              >
                STAKE
              </button>
              <button
                type="button"
                data-stake-action="unstake"
                style={ctaGhost(!wallet.connected)}
                disabled={!wallet.connected}
                onClick={() => onStake("unstake")}
              >
                UNSTAKE
              </button>
            </div>
          </div>

          {/* Session message */}
          <div
            style={{
              ...glassCard,
              textAlign: "center",
              padding: "14px 18px",
              borderColor:
                status === "success"
                  ? "rgba(20,241,149,0.35)"
                  : status === "error"
                    ? "rgba(255,107,122,0.35)"
                    : "rgba(255,255,255,0.085)",
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
                      : MUTED,
                minHeight: 18,
              }}
              data-play-message
            >
              {message ||
                (wallet.connected
                  ? availablePlays > 0 || phase === "drop" || phase === "close"
                    ? phase === "drop"
                      ? "Press PULL again to grab"
                      : phase === "close"
                        ? "Press PULL to lift"
                        : "Move joystick, then PULL ×3: drop · grab · lift"
                    : "Buy plays to enter the machine"
                  : "Connect Phantom or Solflare to play")}
            </p>
            {playId && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10,
                  color: DIM,
                  letterSpacing: "0.08em",
                }}
              >
                ID {playId.slice(0, 12)}…
              </p>
            )}
          </div>

          <p
            style={{
              margin: 0,
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9,
              letterSpacing: "0.14em",
              color: DIM,
              textAlign: "center",
              lineHeight: 1.6,
              maxWidth: 380,
            }}
          >
            Outcomes decided server-side. Staking reduces play fees only.
          </p>
        </div>
      </main>
    </>
  );
}
