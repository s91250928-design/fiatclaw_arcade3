"use client";

/**
 * Hero 3D vault viewport — dashboard wraps controls around this.
 * Machine fills the frame; status strip at bottom (etalon-style).
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  canClickPull,
  canMoveClaw,
  clawOverlayText,
  clawStatusLabel,
  isClawBusyPhase,
  type ClawPhase,
} from "@/lib/game/claw-phases";

export type { ClawPhase };

const ClawCanvas = dynamic(() => import("./claw/ClawCanvas"), {
  ssr: false,
  loading: () => (
    <div
      data-claw-loading
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle at 50% 40%, #1a0a14 0%, #050608 70%)",
        color: "#FF3E5C",
        fontFamily: "Orbitron, sans-serif",
        fontSize: 11,
        letterSpacing: "0.36em",
      }}
    >
      VAULT SYSTEMS ONLINE…
    </div>
  ),
});

const RED = "#FF3E5C";
const CYAN = "#22D3FF";

interface Props {
  phase: ClawPhase;
  onDrop: () => void;
  disabled?: boolean;
  clawX?: number;
  onMove?: (dir: "left" | "right" | "up" | "down") => void;
  canMove?: boolean;
  /** Plays remaining label for machine strip */
  playsLeft?: number;
  jackpotLabel?: string;
  /** When true, omit bottom control deck (dashboard hosts controls) */
  externalControls?: boolean;
}

export function ClawMachine({
  phase,
  onDrop,
  disabled,
  clawX: controlledX,
  onMove,
  canMove = false,
  playsLeft = 0,
  jackpotLabel = "—",
  externalControls = true,
}: Props) {
  const [internalX, setInternalX] = useState(50);
  const clawX = controlledX ?? internalX;
  const animating = isClawBusyPhase(phase) && !canClickPull(phase);
  const status = clawStatusLabel(phase);
  const overlay = clawOverlayText(phase);
  const joyOn = Boolean(canMove && canMoveClaw(phase) && !disabled);
  const pullOn = Boolean(!disabled && canClickPull(phase));

  const move = useCallback(
    (dir: "left" | "right" | "up" | "down") => {
      if (!joyOn) return;
      if (onMove) {
        onMove(dir);
        return;
      }
      if (dir === "left") setInternalX((x) => Math.max(12, x - 6.5));
      if (dir === "right") setInternalX((x) => Math.min(88, x + 6.5));
    },
    [joyOn, onMove]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        move("left");
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        move("right");
      } else if ((e.key === " " || e.key === "Enter") && pullOn) {
        e.preventDefault();
        onDrop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pullOn, move, onDrop]);

  return (
    <div
      data-claw-machine="r3f-webgl"
      data-claw-style="crypto-vault-aaa"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 520,
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(255,62,92,0.25)",
        boxShadow: `
          0 0 0 1px rgba(255,255,255,0.04) inset,
          0 0 80px rgba(255,37,68,0.12),
          0 0 120px rgba(34,211,255,0.08),
          0 40px 100px rgba(0,0,0,0.85)
        `,
        background: "#040508",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: externalControls ? "0 0 72px 0" : "0 0 148px 0",
        }}
      >
        <ClawCanvas phase={phase} clawX={clawX} />
        {overlay === "SECURED" && (
          <div
            data-claw-overlay="secured"
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
              zIndex: 5,
              background:
                "radial-gradient(circle at 50% 45%, rgba(255,37,68,0.35), transparent 55%)",
            }}
          >
            <div
              style={{
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 800,
                fontSize: 34,
                letterSpacing: "0.28em",
                color: "#fff",
                textShadow: `0 0 40px ${RED}, 0 0 80px ${RED}`,
              }}
            >
              SECURED
            </div>
          </div>
        )}
        {overlay === "MISS" && phase === "lose" && (
          <div
            data-claw-overlay="miss"
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
              zIndex: 5,
              background: "rgba(0,0,0,0.4)",
            }}
          >
            <div
              style={{
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 600,
                fontSize: 16,
                letterSpacing: "0.2em",
                color: "#8a92a0",
                textAlign: "center",
                maxWidth: 280,
                lineHeight: 1.5,
              }}
            >
              Better Luck Next Pull.
            </div>
          </div>
        )}
      </div>

      {/* Machine status strip (etalon center-bottom) */}
      <div
        data-claw-status-strip
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 72,
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr 1.2fr",
          alignItems: "center",
          gap: 8,
          padding: "0 18px",
          background:
            "linear-gradient(180deg, rgba(12,14,20,0.92), rgba(6,8,12,0.98))",
          borderTop: "1px solid rgba(255,62,92,0.28)",
          zIndex: 6,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9,
              letterSpacing: "0.18em",
              color: "#4a5568",
            }}
          >
            MACHINE
          </div>
          <div
            style={{
              fontFamily: "Orbitron, sans-serif",
              fontSize: 12,
              letterSpacing: "0.08em",
              color: "#E8EAF0",
              marginTop: 4,
            }}
          >
            FIATCLAW VAULT 01
          </div>
          <div
            data-claw-status={status}
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              color: animating ? CYAN : RED,
              marginTop: 2,
            }}
          >
            {status}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9,
              letterSpacing: "0.18em",
              color: "#4a5568",
            }}
          >
            PLAYS LEFT
          </div>
          <div
            style={{
              fontFamily: "Orbitron, sans-serif",
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
              marginTop: 2,
            }}
            data-balance="plays-strip"
          >
            {playsLeft}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9,
              letterSpacing: "0.18em",
              color: "#4a5568",
            }}
          >
            PRIZE POOL
          </div>
          <div
            style={{
              fontFamily: "Orbitron, sans-serif",
              fontSize: 13,
              color: "#14F195",
              marginTop: 4,
              textShadow: "0 0 12px rgba(20,241,149,0.35)",
            }}
          >
            {jackpotLabel}
          </div>
        </div>
      </div>

      {/* Hidden hooks for keyboard when external controls host UI */}
      {!externalControls && (
        <button
          type="button"
          data-claw-action="pull"
          style={{ display: "none" }}
          onClick={onDrop}
        />
      )}
    </div>
  );
}
