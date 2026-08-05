"use client";

/**
 * AAA FiatClaw Arcade dashboard — etalon layout:
 * left wallet/stats · center vault hero · right controls / how-to-play.
 */

import { useState, useCallback, useEffect, useRef, type CSSProperties } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { ClawMachine } from "@/components/ClawMachine";
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
const RED = "#FF3E5C";
const CYAN = "#22D3FF";
const MUTED = "#8B93A7";
const DIM = "#4A5568";

export default function PlayPage() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [playId, setPlayId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ClawPhase>("idle");
  const [clawX, setClawX] = useState(50);
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

  const runRecoveryAfterLift = useCallback(
    (won: boolean, resultMessage: string) => {
      const seq = pullRecoverySequence(won);
      setTimeout(() => setPhase(seq[0]!), 700);
      setTimeout(() => setPhase(seq[1]!), 1400);
      setTimeout(() => {
        setPhase(seq[2]!);
        setStatus(won ? "success" : "error");
        setMessage(won ? resultMessage : LOSE_COPY);
      }, 2200);
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
    (dir: "left" | "right" | "up" | "down") => {
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

  const onDrop = useCallback(async () => {
    if (!canClickPull(phase)) return;
    if (isDropUiBusy(status, phase) && phase !== "drop" && phase !== "close") {
      return;
    }

    if (phase === "drop" || phase === "close") {
      const next = advancePullClick(phase);
      if (!next) return;
      setPhase(next);
      if (next === "close") setMessage("Locking claws…");
      else if (next === "lift") {
        setMessage("Retracting…");
        const outcome = outcomeRef.current;
        runRecoveryAfterLift(outcome?.won ?? false, outcome?.message ?? LOSE_COPY);
      }
      return;
    }

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

      const result = await resolveAttempt(wallet, id);
      setAvailablePlays(result.remainingPlays);
      setJackpot(result.jackpotBalanceLamports);
      setPlayId(id);
      outcomeRef.current = { won: result.won, message: result.message };
      setPhase("drop");
    } catch (e: unknown) {
      dropGuardRef.current.release();
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Play failed");
      setPhase("idle");
      setPlayId(null);
      outcomeRef.current = null;
    }
  }, [phase, status, wallet, playId, availablePlays, runRecoveryAfterLift]);

  const busy =
    isDropUiBusy(status, phase) && phase !== "drop" && phase !== "close";
  const joyOn =
    wallet.connected &&
    canMoveClaw(phase) &&
    availablePlays > 0 &&
    !busy;
  const pullOn =
    !busy &&
    canClickPull(phase) &&
    (wallet.connected || phase === "drop" || phase === "close");

  const jackpotSol = (() => {
    const n = Number(jackpot);
    if (!Number.isFinite(n)) return "—";
    return (n / 1e9).toFixed(4);
  })();
  const jackpotDisplay =
    jackpotSol === "—" ? "—" : `${jackpotSol} SOL`;

  const solPrice = ((priceLamports * feeMultiplier) / 1e9).toFixed(4);
  const clawCost = Math.ceil(clawPrice * feeMultiplier);
  const shortWallet = wallet.publicKey
    ? `${wallet.publicKey.toBase58().slice(0, 4)}…${wallet.publicKey
        .toBase58()
        .slice(-4)}`
    : null;

  const panel: CSSProperties = {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background:
      "linear-gradient(165deg, rgba(255,255,255,0.05), rgba(8,10,14,0.92))",
    boxShadow: "0 12px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
    padding: "14px 16px",
  };

  const label: CSSProperties = {
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 9,
    letterSpacing: "0.2em",
    color: DIM,
    margin: 0,
  };

  const value: CSSProperties = {
    fontFamily: "Orbitron, sans-serif",
    fontSize: 15,
    fontWeight: 700,
    color: "#EDEEF2",
    margin: "6px 0 0",
  };

  const dpadBtn = (on: boolean): CSSProperties => ({
    width: 44,
    height: 44,
    borderRadius: 10,
    border: `1px solid ${on ? "rgba(255,62,92,0.5)" : "rgba(80,90,110,0.35)"}`,
    background: on
      ? "linear-gradient(180deg, #2a1820, #12080c)"
      : "linear-gradient(180deg, #1a1e28, #0c0e14)",
    color: on ? RED : MUTED,
    fontFamily: "Orbitron, sans-serif",
    fontSize: 16,
    fontWeight: 700,
    cursor: on ? "pointer" : "not-allowed",
    opacity: on ? 1 : 0.4,
    display: "grid",
    placeItems: "center",
  });

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
      <main
        style={{
          minHeight: "100vh",
          background: "#050608",
          color: "#EDEEF2",
          fontFamily: "Inter, system-ui, sans-serif",
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
              "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(255,37,68,0.12), transparent 55%), radial-gradient(ellipse 40% 35% at 80% 70%, rgba(34,211,255,0.06), transparent), radial-gradient(ellipse 35% 30% at 15% 80%, rgba(123,63,228,0.07), transparent)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* Top nav */}
        <header
          style={{
            position: "relative",
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(5,6,8,0.85)",
            backdropFilter: "blur(16px)",
          }}
        >
          <Link
            href="/"
            style={{
              textDecoration: "none",
              fontFamily: "Orbitron, sans-serif",
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: "0.16em",
              color: RED,
              textShadow: "0 0 16px rgba(255,37,68,0.5)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>⬡</span> FIATCLAW
            <span style={{ color: MUTED, fontWeight: 500, fontSize: 10 }}>
              ARCADE
            </span>
          </Link>
          <nav
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {[
              { href: "/play", label: "ARCADE" },
              { href: "/stake", label: "STAKING" },
              { href: "/leaderboard", label: "LEADERBOARD" },
              { href: "/admin", label: "ADMIN" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  padding: "8px 12px",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  color: MUTED,
                  textDecoration: "none",
                  fontFamily: "Orbitron, sans-serif",
                }}
              >
                {l.label}
              </Link>
            ))}
            {shortWallet && (
              <span
                style={{
                  ...label,
                  color: CYAN,
                  padding: "6px 10px",
                  border: "1px solid rgba(34,211,255,0.25)",
                  borderRadius: 8,
                }}
              >
                {shortWallet}
              </span>
            )}
            <WalletConnectButton />
          </nav>
        </header>

        {/* Top stats bar */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
            padding: "12px 16px 0",
            maxWidth: 1440,
            margin: "0 auto",
          }}
        >
          {[
            {
              k: "MEGA JACKPOT",
              v: jackpotDisplay,
              color: RED,
              attr: "jackpot",
            },
            { k: "ONLINE", v: "—", color: "#14F195", attr: "online" },
            {
              k: "PLAYS",
              v: wallet.connected ? String(availablePlays) : "—",
              color: CYAN,
              attr: "plays",
            },
            {
              k: "TIER",
              v: `${tier}${vip ? " · VIP" : ""}`,
              color: "#EDEEF2",
              attr: "tier",
            },
          ].map((c) => (
            <div
              key={c.k}
              style={{
                ...panel,
                textAlign: "center",
                padding: "12px 10px",
              }}
            >
              <p style={label}>{c.k}</p>
              <p
                style={{ ...value, color: c.color, fontSize: 16 }}
                data-stat={c.attr}
              >
                {c.v}
              </p>
            </div>
          ))}
        </div>

        {/* Main 3-column dashboard */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "grid",
            gridTemplateColumns: "minmax(220px, 260px) 1fr minmax(220px, 260px)",
            gap: 14,
            maxWidth: 1440,
            margin: "0 auto",
            padding: "14px 16px 32px",
            alignItems: "stretch",
            minHeight: "calc(100vh - 160px)",
          }}
        >
          {/* LEFT */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={panel} data-play-chrome="wallet">
              <p style={{ ...label, color: RED }}>WALLET OVERVIEW</p>
              <div style={{ marginTop: 12 }}>
                <p style={label}>TOTAL BALANCE</p>
                <p style={value} data-balance="sol">
                  {wallet.connected
                    ? solBalance == null
                      ? "…"
                      : `${solBalance.toFixed(4)} SOL`
                    : "— SOL"}
                </p>
              </div>
              <div style={{ marginTop: 12 }}>
                <p style={label}>$FIATCLAW BALANCE</p>
                <p style={value} data-balance="claw">
                  {wallet.connected ? clawBalance.toLocaleString() : "—"}
                </p>
              </div>
            </div>

            <div style={panel} data-play-chrome="plays">
              <p style={label}>AVAILABLE PLAYS</p>
              <p style={{ ...value, fontSize: 28, color: CYAN }} data-balance="plays">
                {wallet.connected ? availablePlays : "—"}
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  data-buy-action="sol"
                  disabled={busy || !wallet.connected}
                  onClick={onBuySol}
                  style={cta(busy || !wallet.connected)}
                >
                  BUY PLAYS
                </button>
                <button
                  type="button"
                  data-buy-action="claw"
                  disabled={busy || !wallet.connected}
                  onClick={onBuyClaw}
                  style={ctaGhost(busy || !wallet.connected)}
                >
                  $CLAW
                </button>
              </div>
              <p style={{ ...label, marginTop: 10, color: MUTED }}>
                {solPrice} SOL · {clawCost} $CLAW · qty {buyCount}
              </p>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  data-buy-qty="dec"
                  onClick={() => setBuyCount((n) => Math.max(1, n - 1))}
                  style={ctaGhost(false)}
                >
                  −
                </button>
                <button
                  type="button"
                  data-buy-qty="inc"
                  onClick={() => setBuyCount((n) => Math.min(20, n + 1))}
                  style={ctaGhost(false)}
                >
                  +
                </button>
                <button
                  type="button"
                  data-buy-action="faucet"
                  disabled={!wallet.connected}
                  onClick={onFaucet}
                  style={ctaGhost(!wallet.connected)}
                >
                  FAUCET
                </button>
              </div>
            </div>

            <div style={{ ...panel, borderColor: "rgba(255,62,92,0.35)" }}>
              <p style={{ ...label, color: RED }}>PROGRESSIVE JACKPOT</p>
              <p
                style={{
                  ...value,
                  fontSize: 22,
                  color: RED,
                  textShadow: "0 0 18px rgba(255,37,68,0.45)",
                }}
                data-jackpot="live"
              >
                {jackpotDisplay}
              </p>
              <p style={{ ...label, marginTop: 8 }}>$FIATCLAW MEGA VAULT</p>
            </div>

            <div style={panel} data-play-chrome="winners">
              <p style={label}>RECENT WINNERS</p>
              <p style={{ ...label, marginTop: 12, color: MUTED, lineHeight: 1.6 }}>
                Live feed unlocks after first on-chain wins.
              </p>
              <Link
                href="/leaderboard"
                style={{
                  display: "inline-block",
                  marginTop: 12,
                  fontFamily: "Orbitron, sans-serif",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color: CYAN,
                  textDecoration: "none",
                }}
              >
                VIEW ALL →
              </Link>
            </div>

            <div style={panel} data-play-chrome="stake">
              <p style={{ ...label, color: "#9945FF" }}>STAKE $FIATCLAW</p>
              <p style={{ ...label, marginTop: 8, color: MUTED }}>
                VIP fee discount only — does not change outcomes.
              </p>
              <p style={{ ...label, marginTop: 8 }}>
                Staked {stakedClaw.toLocaleString()}
              </p>
              <input
                type="number"
                min={100}
                step={100}
                value={stakeAmt}
                data-stake-input="amount"
                onChange={(e) =>
                  setStakeAmt(Math.max(1, Number(e.target.value) || 0))
                }
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(34,211,255,0.25)",
                  background: "rgba(4,6,10,0.9)",
                  color: "#EDEEF2",
                  fontFamily: "Orbitron, sans-serif",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  data-stake-action="stake"
                  disabled={!wallet.connected}
                  onClick={() => onStake("stake")}
                  style={cta(!wallet.connected)}
                >
                  STAKE
                </button>
                <button
                  type="button"
                  data-stake-action="unstake"
                  disabled={!wallet.connected}
                  onClick={() => onStake("unstake")}
                  style={ctaGhost(!wallet.connected)}
                >
                  UNSTAKE
                </button>
              </div>
            </div>
          </aside>

          {/* CENTER HERO MACHINE (~70%) */}
          <section
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 560,
              gap: 10,
            }}
          >
            <div style={{ flex: 1, minHeight: 520 }}>
              <ClawMachine
                phase={phase}
                onDrop={onDrop}
                disabled={!pullOn && phase !== "drop" && phase !== "close"}
                clawX={clawX}
                onMove={onMove}
                canMove={joyOn}
                playsLeft={wallet.connected ? availablePlays : 0}
                jackpotLabel={jackpotDisplay}
                externalControls
              />
            </div>
            <div
              style={{
                ...panel,
                textAlign: "center",
                padding: "10px 14px",
              }}
              data-play-message
            >
              <p
                style={{
                  margin: 0,
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12,
                  color:
                    status === "success"
                      ? "#14F195"
                      : status === "error"
                        ? "#FF6B7A"
                        : MUTED,
                }}
              >
                {message ||
                  (wallet.connected
                    ? availablePlays > 0 || phase === "drop" || phase === "close"
                      ? phase === "drop"
                        ? "Press PULL again to grab"
                        : phase === "close"
                          ? "Press PULL to lift"
                          : "Aim with D-pad · PULL ×3 to play"
                      : "Buy plays to enter the vault"
                    : "Connect Phantom or Solflare to play")}
              </p>
            </div>
          </section>

          {/* RIGHT */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={panel}>
              <p style={{ ...label, color: CYAN }}>HOW TO PLAY</p>
              <ol
                style={{
                  margin: "12px 0 0",
                  paddingLeft: 18,
                  color: MUTED,
                  fontSize: 12,
                  lineHeight: 1.7,
                  fontFamily: "Inter, sans-serif",
                }}
              >
                <li>MOVE — aim the claw</li>
                <li>AIM — hover over prize</li>
                <li>PULL — drop · grab · lift</li>
                <li>WIN — claim crypto rewards</li>
              </ol>
            </div>

            <div style={panel} data-claw-controls="joystick">
              <p style={label}>CONTROLS</p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 44px 44px",
                  gridTemplateRows: "44px 44px 44px",
                  gap: 6,
                  justifyContent: "center",
                  marginTop: 14,
                }}
              >
                <div />
                <button
                  type="button"
                  aria-label="Up"
                  disabled={!joyOn}
                  onClick={() => onMove("up")}
                  style={dpadBtn(joyOn)}
                >
                  ▲
                </button>
                <div />
                <button
                  type="button"
                  aria-label="Left"
                  data-claw-dir="left"
                  disabled={!joyOn}
                  onClick={() => onMove("left")}
                  style={dpadBtn(joyOn)}
                >
                  ◀
                </button>
                <div
                  data-claw-stick="ball"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: joyOn
                      ? `radial-gradient(circle at 32% 28%, #ff7a8c, ${RED} 55%, #5a0814)`
                      : "radial-gradient(circle at 32% 28%, #3a4250, #12151c)",
                    border: `2px solid ${joyOn ? "rgba(255,62,92,0.7)" : "rgba(80,90,110,0.3)"}`,
                    boxShadow: joyOn
                      ? "0 0 20px rgba(255,37,68,0.5)"
                      : "none",
                  }}
                />
                <button
                  type="button"
                  aria-label="Right"
                  data-claw-dir="right"
                  disabled={!joyOn}
                  onClick={() => onMove("right")}
                  style={dpadBtn(joyOn)}
                >
                  ▶
                </button>
                <div />
                <button
                  type="button"
                  aria-label="Down"
                  disabled={!joyOn}
                  onClick={() => onMove("down")}
                  style={dpadBtn(joyOn)}
                >
                  ▼
                </button>
                <div />
              </div>

              <button
                type="button"
                data-claw-action="pull"
                disabled={!pullOn}
                onClick={onDrop}
                style={{
                  width: "100%",
                  marginTop: 18,
                  minHeight: 78,
                  borderRadius: 14,
                  border: pullOn
                    ? "2px solid rgba(255,140,160,0.95)"
                    : "2px solid rgba(255,62,92,0.45)",
                  cursor: pullOn ? "pointer" : "not-allowed",
                  color: "#fff",
                  fontFamily: "Orbitron, sans-serif",
                  fontWeight: 800,
                  fontSize: 20,
                  letterSpacing: "0.32em",
                  // Always red-neon chrome (etalon) — dim when locked
                  background: pullOn
                    ? `radial-gradient(circle at 40% 22%, #FF9AAB 0%, ${RED} 38%, #B01028 72%, #2a040c 100%)`
                    : `linear-gradient(180deg, #5a1828 0%, #3a0a14 45%, #1a060c 100%)`,
                  boxShadow: pullOn
                    ? "0 0 56px rgba(255,37,68,0.85), 0 0 24px rgba(255,62,92,0.55), 0 8px 0 #2a040c, inset 0 2px 0 rgba(255,255,255,0.4)"
                    : "0 0 22px rgba(255,37,68,0.28), inset 0 1px 0 rgba(255,120,140,0.15)",
                  opacity:
                    !wallet.connected && phase !== "drop" && phase !== "close"
                      ? 0.72
                      : 1,
                  transition: "transform 0.12s, box-shadow 0.2s",
                  textShadow: "0 0 18px rgba(255,62,92,0.8)",
                }}
              >
                {phase === "drop"
                  ? "GRAB"
                  : phase === "close"
                    ? "LIFT"
                    : busy
                      ? "···"
                      : "PULL"}
              </button>
              <p
                style={{
                  ...label,
                  textAlign: "center",
                  marginTop: 10,
                  color: MUTED,
                }}
              >
                USE 1 PLAY · STATUS {clawStatusLabel(phase)}
              </p>
            </div>

            <div style={panel}>
              <p style={label}>SESSION</p>
              <p style={{ ...value, fontSize: 12, color: MUTED, marginTop: 8 }}>
                Outcomes decided server-side. Staking reduces play fees only.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

function cta(off: boolean): CSSProperties {
  return {
    flex: 1,
    padding: "11px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,120,140,0.45)",
    cursor: off ? "not-allowed" : "pointer",
    color: "#fff",
    fontFamily: "Orbitron, sans-serif",
    fontWeight: 800,
    fontSize: 10,
    letterSpacing: "0.12em",
    background: off
      ? "rgba(70,74,88,0.45)"
      : "linear-gradient(180deg,#FF3E5C,#C4102A 62%,#8C0A1E)",
    boxShadow: off ? "none" : "0 0 20px rgba(255,37,68,0.35)",
    opacity: off ? 0.55 : 1,
  };
}

function ctaGhost(off: boolean): CSSProperties {
  return {
    flex: 1,
    padding: "11px 12px",
    borderRadius: 10,
    border: "1px solid rgba(34,211,255,0.35)",
    cursor: off ? "not-allowed" : "pointer",
    color: CYAN,
    fontFamily: "Orbitron, sans-serif",
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: "0.12em",
    background: "linear-gradient(180deg, rgba(20,36,48,0.95), rgba(8,12,18,0.98))",
    opacity: off ? 0.55 : 1,
  };
}
