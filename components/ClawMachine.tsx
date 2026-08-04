"use client";

import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";

export type ClawPhase =
  | "idle"
  | "ready"
  | "drop"
  | "close"
  | "lift"
  | "hold"
  | "slip"
  | "return"
  | "win"
  | "lose";

interface Props {
  phase: ClawPhase;
  /** Parent fires server resolve + animation drive */
  onDrop: () => void;
  disabled?: boolean;
  clawX?: number;
  onMove?: (dir: "left" | "right") => void;
  canMove?: boolean;
}

/**
 * Premium FiatClaw cyber-neon claw cabinet.
 * Depth via layered glass, metal bevels, neon rims, parallax prizes, living FX.
 * Controls: ← → joystick + PULL. Phases are parent/server driven.
 */
export function ClawMachine({
  phase,
  onDrop,
  disabled,
  clawX: controlledX,
  onMove,
  canMove = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [internalX, setInternalX] = useState(50);
  const [idleT, setIdleT] = useState(0);
  const clawX = controlledX ?? internalX;
  const isBusy = ["drop", "close", "lift", "hold", "slip", "return"].includes(phase);
  const animating = isBusy || phase === "win" || phase === "lose";

  // Idle neon pulse clock
  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      setIdleT(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Particle field + glass fog
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const sparks = Array.from({ length: 64 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.35 + Math.random() * 1.8,
      v: 0.00008 + Math.random() * 0.00035,
      o: 0.08 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      hue: Math.random() > 0.5 ? 0 : 190,
    }));

    const resize = () => {
      const box = c.parentElement?.getBoundingClientRect();
      if (!box) return;
      w = box.width;
      h = box.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      // soft volumetric fog
      const g = ctx.createRadialGradient(w * 0.5, h * 0.2, 0, w * 0.5, h * 0.45, h * 0.7);
      g.addColorStop(0, "rgba(255,37,68,0.07)");
      g.addColorStop(0.45, "rgba(34,211,255,0.04)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (const p of sparks) {
        p.y -= p.v;
        p.x += Math.sin(t * 0.00045 + p.phase) * 0.00018;
        if (p.y < -0.02) {
          p.y = 1.02;
          p.x = Math.random();
        }
        const pulse = 0.55 + 0.45 * Math.sin(t * 0.003 + p.phase);
        const a = p.o * pulse;
        ctx.beginPath();
        ctx.fillStyle =
          p.hue === 0 ? `rgba(255,55,90,${a})` : `rgba(34,211,255,${a * 0.9})`;
        ctx.shadowColor = p.hue === 0 ? "rgba(255,37,68,0.8)" : "rgba(34,211,255,0.7)";
        ctx.shadowBlur = 8;
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const move = useCallback(
    (dir: "left" | "right") => {
      if (!canMove || isBusy || disabled) return;
      if (onMove) {
        onMove(dir);
        return;
      }
      const step = 7;
      if (dir === "left") setInternalX((x) => Math.max(14, x - step));
      if (dir === "right") setInternalX((x) => Math.min(86, x + step));
    },
    [canMove, isBusy, disabled, onMove]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isBusy) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        move("left");
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        move("right");
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!disabled && !isBusy && canMove) onDrop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isBusy, disabled, canMove, move, onDrop]);

  // Claw vertical position by phase (smooth CSS transitions)
  const clawTop =
    phase === "idle" || phase === "ready"
      ? "10%"
      : phase === "drop" || phase === "close"
        ? "58%"
        : phase === "lift" || phase === "hold" || phase === "win"
          ? "12%"
          : phase === "slip"
            ? "30%"
            : phase === "return" || phase === "lose"
              ? "11%"
              : "10%";

  const clawOpen =
    phase === "drop" ||
    phase === "idle" ||
    phase === "ready" ||
    phase === "slip" ||
    phase === "return" ||
    phase === "lose";

  const showHeld =
    phase === "close" || phase === "lift" || phase === "hold" || phase === "win";
  const showSlip = phase === "slip" || (phase === "lose" && !showHeld);

  // Subtle idle sway on ready/idle
  const sway =
    phase === "idle" || phase === "ready"
      ? Math.sin(idleT * 0.0012) * 1.2
      : 0;

  const pulse = 0.55 + 0.45 * Math.sin(idleT * 0.0025);

  const statusLabel = (() => {
    switch (phase) {
      case "idle":
        return "STANDBY";
      case "ready":
        return "ARMED";
      case "drop":
        return "DESCENDING";
      case "close":
        return "GRIP";
      case "lift":
        return "ASCENDING";
      case "hold":
        return "SECURE";
      case "slip":
        return "SLIP";
      case "return":
        return "RETRACT";
      case "win":
        return "PRIZE LOCKED";
      case "lose":
        return "NO CATCH";
      default:
        return "—";
    }
  })();

  const statusColor =
    phase === "win"
      ? "#14F195"
      : phase === "lose"
        ? "#FF6B7A"
        : isBusy
          ? "#22D3FF"
          : "#EDEEF2";

  const joyActive = canMove && !isBusy && !disabled;

  const shell: CSSProperties = {
    position: "relative",
    width: "100%",
    maxWidth: 460,
    margin: "0 auto",
    aspectRatio: "3 / 4.15",
    borderRadius: 28,
    // perspective stage
    perspective: 1200,
    transformStyle: "preserve-3d",
  };

  return (
    <div style={shell} data-claw-machine="premium">
      {/* Outer chassis */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 28,
          background: `
            linear-gradient(165deg, #1a1d28 0%, #0c0e14 38%, #08090d 72%, #050608 100%)
          `,
          border: "1px solid rgba(255,55,90,0.35)",
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.04) inset,
            0 0 0 3px rgba(0,0,0,0.45) inset,
            0 0 80px rgba(255,37,68,0.18),
            0 0 40px rgba(34,211,255,0.08),
            0 32px 64px rgba(0,0,0,0.7),
            0 2px 0 rgba(255,255,255,0.06) inset
          `,
          overflow: "hidden",
          transform: "rotateX(2deg)",
          transformOrigin: "center bottom",
        }}
      >
        {/* Brushed metal side rails */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 14,
            background:
              "linear-gradient(90deg, #0a0b10, #2a303c 40%, #12151c 70%, #08090d)",
            boxShadow: "2px 0 12px rgba(0,0,0,0.5), inset -1px 0 0 rgba(34,211,255,0.15)",
            zIndex: 20,
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 14,
            background:
              "linear-gradient(270deg, #0a0b10, #2a303c 40%, #12151c 70%, #08090d)",
            boxShadow: "-2px 0 12px rgba(0,0,0,0.5), inset 1px 0 0 rgba(255,55,90,0.18)",
            zIndex: 20,
          }}
        />

        {/* Neon rim glow top */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 14,
            right: 14,
            height: 2,
            background: `linear-gradient(90deg, transparent, rgba(255,37,68,${0.4 + pulse * 0.4}), rgba(34,211,255,${0.35 + pulse * 0.3}), transparent)`,
            boxShadow: `0 0 ${12 + pulse * 10}px rgba(255,37,68,0.55)`,
            zIndex: 21,
          }}
        />

        {/* Header marquee */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 14,
            right: 14,
            height: 52,
            zIndex: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(180deg, rgba(22,24,32,0.98), rgba(12,14,20,0.88))",
            borderBottom: "1px solid rgba(255,55,90,0.28)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(255,37,68,0.03) 18px, rgba(255,37,68,0.03) 19px)",
              opacity: 0.7,
              pointerEvents: "none",
            }}
          />
          <span
            style={{
              fontFamily: "Orbitron, Inter, sans-serif",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.32em",
              color: "#FF3E5C",
              textShadow: `0 0 ${14 + pulse * 10}px rgba(255,37,68,0.85), 0 0 28px rgba(255,37,68,0.4)`,
              position: "relative",
            }}
          >
            FIATCLAW ARCADE
          </span>
          {/* LED dots */}
          <div
            style={{
              position: "absolute",
              right: 16,
              display: "flex",
              gap: 5,
            }}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: i === 0 && isBusy ? "#22D3FF" : i === 1 && phase === "win" ? "#14F195" : "#FF3E5C",
                  boxShadow: `0 0 8px currentColor`,
                  opacity: 0.5 + 0.5 * Math.sin(idleT * 0.004 + i),
                }}
              />
            ))}
          </div>
        </div>

        {/* Glass playfield */}
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 22,
            right: 22,
            bottom: 128,
            borderRadius: 18,
            overflow: "hidden",
            zIndex: 2,
            // glass body
            background: `
              linear-gradient(180deg,
                rgba(28,40,56,0.45) 0%,
                rgba(12,16,24,0.55) 40%,
                rgba(8,10,16,0.72) 100%)
            `,
            border: "1px solid rgba(34,211,255,0.22)",
            boxShadow: `
              inset 0 0 60px rgba(34,211,255,0.06),
              inset 0 1px 0 rgba(255,255,255,0.12),
              inset 0 -20px 40px rgba(0,0,0,0.45),
              0 0 30px rgba(34,211,255,0.08)
            `,
          }}
        >
          {/* Glass reflection streak */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: "8%",
              width: "38%",
              height: "55%",
              background:
                "linear-gradient(125deg, rgba(255,255,255,0.14), rgba(255,255,255,0.02) 40%, transparent 70%)",
              borderRadius: "18px 0 60% 0",
              pointerEvents: "none",
              zIndex: 12,
              mixBlendMode: "screen",
            }}
          />

          {/* Floor depth plane */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "42%",
              background: `
                linear-gradient(180deg, transparent, rgba(0,0,0,0.35) 30%, rgba(8,6,10,0.85)),
                repeating-linear-gradient(90deg, rgba(34,211,255,0.04) 0 2px, transparent 2px 28px)
              `,
              transform: "perspective(400px) rotateX(48deg)",
              transformOrigin: "bottom center",
              zIndex: 1,
            }}
          />

          {/* Canvas FX */}
          <canvas
            ref={canvasRef}
            style={{ position: "absolute", inset: 0, zIndex: 2, opacity: 0.85 }}
          />

          {/* Top rail / gantry */}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: "6%",
              right: "6%",
              height: 8,
              borderRadius: 4,
              zIndex: 6,
              background:
                "linear-gradient(180deg, #3a4254, #1a1e28 55%, #0e1016)",
              border: "1px solid rgba(34,211,255,0.35)",
              boxShadow:
                "0 0 16px rgba(34,211,255,0.25), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: "2px 8%",
                height: 2,
                borderRadius: 1,
                background:
                  "linear-gradient(90deg, transparent, rgba(34,211,255,0.7), transparent)",
              }}
            />
          </div>

          {/* Prize pile — layered 3D-ish tokens */}
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: "5%",
              right: "5%",
              height: 90,
              zIndex: 4,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-end",
              gap: 4,
              opacity: phase === "win" ? 0.4 : 1,
              transition: "opacity 0.7s",
              perspective: 600,
            }}
          >
            {PRIZES.map((p, i) => (
              <div
                key={i}
                style={{
                  width: p.size,
                  height: p.size,
                  borderRadius: p.shape === "box" ? 7 : p.shape === "cube" ? 5 : "50%",
                  marginBottom: p.lift,
                  transform: `translateY(${Math.sin(idleT * 0.002 + i) * 2.5}px) rotateX(12deg) rotateZ(${p.rot}deg)`,
                  background: p.bg,
                  border: p.border,
                  boxShadow: p.shadow,
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                {/* specular */}
                <div
                  style={{
                    position: "absolute",
                    top: "12%",
                    left: "18%",
                    width: "42%",
                    height: "32%",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.22)",
                    filter: "blur(1px)",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Claw assembly */}
          <div
            style={{
              position: "absolute",
              left: `calc(${clawX}% + ${sway}px)`,
              top: clawTop,
              transform: "translateX(-50%)",
              transition:
                phase === "drop"
                  ? "top 1.05s cubic-bezier(0.45, 0.05, 0.25, 1), left 0.22s ease-out"
                  : phase === "lift" || phase === "hold" || phase === "win"
                    ? "top 1.15s cubic-bezier(0.22, 1, 0.36, 1)"
                    : phase === "slip"
                      ? "top 0.55s ease-in"
                      : phase === "return" || phase === "lose"
                        ? "top 0.75s ease, left 0.55s ease"
                        : "top 0.28s ease, left 0.18s ease-out",
              zIndex: 8,
              width: 80,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.55))",
            }}
          >
            {/* Cable */}
            <div
              style={{
                width: 3,
                height: phase === "drop" || phase === "close" ? 36 : 22,
                background:
                  "linear-gradient(180deg, rgba(180,190,210,0.35), rgba(34,211,255,0.55))",
                boxShadow: "0 0 8px rgba(34,211,255,0.4)",
                borderRadius: 2,
                transition: "height 0.9s ease",
                marginBottom: -1,
              }}
            />
            {/* Motor housing */}
            <div
              style={{
                width: 42,
                height: 22,
                borderRadius: 8,
                background:
                  "linear-gradient(180deg, #3a4458 0%, #1c2230 45%, #0e1218 100%)",
                border: "1px solid rgba(34,211,255,0.4)",
                boxShadow:
                  "0 0 18px rgba(34,211,255,0.3), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -2px 4px rgba(0,0,0,0.5)",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 5,
                  left: 8,
                  right: 8,
                  height: 3,
                  borderRadius: 2,
                  background:
                    "linear-gradient(90deg, rgba(255,37,68,0.5), rgba(34,211,255,0.7), rgba(255,37,68,0.5))",
                  opacity: 0.7 + pulse * 0.3,
                }}
              />
            </div>

            {/* Arms */}
            <div
              style={{
                position: "relative",
                width: 72,
                height: 52,
                marginTop: 2,
              }}
            >
              {/* Left finger */}
              <div
                style={{
                  position: "absolute",
                  left: clawOpen ? 0 : 18,
                  top: 0,
                  width: 16,
                  height: 48,
                  borderRadius: "8px 4px 12px 5px",
                  background:
                    "linear-gradient(180deg, #f0f3f8 0%, #9aa3b5 35%, #4a5366 70%, #2a303c 100%)",
                  border: "1px solid rgba(255,255,255,0.28)",
                  transform: clawOpen ? "rotate(-26deg)" : "rotate(10deg)",
                  transformOrigin: "top center",
                  transition: "transform 0.4s cubic-bezier(0.34,1.2,0.64,1), left 0.4s ease",
                  boxShadow:
                    "0 0 14px rgba(255,55,90,0.25), inset 1px 0 0 rgba(255,255,255,0.35)",
                }}
              />
              {/* Right finger */}
              <div
                style={{
                  position: "absolute",
                  right: clawOpen ? 0 : 18,
                  top: 0,
                  width: 16,
                  height: 48,
                  borderRadius: "4px 8px 5px 12px",
                  background:
                    "linear-gradient(180deg, #f0f3f8 0%, #9aa3b5 35%, #4a5366 70%, #2a303c 100%)",
                  border: "1px solid rgba(255,255,255,0.28)",
                  transform: clawOpen ? "rotate(26deg)" : "rotate(-10deg)",
                  transformOrigin: "top center",
                  transition: "transform 0.4s cubic-bezier(0.34,1.2,0.64,1), right 0.4s ease",
                  boxShadow:
                    "0 0 14px rgba(255,55,90,0.25), inset -1px 0 0 rgba(255,255,255,0.35)",
                }}
              />
              {/* Center pivot */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: 0,
                  width: 14,
                  height: 14,
                  marginLeft: -7,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 30%, #5a6478, #1a1e28)",
                  border: "1px solid rgba(34,211,255,0.35)",
                  boxShadow: "0 0 10px rgba(34,211,255,0.3)",
                }}
              />

              {/* Held prize */}
              {showHeld && (
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: 30,
                    transform: "translateX(-50%)",
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 32% 28%, #ff8a98, #ff2544 40%, #8c0a1e 75%, #3a040c)",
                    border: "1.5px solid rgba(255,200,210,0.55)",
                    boxShadow:
                      "0 0 22px rgba(255,37,68,0.85), 0 0 44px rgba(255,37,68,0.4), inset 0 -3px 6px rgba(0,0,0,0.4)",
                    animation:
                      phase === "win"
                        ? "fcPrizePulse 0.75s ease-in-out infinite"
                        : undefined,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "18%",
                      left: "22%",
                      width: "40%",
                      height: "30%",
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.35)",
                    }}
                  />
                </div>
              )}

              {/* Slipping prize */}
              {showSlip && (
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: 42,
                    width: 24,
                    height: 24,
                    marginLeft: -12,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 32% 28%, #ff6a7c, #8c0a1e)",
                    boxShadow: "0 0 16px rgba(255,37,68,0.5)",
                    animation: "fcFall 0.8s cubic-bezier(0.4,0,0.6,1) forwards",
                  }}
                />
              )}
            </div>
          </div>

          {/* Chute / prize exit (bottom right feel) */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              right: 10,
              bottom: 8,
              width: 48,
              height: 36,
              borderRadius: "8px 8px 4px 4px",
              background:
                "linear-gradient(180deg, rgba(20,24,32,0.3), rgba(0,0,0,0.7))",
              border: "1px solid rgba(255,55,90,0.25)",
              boxShadow: "inset 0 0 16px rgba(255,37,68,0.15)",
              zIndex: 5,
            }}
          />

          {/* Win overlay */}
          {phase === "win" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 20,
                display: "grid",
                placeItems: "center",
                background:
                  "radial-gradient(circle at 50% 45%, rgba(255,37,68,0.28), transparent 65%)",
                animation: "fcFadeIn 0.35s ease",
              }}
            >
              <div
                style={{
                  fontFamily: "Orbitron, sans-serif",
                  fontWeight: 700,
                  fontSize: 30,
                  letterSpacing: "0.2em",
                  color: "#fff",
                  textShadow:
                    "0 0 28px rgba(255,37,68,1), 0 0 56px rgba(255,37,68,0.55), 0 0 8px rgba(34,211,255,0.4)",
                  animation: "fcWinPop 0.55s cubic-bezier(0.22,1,0.36,1)",
                }}
              >
                SECURED
              </div>
            </div>
          )}

          {phase === "lose" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 20,
                display: "grid",
                placeItems: "center",
                background: "rgba(0,0,0,0.28)",
                animation: "fcFadeIn 0.35s ease",
              }}
            >
              <div
                style={{
                  fontFamily: "Orbitron, sans-serif",
                  fontWeight: 600,
                  fontSize: 16,
                  letterSpacing: "0.18em",
                  color: "#9BA1AE",
                  textAlign: "center",
                  textShadow: "0 0 12px rgba(0,0,0,0.8)",
                }}
              >
                MISS
              </div>
            </div>
          )}

          {/* Scanlines + vignette */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 14,
              pointerEvents: "none",
              background: `
                repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.035) 2px, rgba(0,0,0,0.035) 4px),
                radial-gradient(ellipse 90% 80% at 50% 40%, transparent 45%, rgba(0,0,0,0.55) 100%)
              `,
              opacity: 0.85,
            }}
          />
        </div>

        {/* Control deck */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 122,
            zIndex: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 20px 14px",
            gap: 12,
            background: `
              linear-gradient(180deg, rgba(16,18,26,0.92), rgba(8,9,12,0.98))
            `,
            borderTop: "1px solid rgba(255,55,90,0.2)",
            boxShadow: "0 -12px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* Status */}
          <div style={{ minWidth: 78 }}>
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 9,
                letterSpacing: "0.18em",
                color: "#5c6478",
                marginBottom: 4,
              }}
            >
              STATUS
            </div>
            <div
              style={{
                fontFamily: "Orbitron, sans-serif",
                fontSize: 11,
                letterSpacing: "0.1em",
                color: statusColor,
                textShadow: isBusy ? `0 0 10px ${statusColor}` : undefined,
              }}
            >
              {statusLabel}
            </div>
          </div>

          {/* Joystick — left / right */}
          <div
            data-claw-controls="joystick"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 8,
                letterSpacing: "0.16em",
                color: "#5c6478",
              }}
            >
              JOYSTICK
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                aria-label="Left"
                data-claw-dir="left"
                disabled={!joyActive}
                onClick={() => move("left")}
                style={joyBtn(joyActive, "left")}
              >
                ←
              </button>
              {/* Stick dome */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle at 35% 30%, #3a4254, #12151c 70%)",
                  border: "2px solid rgba(34,211,255,0.4)",
                  boxShadow: joyActive
                    ? `0 0 ${10 + pulse * 8}px rgba(34,211,255,0.45), inset 0 2px 4px rgba(255,255,255,0.15)`
                    : "inset 0 2px 4px rgba(0,0,0,0.5)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "22%",
                    left: "28%",
                    width: "36%",
                    height: "28%",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.12)",
                  }}
                />
              </div>
              <button
                type="button"
                aria-label="Right"
                data-claw-dir="right"
                disabled={!joyActive}
                onClick={() => move("right")}
                style={joyBtn(joyActive, "right")}
              >
                →
              </button>
            </div>
          </div>

          {/* PULL button */}
          <button
            type="button"
            data-claw-action="pull"
            onClick={() => {
              if (disabled || isBusy) return;
              onDrop();
            }}
            disabled={disabled || isBusy}
            style={{
              minWidth: 108,
              padding: "16px 22px",
              borderRadius: 14,
              border: "1px solid rgba(255,120,140,0.5)",
              cursor: disabled || isBusy ? "not-allowed" : "pointer",
              color: "#fff",
              fontFamily: "Orbitron, Inter, sans-serif",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: "0.22em",
              background:
                disabled || isBusy
                  ? "rgba(60,64,78,0.5)"
                  : "linear-gradient(180deg,#FF4E68 0%,#FF2544 40%,#C4102A 70%,#8C0A1E 100%)",
              boxShadow:
                disabled || isBusy
                  ? "none"
                  : `
                    0 0 36px rgba(255,37,68,0.6),
                    0 5px 0 #5a0812,
                    inset 0 1px 0 rgba(255,255,255,0.35),
                    inset 0 -3px 8px rgba(0,0,0,0.35)
                  `,
              opacity: disabled ? 0.45 : 1,
              transform: animating ? "translateY(2px)" : undefined,
              transition: "transform 0.15s, box-shadow 0.2s, opacity 0.2s",
              textShadow: "0 1px 2px rgba(0,0,0,0.45)",
            }}
          >
            {isBusy ? "···" : "PULL"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fcFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fcWinPop {
          0% { transform: scale(0.35); opacity: 0; filter: blur(6px); }
          65% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; filter: blur(0); }
        }
        @keyframes fcPrizePulse {
          0%, 100% { box-shadow: 0 0 22px rgba(255,37,68,0.85), 0 0 44px rgba(255,37,68,0.4); }
          50% { box-shadow: 0 0 36px rgba(255,37,68,1), 0 0 70px rgba(255,37,68,0.6); }
        }
        @keyframes fcFall {
          0% { transform: translateY(0) scale(1); opacity: 0.95; }
          100% { transform: translateY(90px) scale(0.7); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}

function joyBtn(active: boolean, _side: "left" | "right"): CSSProperties {
  return {
    width: 44,
    height: 44,
    borderRadius: 12,
    border: "1px solid rgba(34,211,255,0.4)",
    background: active
      ? "linear-gradient(180deg,#1e3648,#0e1822)"
      : "rgba(28,32,42,0.55)",
    color: "#22D3FF",
    fontFamily: "Orbitron, sans-serif",
    fontSize: 16,
    fontWeight: 700,
    cursor: active ? "pointer" : "not-allowed",
    opacity: active ? 1 : 0.38,
    display: "grid",
    placeItems: "center",
    boxShadow: active
      ? "0 0 16px rgba(34,211,255,0.28), inset 0 1px 0 rgba(255,255,255,0.1)"
      : "none",
    transition: "transform 0.12s, box-shadow 0.2s",
  };
}

const PRIZES: {
  size: number;
  lift: number;
  rot: number;
  shape: "coin" | "box" | "cube";
  bg: string;
  border: string;
  shadow: string;
}[] = [
  {
    size: 30,
    lift: 4,
    rot: -8,
    shape: "coin",
    bg: "radial-gradient(circle at 32% 28%, #4a5568, #12151c 70%)",
    border: "1.5px solid rgba(34,211,255,0.45)",
    shadow: "0 0 14px rgba(34,211,255,0.3), 0 6px 10px rgba(0,0,0,0.5)",
  },
  {
    size: 36,
    lift: 10,
    rot: 6,
    shape: "coin",
    bg: "radial-gradient(circle at 32% 28%, #ff6a7c, #8c0a1e 65%, #3a040c)",
    border: "1.5px solid rgba(255,120,140,0.55)",
    shadow: "0 0 18px rgba(255,37,68,0.45), 0 6px 10px rgba(0,0,0,0.5)",
  },
  {
    size: 28,
    lift: 2,
    rot: 12,
    shape: "box",
    bg: "linear-gradient(145deg, #2a1840, #12081c)",
    border: "1.5px solid rgba(153,69,255,0.5)",
    shadow: "0 0 14px rgba(153,69,255,0.35), 0 6px 10px rgba(0,0,0,0.5)",
  },
  {
    size: 34,
    lift: 14,
    rot: -4,
    shape: "cube",
    bg: "linear-gradient(145deg, #1a3040, #0a1218)",
    border: "1.5px solid rgba(34,211,255,0.5)",
    shadow: "0 0 16px rgba(34,211,255,0.35), 0 6px 10px rgba(0,0,0,0.5)",
  },
  {
    size: 32,
    lift: 6,
    rot: 10,
    shape: "coin",
    bg: "radial-gradient(circle at 32% 28%, #ffd277, #b8860b 60%, #4a3000)",
    border: "1.5px solid rgba(255,194,75,0.5)",
    shadow: "0 0 16px rgba(255,194,75,0.35), 0 6px 10px rgba(0,0,0,0.5)",
  },
  {
    size: 26,
    lift: 0,
    rot: -14,
    shape: "coin",
    bg: "radial-gradient(circle at 32% 28%, #5a6478, #0e1016 70%)",
    border: "1.5px solid rgba(34,211,255,0.3)",
    shadow: "0 0 12px rgba(34,211,255,0.2), 0 6px 10px rgba(0,0,0,0.5)",
  },
  {
    size: 30,
    lift: 8,
    rot: 3,
    shape: "box",
    bg: "linear-gradient(145deg, #3a1520, #12080c)",
    border: "1.5px solid rgba(255,55,90,0.45)",
    shadow: "0 0 14px rgba(255,37,68,0.3), 0 6px 10px rgba(0,0,0,0.5)",
  },
];
