"use client";

/**
 * Full-screen claw game session (entered from lobby via PLAY NOW).
 * Reuses ClawMachine + claw phases + pay APIs. Not embedded in lobby.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClawMachine } from "@/components/ClawMachine";
import { resolveAttempt, startAttempt } from "@/lib/pay";
import { createDropGuard, isDropUiBusy } from "@/lib/game/drop-guard";
import {
  advancePullClick,
  canClickPull,
  canMoveClaw,
  clawStatusLabel,
  pullRecoverySequence,
  type ClawPhase,
} from "@/lib/game/claw-phases";
import { useArcadePlayer } from "@/hooks/useArcadePlayer";
import {
  RED,
  CYAN,
  MUTED,
  FONTS_HREF,
  labelStyle,
  valueStyle,
  panelStyle,
  dpadBtnStyle,
} from "@/lib/arcade-ui";

const LOSE_COPY = "Better Luck Next Pull.";

export function GameSession() {
  const router = useRouter();
  const player = useArcadePlayer();
  const {
    wallet,
    status,
    setStatus,
    message,
    setMessage,
    availablePlays,
    setAvailablePlays,
    jackpotDisplay,
    setJackpot,
    refreshState,
  } = player;

  const [playId, setPlayId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ClawPhase>("ready");
  const [clawX, setClawX] = useState(50);
  const [sessionTimer, setSessionTimer] = useState(0);
  const [roundDone, setRoundDone] = useState(false);
  const outcomeRef = useRef<{ won: boolean; message: string } | null>(null);
  const dropGuardRef = useRef(createDropGuard());

  // Fresh balances when entering vault from lobby
  useEffect(() => {
    void refreshState();
    setStatus("ready");
    setMessage(
      wallet.connected
        ? availablePlays > 0
          ? "Aim · PULL ×3 to play"
          : "No plays — return to lobby to buy"
        : "Connect wallet in lobby, then enter vault"
    );
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Session clock (display only)
  useEffect(() => {
    const t = setInterval(() => setSessionTimer((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const runRecoveryAfterLift = useCallback(
    (won: boolean, resultMessage: string) => {
      const seq = pullRecoverySequence(won);
      setTimeout(() => setPhase(seq[0]!), 700);
      setTimeout(() => setPhase(seq[1]!), 1400);
      setTimeout(() => {
        setPhase(seq[2]!);
        setStatus(won ? "success" : "error");
        setMessage(won ? resultMessage : LOSE_COPY);
        setRoundDone(true);
      }, 2200);
      setTimeout(() => {
        setPlayId(null);
        setClawX(50);
        setPhase("ready");
        outcomeRef.current = null;
        dropGuardRef.current.release();
        void refreshState();
      }, 4200);
    },
    [refreshState, setMessage, setStatus]
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
        runRecoveryAfterLift(
          outcome?.won ?? false,
          outcome?.message ?? LOSE_COPY
        );
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

    setRoundDone(false);
    setStatus("starting");
    setMessage("Arming claw…");
    try {
      let id = playId;
      if (!id) {
        if (availablePlays < 1) {
          dropGuardRef.current.release();
          setStatus("error");
          setMessage("No plays available — return to lobby to buy plays");
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
      setPhase("ready");
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
    setAvailablePlays,
    setJackpot,
    setMessage,
    setStatus,
  ]);

  const busy =
    isDropUiBusy(status, phase) && phase !== "drop" && phase !== "close";
  const joyOn =
    wallet.connected && canMoveClaw(phase) && availablePlays > 0 && !busy;
  const pullOn =
    !busy &&
    canClickPull(phase) &&
    (wallet.connected || phase === "drop" || phase === "close");

  const mm = String(Math.floor(sessionTimer / 60)).padStart(2, "0");
  const ss = String(sessionTimer % 60).padStart(2, "0");

  const playAgain = () => {
    if (availablePlays < 1) {
      setMessage("No plays left — return to lobby to buy");
      return;
    }
    setRoundDone(false);
    setPhase("ready");
    setStatus("ready");
    setMessage("Aim · PULL ×3 to play");
    setClawX(50);
    setPlayId(null);
    dropGuardRef.current.release();
    void refreshState();
  };

  const lastWon = status === "success";

  return (
    <>
      <link href={FONTS_HREF} rel="stylesheet" />
      <main
        data-game-scene="fullscreen"
        style={{
          minHeight: "100vh",
          height: "100vh",
          background: "#030406",
          color: "#EDEEF2",
          fontFamily: "Inter, system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            background:
              "radial-gradient(ellipse 55% 45% at 50% 35%, rgba(255,37,68,0.14), transparent 55%), radial-gradient(ellipse 40% 30% at 70% 80%, rgba(34,211,255,0.07), transparent)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* Top HUD */}
        <header
          style={{
            position: "relative",
            zIndex: 20,
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(4,5,8,0.92)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              href="/play"
              data-game-action="lobby"
              style={{
                textDecoration: "none",
                fontFamily: "Orbitron, sans-serif",
                fontSize: 10,
                letterSpacing: "0.14em",
                color: MUTED,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              ← LOBBY
            </Link>
            <span
              style={{
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: "0.16em",
                color: RED,
              }}
            >
              FIATCLAW VAULT
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <HudChip label="JACKPOT" value={jackpotDisplay} color={RED} attr="jackpot" />
            <HudChip
              label="PLAYS"
              value={wallet.connected ? String(availablePlays) : "—"}
              color={CYAN}
              attr="plays"
            />
            <HudChip label="TIMER" value={`${mm}:${ss}`} color="#EDEEF2" attr="timer" />
            <HudChip
              label="STATUS"
              value={clawStatusLabel(phase)}
              color="#14F195"
              attr="machine-status"
            />
          </div>

          <div style={{ textAlign: "right" }}>
            <span style={{ ...labelStyle, color: MUTED }}>
              {wallet.connected ? "SESSION LIVE" : "CONNECT WALLET"}
            </span>
          </div>
        </header>

        {/* Machine + controls */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr minmax(200px, 240px)",
            gap: 12,
            padding: "12px 16px 16px",
            minHeight: 0,
          }}
        >
          <section
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              gap: 8,
            }}
          >
            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
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
                ...panelStyle,
                textAlign: "center",
                padding: "10px 14px",
              }}
              data-play-message
              data-game-message
            >
              <p
                style={{
                  margin: 0,
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 13,
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
                    ? availablePlays > 0 ||
                      phase === "drop" ||
                      phase === "close"
                      ? phase === "drop"
                        ? "Press PULL again to grab"
                        : phase === "close"
                          ? "Press PULL to lift"
                          : "Aim with D-pad · PULL ×3 to play"
                      : "No plays — return to lobby to buy"
                    : "Connect wallet in lobby, then enter vault")}
              </p>
            </div>
          </section>

          {/* Right control column */}
          <aside
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 0,
            }}
          >
            <div style={panelStyle} data-claw-controls="joystick">
              <p style={labelStyle}>CONTROLS</p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "48px 48px 48px",
                  gridTemplateRows: "48px 48px 48px",
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
                  style={dpadBtnStyle(joyOn)}
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
                  style={dpadBtnStyle(joyOn)}
                >
                  ◀
                </button>
                <div
                  data-claw-stick="ball"
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: joyOn
                      ? `radial-gradient(circle at 32% 28%, #ff7a8c, ${RED} 55%, #5a0814)`
                      : "radial-gradient(circle at 32% 28%, #3a4250, #12151c)",
                    border: `2px solid ${
                      joyOn ? "rgba(255,62,92,0.7)" : "rgba(80,90,110,0.3)"
                    }`,
                    boxShadow: joyOn ? "0 0 20px rgba(255,37,68,0.5)" : "none",
                  }}
                />
                <button
                  type="button"
                  aria-label="Right"
                  data-claw-dir="right"
                  disabled={!joyOn}
                  onClick={() => onMove("right")}
                  style={dpadBtnStyle(joyOn)}
                >
                  ▶
                </button>
                <div />
                <button
                  type="button"
                  aria-label="Down"
                  disabled={!joyOn}
                  onClick={() => onMove("down")}
                  style={dpadBtnStyle(joyOn)}
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
                  minHeight: 84,
                  borderRadius: 14,
                  border: pullOn
                    ? "2px solid rgba(255,140,160,0.95)"
                    : "2px solid rgba(255,62,92,0.45)",
                  cursor: pullOn ? "pointer" : "not-allowed",
                  color: "#fff",
                  fontFamily: "Orbitron, sans-serif",
                  fontWeight: 800,
                  fontSize: 22,
                  letterSpacing: "0.32em",
                  background: pullOn
                    ? `radial-gradient(circle at 40% 22%, #FF9AAB 0%, ${RED} 38%, #B01028 72%, #2a040c 100%)`
                    : `linear-gradient(180deg, #5a1828 0%, #3a0a14 45%, #1a060c 100%)`,
                  boxShadow: pullOn
                    ? "0 0 56px rgba(255,37,68,0.85), 0 8px 0 #2a040c"
                    : "0 0 22px rgba(255,37,68,0.28)",
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
                  ...labelStyle,
                  textAlign: "center",
                  marginTop: 10,
                  color: MUTED,
                }}
              >
                USE 1 PLAY · {clawStatusLabel(phase)}
              </p>
            </div>

            <div style={panelStyle} data-game-reward-tray>
              <p style={{ ...labelStyle, color: CYAN }}>REWARD TRAY</p>
              <p style={{ ...valueStyle, fontSize: 13, color: MUTED, marginTop: 10 }}>
                {status === "success"
                  ? message || "SECURED"
                  : status === "error" && roundDone
                    ? LOSE_COPY
                    : "Prizes drop here on a successful pull."}
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                data-game-action="play-again"
                onClick={playAgain}
                disabled={!wallet.connected || availablePlays < 1 || busy}
                style={{
                  width: "100%",
                  minHeight: 48,
                  borderRadius: 12,
                  border: "none",
                  cursor:
                    wallet.connected && availablePlays > 0 && !busy
                      ? "pointer"
                      : "not-allowed",
                  color: "#fff",
                  fontFamily: "Orbitron, sans-serif",
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: "0.16em",
                  background:
                    wallet.connected && availablePlays > 0
                      ? `linear-gradient(180deg, ${RED}, #8C0A1E)`
                      : "rgba(70,74,88,0.5)",
                  opacity: wallet.connected && availablePlays > 0 ? 1 : 0.5,
                }}
              >
                PLAY AGAIN
              </button>
              <button
                type="button"
                data-game-action="return-lobby"
                onClick={() => router.push("/play")}
                style={{
                  width: "100%",
                  minHeight: 44,
                  borderRadius: 12,
                  border: "1px solid rgba(34,211,255,0.4)",
                  cursor: "pointer",
                  color: CYAN,
                  fontFamily: "Orbitron, sans-serif",
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  background: "rgba(8,14,22,0.95)",
                }}
              >
                RETURN TO DASHBOARD
              </button>
            </div>

            <div style={{ ...panelStyle, marginTop: "auto" }}>
              <p style={labelStyle}>SESSION</p>
              <p style={{ ...valueStyle, fontSize: 11, color: MUTED, marginTop: 8 }}>
                Outcomes decided server-side. Staking reduces play fees only.
              </p>
            </div>
          </aside>
        </div>

        {/* Round-end overlay (Phase 1 shell) */}
        {roundDone && (
          <div
            data-game-end-overlay
            data-game-end-actions
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "grid",
              placeItems: "center",
              background: "rgba(2,3,6,0.72)",
              backdropFilter: "blur(8px)",
              padding: 24,
            }}
          >
            <div
              style={{
                ...panelStyle,
                maxWidth: 400,
                width: "100%",
                textAlign: "center",
                padding: "28px 24px",
                border: lastWon
                  ? "1px solid rgba(20,241,149,0.45)"
                  : "1px solid rgba(255,62,92,0.4)",
                boxShadow: lastWon
                  ? "0 0 48px rgba(20,241,149,0.2)"
                  : "0 0 48px rgba(255,37,68,0.25)",
              }}
            >
              <p
                style={{
                  ...labelStyle,
                  color: lastWon ? "#14F195" : RED,
                  letterSpacing: "0.28em",
                }}
              >
                {lastWon ? "SECURED" : "MISS"}
              </p>
              <p
                style={{
                  ...valueStyle,
                  fontSize: 18,
                  marginTop: 12,
                  color: lastWon ? "#14F195" : "#FF8A96",
                }}
              >
                {lastWon ? message || "Reward secured" : LOSE_COPY}
              </p>
              <p style={{ ...labelStyle, marginTop: 14, color: MUTED }}>
                PLAYS LEFT · {wallet.connected ? availablePlays : "—"}
              </p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginTop: 22,
                }}
              >
                <button
                  type="button"
                  data-game-action="play-again"
                  onClick={playAgain}
                  disabled={!wallet.connected || availablePlays < 1}
                  style={{
                    width: "100%",
                    minHeight: 56,
                    borderRadius: 14,
                    border: "none",
                    cursor:
                      wallet.connected && availablePlays > 0
                        ? "pointer"
                        : "not-allowed",
                    color: "#fff",
                    fontFamily: "Orbitron, sans-serif",
                    fontWeight: 800,
                    fontSize: 14,
                    letterSpacing: "0.2em",
                    background:
                      wallet.connected && availablePlays > 0
                        ? `radial-gradient(circle at 40% 20%, #FF9AAB, ${RED} 45%, #8C0A1E)`
                        : "rgba(70,74,88,0.5)",
                    boxShadow:
                      wallet.connected && availablePlays > 0
                        ? "0 0 36px rgba(255,37,68,0.55)"
                        : "none",
                  }}
                >
                  PLAY AGAIN
                </button>
                <button
                  type="button"
                  data-game-action="return-lobby"
                  onClick={() => router.push("/play")}
                  style={{
                    width: "100%",
                    minHeight: 48,
                    borderRadius: 12,
                    border: "1px solid rgba(34,211,255,0.45)",
                    cursor: "pointer",
                    color: CYAN,
                    fontFamily: "Orbitron, sans-serif",
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: "0.16em",
                    background: "rgba(6,10,16,0.95)",
                  }}
                >
                  RETURN TO DASHBOARD
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function HudChip({
  label,
  value,
  color,
  attr,
}: {
  label: string;
  value: string;
  color: string;
  attr: string;
}) {
  return (
    <div style={{ textAlign: "center", minWidth: 72 }}>
      <p style={{ ...labelStyle, marginBottom: 4 }}>{label}</p>
      <p
        data-stat={attr}
        style={{
          ...valueStyle,
          margin: 0,
          fontSize: 13,
          color,
        }}
      >
        {value}
      </p>
    </div>
  );
}
