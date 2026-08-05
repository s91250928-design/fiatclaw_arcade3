"use client";

/**
 * Premium control console + R3F industrial cabinet.
 * OLED status · metal joystick with LED ring · illuminated START/PULL.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  canClickPull,
  canMoveClaw,
  clawOverlayText,
  clawStatusLabel,
  isClawBusyPhase,
  pullClickStep,
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
        background: "#030406",
        color: "#FF3E5C",
        fontFamily: "Orbitron, sans-serif",
        fontSize: 10,
        letterSpacing: "0.32em",
      }}
    >
      INITIALIZING SYSTEMS…
    </div>
  ),
});

const RED = "#FF3E5C";
const CYAN = "#22D3FF";
const BG = "#080a0e";

interface Props {
  phase: ClawPhase;
  onDrop: () => void;
  disabled?: boolean;
  clawX?: number;
  onMove?: (dir: "left" | "right") => void;
  canMove?: boolean;
}

export function ClawMachine({
  phase,
  onDrop,
  disabled,
  clawX: controlledX,
  onMove,
  canMove = false,
}: Props) {
  const [internalX, setInternalX] = useState(50);
  const clawX = controlledX ?? internalX;
  const animating = isClawBusyPhase(phase) && !canClickPull(phase);
  const status = clawStatusLabel(phase);
  const overlay = clawOverlayText(phase);
  const joyOn = Boolean(canMove && canMoveClaw(phase) && !disabled);
  const pullOn = Boolean(!disabled && canClickPull(phase));
  const step = pullClickStep(phase);

  const statusColor =
    phase === "win"
      ? "#14F195"
      : phase === "lose" || phase === "slip"
        ? "#FF6B7A"
        : animating || step > 0
          ? CYAN
          : "#E8EAF0";

  const move = useCallback(
    (dir: "left" | "right") => {
      if (!joyOn) return;
      if (onMove) {
        onMove(dir);
        return;
      }
      const s = 6.5;
      setInternalX((x) =>
        dir === "left" ? Math.max(12, x - s) : Math.min(88, x + s)
      );
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

  const pullLabel =
    step === 1 ? "GRAB" : step === 2 ? "LIFT" : animating ? "···" : "PULL";

  return (
    <div
      data-claw-machine="r3f-webgl"
      data-claw-style="premium-industrial-2035"
      data-claw-pull-step={String(step)}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 520,
        margin: "0 auto",
        aspectRatio: "10 / 14.2",
        borderRadius: 20,
        overflow: "hidden",
        border: "1px solid rgba(255,62,92,0.28)",
        boxShadow: `
          0 0 0 1px rgba(255,255,255,0.03) inset,
          0 0 100px rgba(255,37,68,0.12),
          0 0 60px rgba(34,211,255,0.08),
          0 40px 80px rgba(0,0,0,0.85)
        `,
        background: BG,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 158,
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
                "radial-gradient(circle at 50% 40%, rgba(255,37,68,0.3), transparent 55%)",
            }}
          >
            <div
              style={{
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 700,
                fontSize: 28,
                letterSpacing: "0.28em",
                color: "#fff",
                textShadow: `0 0 30px ${RED}, 0 0 60px ${RED}`,
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
              background: "rgba(0,0,0,0.35)",
            }}
          >
            <div
              style={{
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 600,
                fontSize: 16,
                letterSpacing: "0.28em",
                color: "#6a7080",
              }}
            >
              MISS
            </div>
          </div>
        )}
      </div>

      {/* Professional control console */}
      <div
        data-claw-controls="deck"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 158,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 18px 18px",
          gap: 14,
          background: `
            linear-gradient(180deg,
              #1a1e28 0%,
              #0e1118 35%,
              #080a0e 100%)
          `,
          borderTop: "1px solid rgba(255,62,92,0.35)",
          boxShadow:
            "0 -20px 50px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* Carbon texture line */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: `linear-gradient(90deg, transparent, ${RED}88, ${CYAN}66, transparent)`,
          }}
        />

        {/* OLED status display */}
        <div
          data-claw-status={status}
          style={{
            minWidth: 108,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(34,211,255,0.2)",
            background:
              "linear-gradient(165deg, rgba(8,20,28,0.95), rgba(4,6,10,0.98))",
            boxShadow:
              "inset 0 0 24px rgba(34,211,255,0.06), 0 0 12px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 8,
              letterSpacing: "0.24em",
              color: "#3a4558",
            }}
          >
            OLED · SYS
          </div>
          <div
            style={{
              fontFamily: "Orbitron, sans-serif",
              fontSize: 13,
              letterSpacing: "0.14em",
              color: statusColor,
              textShadow:
                animating || phase === "win"
                  ? `0 0 14px ${statusColor}`
                  : `0 0 8px ${statusColor}44`,
            }}
          >
            {status}
          </div>
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 8,
              letterSpacing: "0.1em",
              color: "#2a3548",
            }}
          >
            {step > 0 ? `STEP ${step}/3` : "READY"}
          </div>
        </div>

        {/* Metal joystick + LED ring */}
        <div
          data-claw-controls="joystick"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            flex: 1,
          }}
        >
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 8,
              letterSpacing: "0.22em",
              color: "#3a4558",
            }}
          >
            JOYSTICK
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <button
              type="button"
              aria-label="Left"
              data-claw-dir="left"
              disabled={!joyOn}
              onClick={() => move("left")}
              style={metalBtn(joyOn)}
            >
              ←
            </button>
            {/* Stick with LED ring */}
            <div style={{ position: "relative", width: 64, height: 64 }}>
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: -4,
                  borderRadius: "50%",
                  border: `2px solid ${joyOn ? CYAN : "rgba(34,211,255,0.15)"}`,
                  boxShadow: joyOn
                    ? `0 0 18px ${CYAN}88, inset 0 0 12px ${CYAN}33`
                    : "none",
                  animation: joyOn ? "none" : undefined,
                }}
              />
              <div
                data-claw-stick="ball"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: joyOn
                    ? `radial-gradient(circle at 30% 28%, #ff8a9a, ${RED} 50%, #5a0814 100%)`
                    : "radial-gradient(circle at 30% 28%, #4a5568, #12151c 60%, #040508)",
                  border: `3px solid ${joyOn ? "rgba(255,62,92,0.7)" : "rgba(80,90,110,0.4)"}`,
                  boxShadow: joyOn
                    ? "0 0 28px rgba(255,37,68,0.55), 0 6px 0 #3a0610, inset 0 2px 0 rgba(255,255,255,0.3)"
                    : "inset 0 4px 12px rgba(0,0,0,0.7), 0 4px 0 #06080c",
                }}
              />
            </div>
            <button
              type="button"
              aria-label="Right"
              data-claw-dir="right"
              disabled={!joyOn}
              onClick={() => move("right")}
              style={metalBtn(joyOn)}
            >
              →
            </button>
          </div>
        </div>

        {/* Illuminated industrial START / PULL */}
        <button
          type="button"
          data-claw-action="pull"
          data-pull-step={String(step)}
          onClick={() => {
            if (!pullOn) return;
            onDrop();
          }}
          disabled={!pullOn}
          style={{
            minWidth: 128,
            minHeight: 76,
            padding: "16px 22px",
            borderRadius: 999,
            border: "2px solid rgba(255,120,140,0.45)",
            cursor: pullOn ? "pointer" : "not-allowed",
            color: "#fff",
            fontFamily: "Orbitron, sans-serif",
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: "0.2em",
            alignSelf: "center",
            background: !pullOn
              ? "linear-gradient(180deg, #2a2e38, #12141a)"
              : `radial-gradient(circle at 38% 28%, #FF8A9A 0%, ${RED} 40%, #A01028 75%, #4a0610 100%)`,
            boxShadow: !pullOn
              ? "inset 0 2px 8px rgba(0,0,0,0.5)"
              : "0 0 50px rgba(255,37,68,0.7), 0 8px 0 #3a0610, inset 0 3px 0 rgba(255,255,255,0.35)",
            opacity: disabled ? 0.4 : 1,
            transform: animating ? "translateY(4px)" : undefined,
            transition: "transform 0.12s, box-shadow 0.2s",
          }}
        >
          {pullLabel}
        </button>
      </div>
    </div>
  );
}

function metalBtn(active: boolean): CSSProperties {
  return {
    width: 52,
    height: 52,
    borderRadius: 14,
    border: "1px solid rgba(34,211,255,0.35)",
    background: active
      ? "linear-gradient(180deg, #2a4058, #0c141c 55%, #060a10)"
      : "linear-gradient(180deg, #2a2e38, #12141a)",
    color: CYAN,
    fontFamily: "Orbitron, sans-serif",
    fontSize: 18,
    fontWeight: 700,
    cursor: active ? "pointer" : "not-allowed",
    opacity: active ? 1 : 0.3,
    display: "grid",
    placeItems: "center",
    boxShadow: active
      ? "0 0 16px rgba(34,211,255,0.3), 0 4px 0 #060a10"
      : "inset 0 2px 6px rgba(0,0,0,0.5)",
  };
}
