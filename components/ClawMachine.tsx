"use client";

/**
 * Massive premium Web3 claw machine shell + industrial control console.
 * OLED · metal LED-ring joystick · illuminated PULL · emergency stop.
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
        background: "#020304",
        color: "#FF3E5C",
        fontFamily: "Orbitron, sans-serif",
        fontSize: 11,
        letterSpacing: "0.36em",
      }}
    >
      SYSTEMS ONLINE…
    </div>
  ),
});

const RED = "#FF3E5C";
const CYAN = "#22D3FF";
const BG = "#06080c";

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
      data-claw-style="premium-industrial-cyberpunk-2035"
      data-claw-pull-step={String(step)}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 640,
        margin: "0 auto",
        aspectRatio: "10 / 15",
        borderRadius: 18,
        overflow: "hidden",
        border: "1px solid rgba(255,62,92,0.32)",
        boxShadow: `
          0 0 0 1px rgba(255,255,255,0.04) inset,
          0 0 120px rgba(255,37,68,0.14),
          0 0 80px rgba(34,211,255,0.1),
          0 48px 100px rgba(0,0,0,0.9)
        `,
        background: BG,
      }}
    >
      {/* Massive 3D chamber — nearly full card */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 168,
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
                "radial-gradient(circle at 50% 40%, rgba(255,37,68,0.32), transparent 55%)",
            }}
          >
            <div
              style={{
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 800,
                fontSize: 32,
                letterSpacing: "0.3em",
                color: "#fff",
                textShadow: `0 0 32px ${RED}, 0 0 64px ${RED}`,
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
                fontSize: 18,
                letterSpacing: "0.3em",
                color: "#5a6270",
              }}
            >
              MISS
            </div>
          </div>
        )}
      </div>

      {/* Premium industrial console */}
      <div
        data-claw-controls="deck"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 168,
          zIndex: 10,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr auto",
          alignItems: "center",
          gap: 12,
          padding: "16px 18px 18px",
          background: `
            linear-gradient(180deg,
              #1c222e 0%,
              #0e121a 40%,
              #06080c 100%)
          `,
          borderTop: "1px solid rgba(255,62,92,0.4)",
          boxShadow:
            "0 -24px 60px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: `linear-gradient(90deg, transparent, ${RED}99, ${CYAN}77, transparent)`,
          }}
        />

        {/* OLED */}
        <div
          data-claw-status={status}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(34,211,255,0.22)",
            background:
              "linear-gradient(165deg, rgba(6,18,26,0.98), rgba(2,4,8,0.99))",
            boxShadow: "inset 0 0 28px rgba(34,211,255,0.07)",
            minWidth: 120,
          }}
        >
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 8,
              letterSpacing: "0.26em",
              color: "#2a3848",
              marginBottom: 4,
            }}
          >
            OLED · CORE
          </div>
          <div
            style={{
              fontFamily: "Orbitron, sans-serif",
              fontSize: 14,
              letterSpacing: "0.14em",
              color: statusColor,
              textShadow: `0 0 12px ${statusColor}88`,
            }}
          >
            {status}
          </div>
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9,
              letterSpacing: "0.12em",
              color: "#243040",
              marginTop: 4,
            }}
          >
            {step > 0 ? `SEQ ${step}/3` : "ARMED"}
          </div>
        </div>

        {/* Joystick + LED ring */}
        <div
          data-claw-controls="joystick"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 8,
              letterSpacing: "0.24em",
              color: "#2a3848",
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
              style={metalBtn(joyOn)}
            >
              ←
            </button>
            <div style={{ position: "relative", width: 68, height: 68 }}>
              <div
                style={{
                  position: "absolute",
                  inset: -5,
                  borderRadius: "50%",
                  border: `2px solid ${joyOn ? CYAN : "rgba(34,211,255,0.12)"}`,
                  boxShadow: joyOn
                    ? `0 0 22px ${CYAN}99, inset 0 0 14px ${CYAN}44`
                    : "none",
                }}
              />
              <div
                data-claw-stick="ball"
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: "50%",
                  background: joyOn
                    ? `radial-gradient(circle at 30% 26%, #ff8a9a, ${RED} 48%, #4a0810 100%)`
                    : "radial-gradient(circle at 30% 26%, #4a5568, #10141c 60%, #040508)",
                  border: `3px solid ${joyOn ? "rgba(255,62,92,0.75)" : "rgba(70,80,100,0.35)"}`,
                  boxShadow: joyOn
                    ? "0 0 32px rgba(255,37,68,0.6), 0 7px 0 #2a040c, inset 0 2px 0 rgba(255,255,255,0.32)"
                    : "inset 0 4px 14px rgba(0,0,0,0.75), 0 4px 0 #040608",
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

        {/* Emergency stop (visual / no-op abort) */}
        <button
          type="button"
          data-claw-action="e-stop"
          title="Emergency stop"
          onClick={() => {
            /* visual only — does not burn plays */
          }}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "2px solid rgba(255,80,80,0.55)",
            background:
              "radial-gradient(circle at 35% 30%, #ff6a6a, #8a1010 70%, #3a0606)",
            boxShadow: "0 0 16px rgba(255,40,40,0.35), inset 0 2px 0 rgba(255,255,255,0.2)",
            cursor: "pointer",
            fontFamily: "Orbitron, sans-serif",
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "#fff",
            justifySelf: "end",
          }}
        >
          E
        </button>

        {/* Illuminated PULL */}
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
            minWidth: 140,
            minHeight: 80,
            padding: "18px 24px",
            borderRadius: 999,
            border: "2px solid rgba(255,130,150,0.5)",
            cursor: pullOn ? "pointer" : "not-allowed",
            color: "#fff",
            fontFamily: "Orbitron, sans-serif",
            fontWeight: 800,
            fontSize: 16,
            letterSpacing: "0.22em",
            background: !pullOn
              ? "linear-gradient(180deg, #2a2e38, #10141a)"
              : `radial-gradient(circle at 38% 26%, #FF8A9A 0%, ${RED} 38%, #A01028 72%, #3a0610 100%)`,
            boxShadow: !pullOn
              ? "inset 0 2px 10px rgba(0,0,0,0.55)"
              : "0 0 56px rgba(255,37,68,0.75), 0 9px 0 #2a040c, inset 0 3px 0 rgba(255,255,255,0.38)",
            opacity: disabled ? 0.4 : 1,
            transform: animating ? "translateY(5px)" : undefined,
            transition: "transform 0.12s, box-shadow 0.2s",
            justifySelf: "end",
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
    width: 54,
    height: 54,
    borderRadius: 14,
    border: "1px solid rgba(34,211,255,0.4)",
    background: active
      ? "linear-gradient(180deg, #2a4058, #0c141c 55%, #060a10)"
      : "linear-gradient(180deg, #2a2e38, #12141a)",
    color: CYAN,
    fontFamily: "Orbitron, sans-serif",
    fontSize: 18,
    fontWeight: 700,
    cursor: active ? "pointer" : "not-allowed",
    opacity: active ? 1 : 0.28,
    display: "grid",
    placeItems: "center",
    boxShadow: active
      ? "0 0 18px rgba(34,211,255,0.35), 0 4px 0 #060a10"
      : "inset 0 2px 6px rgba(0,0,0,0.5)",
  };
}
