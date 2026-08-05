"use client";

/**
 * FiatClaw arcade machine — React Three Fiber WebGL cabinet + HTML control deck.
 * Phases driven by parent (server outcome). No odds / % UI.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
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
        background: "#0a0b10",
        color: "#FF3E5C",
        fontFamily: "Orbitron, sans-serif",
        fontSize: 11,
        letterSpacing: "0.28em",
      }}
    >
      LOADING 3D…
    </div>
  ),
});

const RED = "#FF3E5C";
const CYAN = "#22D3FF";
const BG = "#0a0b10";

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
  const busy = isClawBusyPhase(phase);
  const status = clawStatusLabel(phase);
  const overlay = clawOverlayText(phase);
  const joyOn = Boolean(canMove && !busy && !disabled);

  const statusColor =
    phase === "win"
      ? "#14F195"
      : phase === "lose" || phase === "slip"
        ? "#FF6B7A"
        : busy
          ? CYAN
          : "#EDEEF2";

  const move = useCallback(
    (dir: "left" | "right") => {
      if (!joyOn) return;
      if (onMove) {
        onMove(dir);
        return;
      }
      const step = 6.5;
      setInternalX((x) =>
        dir === "left" ? Math.max(12, x - step) : Math.min(88, x + step)
      );
    },
    [joyOn, onMove]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        move("left");
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        move("right");
      } else if ((e.key === " " || e.key === "Enter") && joyOn) {
        e.preventDefault();
        onDrop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, joyOn, move, onDrop]);

  return (
    <div
      data-claw-machine="r3f-webgl"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 500,
        margin: "0 auto",
        aspectRatio: "10 / 13.8",
        borderRadius: 24,
        overflow: "hidden",
        border: "1px solid rgba(255,62,92,0.35)",
        boxShadow: `
          0 0 0 1px rgba(255,255,255,0.04) inset,
          0 0 80px rgba(255,37,68,0.18),
          0 0 40px rgba(34,211,255,0.1),
          0 32px 64px rgba(0,0,0,0.7)
        `,
        background: BG,
      }}
    >
      {/* WebGL scene */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 148,
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
                "radial-gradient(circle at 50% 42%, rgba(255,37,68,0.25), transparent 60%)",
            }}
          >
            <div
              style={{
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: "0.22em",
                color: "#fff",
                textShadow: `0 0 28px ${RED}, 0 0 56px ${RED}, 0 0 12px ${CYAN}`,
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
              background: "rgba(0,0,0,0.28)",
            }}
          >
            <div
              style={{
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 600,
                fontSize: 18,
                letterSpacing: "0.24em",
                color: "#9BA1AE",
              }}
            >
              MISS
            </div>
          </div>
        )}
      </div>

      {/* Large joystick + PULL control deck (machine face ref) */}
      <div
        data-claw-controls="deck"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 148,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px 16px",
          gap: 12,
          background: `
            linear-gradient(180deg,
              #2a303c 0%,
              #181c26 28%,
              #0e1016 72%,
              ${BG} 100%)
          `,
          borderTop: "1px solid rgba(255,62,92,0.4)",
          boxShadow:
            "0 -18px 44px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12)",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 6,
            left: 18,
            right: 18,
            height: 2,
            borderRadius: 1,
            background: `linear-gradient(90deg, transparent, ${RED}, ${CYAN}, transparent)`,
            opacity: 0.8,
          }}
        />

        <div
          data-claw-status={status}
          style={{
            minWidth: 92,
            padding: "12px 12px",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.1)",
            background:
              "linear-gradient(160deg, rgba(255,255,255,0.07), rgba(10,12,16,0.95))",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 18px rgba(255,37,68,0.08)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9,
              letterSpacing: "0.2em",
              color: "#5c6478",
              marginBottom: 6,
            }}
          >
            STATUS
          </div>
          <div
            style={{
              fontFamily: "Orbitron, sans-serif",
              fontSize: 12,
              letterSpacing: "0.12em",
              color: statusColor,
              textShadow:
                busy || phase === "win" ? `0 0 12px ${statusColor}` : undefined,
            }}
          >
            {status}
          </div>
        </div>

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
              fontSize: 9,
              letterSpacing: "0.2em",
              color: "#5c6478",
            }}
          >
            JOYSTICK
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              type="button"
              aria-label="Left"
              data-claw-dir="left"
              disabled={!joyOn}
              onClick={() => move("left")}
              style={joyBtn(joyOn)}
            >
              ←
            </button>
            <div
              data-claw-stick="ball"
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: joyOn
                  ? `radial-gradient(circle at 32% 28%, #ff7a8c, ${RED} 55%, #8a0a1c 100%)`
                  : "radial-gradient(circle at 32% 28%, #5a6578, #12151c 65%, #040508)",
                border: `3px solid rgba(255,62,92,${joyOn ? 0.7 : 0.25})`,
                boxShadow: joyOn
                  ? "0 0 28px rgba(255,37,68,0.65), 0 6px 0 #4a0610, inset 0 2px 0 rgba(255,255,255,0.35)"
                  : "inset 0 3px 10px rgba(0,0,0,0.65), 0 4px 0 #06080c",
              }}
            />
            <button
              type="button"
              aria-label="Right"
              data-claw-dir="right"
              disabled={!joyOn}
              onClick={() => move("right")}
              style={joyBtn(joyOn)}
            >
              →
            </button>
          </div>
        </div>

        <button
          type="button"
          data-claw-action="pull"
          onClick={() => {
            if (disabled || busy) return;
            onDrop();
          }}
          disabled={disabled || busy}
          style={{
            minWidth: 132,
            minHeight: 72,
            padding: "18px 26px",
            borderRadius: 999,
            border: "2px solid rgba(255,140,155,0.55)",
            cursor: disabled || busy ? "not-allowed" : "pointer",
            color: "#fff",
            fontFamily: "Orbitron, sans-serif",
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: "0.28em",
            alignSelf: "center",
            background:
              disabled || busy
                ? "linear-gradient(180deg, #3a3e4a, #1a1c24)"
                : `radial-gradient(circle at 40% 30%, #FF8A9A 0%, ${RED} 42%, #C4102A 78%, #6a0814 100%)`,
            boxShadow:
              disabled || busy
                ? "none"
                : "0 0 48px rgba(255,37,68,0.75), 0 8px 0 #4a0610, inset 0 3px 0 rgba(255,255,255,0.4)",
            opacity: disabled ? 0.45 : 1,
            transform: busy ? "translateY(4px)" : undefined,
          }}
        >
          {busy ? "···" : "PULL"}
        </button>
      </div>
    </div>
  );
}

function joyBtn(active: boolean): CSSProperties {
  return {
    width: 54,
    height: 54,
    borderRadius: 16,
    border: "1px solid rgba(34,211,255,0.5)",
    background: active
      ? "linear-gradient(180deg, #2a4860, #0e1822 60%, #060a10)"
      : "linear-gradient(180deg, #2a2e38, #14161c)",
    color: CYAN,
    fontFamily: "Orbitron, sans-serif",
    fontSize: 20,
    fontWeight: 700,
    cursor: active ? "pointer" : "not-allowed",
    opacity: active ? 1 : 0.35,
    display: "grid",
    placeItems: "center",
    boxShadow: active
      ? "0 0 20px rgba(34,211,255,0.35), 0 5px 0 #060a10"
      : "inset 0 2px 4px rgba(0,0,0,0.4)",
  };
}
