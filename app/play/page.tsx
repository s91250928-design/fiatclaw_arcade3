"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { ClawMachine, type ClawPhase } from "@/components/ClawMachine";
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
  /** Synchronous lock so double-click / Space cannot burn two plays. */
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

  const runClawSequence = useCallback((won: boolean, resultMessage: string) => {
    // down → close → lift → hold-or-slip → return
    setPhase("drop");
    setTimeout(() => setPhase("close"), 1000);
    setTimeout(() => setPhase("lift"), 1500);
    setTimeout(() => {
      if (won) {
        setPhase("hold");
      } else {
        setPhase("slip");
      }
    }, 2600);
    setTimeout(() => setPhase("return"), 3200);
    setTimeout(() => {
      setPhase(won ? "win" : "lose");
      setStatus(won ? "success" : "error");
      setMessage(won ? resultMessage : LOSE_COPY);
    }, 4000);
    setTimeout(() => {
      setPhase("ready");
      setPlayId(null);
      setClawX(50);
      setStatus("ready");
      dropGuardRef.current.release();
    }, 6200);
  }, []);

  const onMove = useCallback((dir: "left" | "right") => {
    const step = 7;
    if (dir === "left") setClawX((x) => Math.max(14, x - step));
    if (dir === "right") setClawX((x) => Math.min(86, x + step));
  }, []);

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
    if (phase !== "ready" && phase !== "idle") return;
    if (isDropUiBusy(status, phase)) return;
    // Synchronous lock: second click/Space before await cannot start another attempt.
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
      setMessage("Resolving pull…");

      // Outcome is server-authoritative — never Math.random on client.
      const result = await resolveAttempt(wallet, id);
      setAvailablePlays(result.remainingPlays);
      setJackpot(result.jackpotBalanceLamports);
      setPlayId(id);

      runClawSequence(result.won, result.message);
      setTimeout(() => refreshState(), 4500);
    } catch (e: unknown) {
      dropGuardRef.current.release();
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Play failed");
      setPhase("idle");
      setPlayId(null);
    }
  }, [
    phase,
    status,
    wallet,
    playId,
    availablePlays,
    runClawSequence,
    refreshState,
  ]);

  const busy = isDropUiBusy(status, phase);

  const jackpotSol = (() => {
    const n = Number(jackpot);
    if (!Number.isFinite(n)) return "—";
    return (n / 1e9).toFixed(4);
  })();

  const solPrice = ((priceLamports * feeMultiplier) / 1e9).toFixed(4);
  const clawCost = Math.ceil(clawPrice * feeMultiplier);

  const panel: React.CSSProperties = {
    width: "100%",
    maxWidth: 440,
    padding: "14px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.07)",
    background: "rgba(14,16,22,0.75)",
  };

  const label: React.CSSProperties = {
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 10,
    letterSpacing: "0.12em",
    color: "#5c6478",
    margin: 0,
  };

  const value: React.CSSProperties = {
    fontFamily: "Orbitron, sans-serif",
    fontSize: 13,
    color: "#EDEEF2",
    margin: "4px 0 0",
  };

  const smallBtn = (primary?: boolean): React.CSSProperties => ({
    padding: "10px 14px",
    borderRadius: 10,
    border: primary
      ? "1px solid rgba(255,120,140,0.45)"
      : "1px solid rgba(34,211,255,0.3)",
    background: primary
      ? "linear-gradient(180deg,#FF3E5C,#C4102A 55%,#8C0A1E)"
      : "rgba(20,28,40,0.8)",
    color: "#fff",
    fontFamily: "Orbitron, sans-serif",
    fontSize: 10,
    letterSpacing: "0.1em",
    fontWeight: 600,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.5 : 1,
  });

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
            flexWrap: "wrap",
            gap: 10,
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
            ← CLAWARCADE
          </Link>
          <nav style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Link href="/leaderboard" style={{ color: "#9BA1AE", fontSize: 12, textDecoration: "none" }}>
              Leaderboard
            </Link>
            <Link href="/stake" style={{ color: "#9BA1AE", fontSize: 12, textDecoration: "none" }}>
              Stake
            </Link>
            <Link href="/admin" style={{ color: "#9BA1AE", fontSize: 12, textDecoration: "none" }}>
              Admin
            </Link>
            <WalletConnectButton />
          </nav>
        </header>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 520,
            margin: "0 auto",
            padding: "24px 16px 48px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
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

          {/* Balances + jackpot */}
          <div
            data-play-chrome="balances"
            style={{
              ...panel,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            <div>
              <p style={label}>SOL</p>
              <p style={value} data-balance="sol">
                {wallet.connected
                  ? solBalance == null
                    ? "…"
                    : solBalance.toFixed(4)
                  : "—"}
              </p>
            </div>
            <div>
              <p style={label}>$CLAW</p>
              <p style={value} data-balance="claw">
                {wallet.connected ? clawBalance.toLocaleString() : "—"}
              </p>
            </div>
            <div>
              <p style={label}>PLAYS</p>
              <p style={{ ...value, color: "#22D3FF" }} data-balance="plays">
                {wallet.connected ? availablePlays : "—"}
              </p>
            </div>
          </div>

          <div style={{ ...panel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={label}>LIVE JACKPOT</p>
              <p style={{ ...value, color: "#14F195", fontSize: 16 }} data-jackpot="live">
                {jackpotSol} SOL
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={label}>TIER</p>
              <p style={{ ...value, fontSize: 11 }}>
                {tier}
                {vip ? " · VIP" : ""}
              </p>
            </div>
          </div>

          <ClawMachine
            phase={phase}
            onDrop={onDrop}
            disabled={busy}
            clawX={clawX}
            onMove={onMove}
            canMove={
              wallet.connected &&
              (phase === "ready" || phase === "idle") &&
              availablePlays > 0 &&
              !busy
            }
          />

          {/* Buy plays */}
          <div style={panel} data-play-chrome="buy">
            <p style={{ ...label, marginBottom: 10 }}>BUY PLAYS</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: "#9BA1AE" }}>Qty</label>
              <input
                type="number"
                min={1}
                max={20}
                value={buyCount}
                onChange={(e) => setBuyCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                style={{
                  width: 64,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "#0e1016",
                  color: "#fff",
                }}
              />
              <span style={{ fontSize: 11, color: "#5c6478" }}>
                {solPrice} SOL or {clawCost} $CLAW each
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" style={smallBtn(true)} disabled={busy || !wallet.connected} onClick={onBuySol}>
                BUY WITH SOL
              </button>
              <button type="button" style={smallBtn()} disabled={busy || !wallet.connected} onClick={onBuyClaw}>
                BUY WITH $CLAW
              </button>
              <button type="button" style={smallBtn()} disabled={!wallet.connected} onClick={onFaucet}>
                FAUCET $CLAW
              </button>
            </div>
          </div>

          {/* Staking quick controls */}
          <div style={panel} data-play-chrome="stake">
            <p style={{ ...label, marginBottom: 10 }}>STAKE $CLAW · VIP fee discount</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="number"
                min={100}
                step={100}
                value={stakeAmt}
                onChange={(e) => setStakeAmt(Math.max(1, Number(e.target.value) || 0))}
                style={{
                  width: 100,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "#0e1016",
                  color: "#fff",
                }}
              />
              <span style={{ fontSize: 11, color: "#5c6478" }}>
                Staked: {stakedClaw.toLocaleString()}
              </span>
              <button type="button" style={smallBtn()} disabled={!wallet.connected} onClick={() => onStake("stake")}>
                STAKE
              </button>
              <button type="button" style={smallBtn()} disabled={!wallet.connected} onClick={() => onStake("unstake")}>
                UNSTAKE
              </button>
            </div>
          </div>

          <div style={{ ...panel, textAlign: "center" }}>
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
              data-play-message
            >
              {message ||
                (wallet.connected
                  ? availablePlays > 0
                    ? "Move the joystick, then press PULL"
                    : "Buy plays to enter the machine"
                  : "Connect Phantom or Solflare to play")}
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
                ID {playId.slice(0, 12)}…
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
            Outcomes are decided server-side. Staking reduces play fees only.
          </p>
        </div>
      </main>
    </>
  );
}
