"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
} from "react";
import {
  clawOverlayText,
  clawStatusLabel,
  isClawBusyPhase,
  type ClawPhase,
} from "@/lib/game/claw-phases";

export type { ClawPhase };

interface Props {
  phase: ClawPhase;
  onDrop: () => void;
  disabled?: boolean;
  clawX?: number;
  onMove?: (dir: "left" | "right") => void;
  canMove?: boolean;
}

/**
 * Premium volumetric FiatClaw cyber-neon claw cabinet.
 * Layered chassis / glass / metal / neon / AO — not a flat sticker.
 * Controls: joystick ← → + large PULL. Phases are parent/server driven.
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
  const [t, setT] = useState(0);
  const clawX = controlledX ?? internalX;
  const isBusy = isClawBusyPhase(phase);
  const status = clawStatusLabel(phase);
  const overlay = clawOverlayText(phase);
  const joyActive = canMove && !isBusy && !disabled;

  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      setT(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Particles + volumetric fog (canvas, no React thrash of DOM)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    const sparks = Array.from({ length: 72 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.3 + Math.random() * 1.9,
      v: 0.00006 + Math.random() * 0.00032,
      o: 0.06 + Math.random() * 0.42,
      ph: Math.random() * Math.PI * 2,
      hue: Math.random() > 0.48 ? 0 : 190,
    }));
    const dust = Array.from({ length: 28 }, () => ({
      x: Math.random(),
      y: 0.55 + Math.random() * 0.4,
      r: 0.8 + Math.random() * 2.2,
      o: 0.04 + Math.random() * 0.1,
      ph: Math.random() * Math.PI * 2,
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

    const frame = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      // volumetric red→cyan volume light
      const g = ctx.createRadialGradient(
        w * 0.5,
        h * 0.15,
        0,
        w * 0.5,
        h * 0.5,
        h * 0.75
      );
      g.addColorStop(0, "rgba(255,37,68,0.09)");
      g.addColorStop(0.35, "rgba(34,211,255,0.05)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (const p of sparks) {
        p.y -= p.v;
        p.x += Math.sin(now * 0.0004 + p.ph) * 0.00016;
        if (p.y < -0.02) {
          p.y = 1.02;
          p.x = Math.random();
        }
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.003 + p.ph);
        const a = p.o * pulse;
        ctx.beginPath();
        ctx.shadowBlur = 10;
        ctx.shadowColor =
          p.hue === 0 ? "rgba(255,37,68,0.9)" : "rgba(34,211,255,0.85)";
        ctx.fillStyle =
          p.hue === 0 ? `rgba(255,62,92,${a})` : `rgba(34,211,255,${a * 0.9})`;
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      for (const d of dust) {
        const dx = d.x + Math.sin(now * 0.0003 + d.ph) * 0.01;
        ctx.beginPath();
        ctx.fillStyle = `rgba(180,190,210,${d.o})`;
        ctx.arc(dx * w, d.y * h, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const move = useCallback(
    (dir: "left" | "right") => {
      if (!joyActive) return;
      if (onMove) {
        onMove(dir);
        return;
      }
      const step = 7;
      if (dir === "left") setInternalX((x) => Math.max(14, x - step));
      if (dir === "right") setInternalX((x) => Math.min(86, x + step));
    },
    [joyActive, onMove]
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
      } else if ((e.key === " " || e.key === "Enter") && joyActive) {
        e.preventDefault();
        onDrop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isBusy, joyActive, move, onDrop]);

  const clawTop =
    phase === "idle" || phase === "ready"
      ? "9%"
      : phase === "drop" || phase === "close"
        ? "56%"
        : phase === "lift" || phase === "hold" || phase === "win"
          ? "11%"
          : phase === "slip"
            ? "28%"
            : phase === "return" || phase === "lose"
              ? "10%"
              : "9%";

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

  const sway =
    phase === "idle" || phase === "ready" ? Math.sin(t * 0.00115) * 1.4 : 0;
  const pulse = 0.55 + 0.45 * Math.sin(t * 0.0024);

  const statusColor =
    phase === "win"
      ? "#14F195"
      : phase === "lose" || phase === "slip"
        ? "#FF6B7A"
        : isBusy
          ? "#22D3FF"
          : "#EDEEF2";

  return (
    <div
      data-claw-machine="premium-volumetric"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 480,
        margin: "0 auto",
        aspectRatio: "3 / 4.2",
        perspective: "1400px",
        perspectiveOrigin: "50% 40%",
      }}
    >
      {/* Floor shadow under cabinet */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          bottom: -6,
          height: 28,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(0,0,0,0.65), transparent 70%)",
          filter: "blur(6px)",
          zIndex: 0,
        }}
      />

      {/* 3D tilted chassis */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 30,
          transform: "rotateX(3.5deg) translateZ(0)",
          transformStyle: "preserve-3d",
          background: `
            linear-gradient(155deg,
              #222632 0%,
              #12151c 22%,
              #0a0c10 55%,
              #06070a 100%)
          `,
          border: "1px solid rgba(255,62,92,0.38)",
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.045) inset,
            0 0 0 4px rgba(0,0,0,0.5) inset,
            0 1px 0 rgba(255,255,255,0.08) inset,
            0 0 90px rgba(255,37,68,0.2),
            0 0 48px rgba(34,211,255,0.1),
            0 36px 70px rgba(0,0,0,0.75)
          `,
          overflow: "hidden",
          zIndex: 1,
        }}
      >
        {/* Outer metal bevel ring */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 3,
            borderRadius: 27,
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow:
              "inset 0 0 0 1px rgba(0,0,0,0.4), inset 0 2px 12px rgba(0,0,0,0.35)",
            pointerEvents: "none",
            zIndex: 30,
          }}
        />

        {/* Side pillars with chamfer + neon edge */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 18,
            zIndex: 22,
            background: `
              linear-gradient(90deg,
                #050608 0%,
                #1c222e 28%,
                #3a4458 48%,
                #1a1e28 72%,
                #0a0c10 100%)
            `,
            boxShadow:
              "4px 0 18px rgba(0,0,0,0.55), inset -1px 0 0 rgba(34,211,255,0.22)",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "12%",
              bottom: "18%",
              width: 2,
              background: `linear-gradient(180deg, transparent, rgba(34,211,255,${0.35 + pulse * 0.4}), transparent)`,
              boxShadow: `0 0 ${8 + pulse * 6}px rgba(34,211,255,0.5)`,
            }}
          />
        </div>
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 18,
            zIndex: 22,
            background: `
              linear-gradient(270deg,
                #050608 0%,
                #1c222e 28%,
                #3a4458 48%,
                #1a1e28 72%,
                #0a0c10 100%)
            `,
            boxShadow:
              "-4px 0 18px rgba(0,0,0,0.55), inset 1px 0 0 rgba(255,62,92,0.25)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "12%",
              bottom: "18%",
              width: 2,
              background: `linear-gradient(180deg, transparent, rgba(255,62,92,${0.35 + pulse * 0.4}), transparent)`,
              boxShadow: `0 0 ${8 + pulse * 6}px rgba(255,37,68,0.55)`,
            }}
          />
        </div>

        {/* Top neon edge */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 18,
            right: 18,
            height: 3,
            zIndex: 23,
            background: `linear-gradient(90deg, transparent 0%, #FF3E5C ${30 + pulse * 10}%, #22D3FF 70%, transparent 100%)`,
            boxShadow: `0 0 ${16 + pulse * 12}px rgba(255,37,68,0.65), 0 0 8px rgba(34,211,255,0.4)`,
            opacity: 0.85 + pulse * 0.15,
          }}
        />

        {/* Header marquee */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 18,
            right: 18,
            height: 54,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(180deg, rgba(28,30,40,0.98) 0%, rgba(14,16,22,0.94) 100%)",
            borderBottom: "1px solid rgba(255,62,92,0.3)",
            boxShadow:
              "0 10px 28px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "repeating-linear-gradient(90deg, transparent 0 16px, rgba(255,62,92,0.04) 16px 17px)",
              opacity: 0.8,
              pointerEvents: "none",
            }}
          />
          <span
            style={{
              fontFamily: "Orbitron, Inter, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.34em",
              color: "#FF3E5C",
              textShadow: `0 0 ${12 + pulse * 14}px rgba(255,37,68,0.9), 0 0 32px rgba(255,37,68,0.45)`,
              position: "relative",
            }}
          >
            FIATCLAW ARCADE
          </span>
          <div
            style={{
              position: "absolute",
              right: 14,
              display: "flex",
              gap: 6,
            }}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background:
                    i === 0 && isBusy
                      ? "#22D3FF"
                      : i === 1 && phase === "win"
                        ? "#14F195"
                        : "#FF3E5C",
                  boxShadow: "0 0 10px currentColor",
                  opacity: 0.45 + 0.55 * Math.sin(t * 0.004 + i * 1.2),
                }}
              />
            ))}
          </div>
        </div>

        {/* ── Glass chamber ── */}
        <div
          data-claw-chamber="glass"
          style={{
            position: "absolute",
            top: 58,
            left: 26,
            right: 26,
            bottom: 132,
            borderRadius: 20,
            overflow: "hidden",
            zIndex: 4,
            // thick glass body
            background: `
              linear-gradient(185deg,
                rgba(36,52,72,0.42) 0%,
                rgba(16,22,34,0.5) 35%,
                rgba(8,10,16,0.68) 70%,
                rgba(4,5,8,0.78) 100%)
            `,
            border: "1px solid rgba(34,211,255,0.28)",
            boxShadow: `
              inset 0 0 80px rgba(34,211,255,0.07),
              inset 0 2px 0 rgba(255,255,255,0.14),
              inset 0 -28px 50px rgba(0,0,0,0.5),
              inset 0 0 0 1px rgba(255,255,255,0.04),
              0 0 36px rgba(34,211,255,0.1)
            `,
          }}
        >
          {/* Glass thickness rim (inner) */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 20,
              border: "2px solid rgba(255,255,255,0.05)",
              boxShadow: "inset 0 0 0 3px rgba(0,0,0,0.15)",
              pointerEvents: "none",
              zIndex: 15,
            }}
          />

          {/* Specular glare streak */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "-5%",
              left: "4%",
              width: "42%",
              height: "58%",
              background:
                "linear-gradient(128deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 32%, transparent 62%)",
              borderRadius: "40% 0 55% 0",
              pointerEvents: "none",
              zIndex: 14,
              mixBlendMode: "screen",
              transform: `translateX(${Math.sin(t * 0.0004) * 4}px)`,
            }}
          />
          {/* Secondary cyan rim light */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "30%",
              height: "40%",
              background:
                "linear-gradient(220deg, rgba(34,211,255,0.12), transparent 60%)",
              pointerEvents: "none",
              zIndex: 13,
            }}
          />

          {/* Perspective floor with AO */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              bottom: 0,
              left: "-5%",
              right: "-5%",
              height: "48%",
              zIndex: 1,
              background: `
                linear-gradient(180deg,
                  transparent 0%,
                  rgba(0,0,0,0.25) 25%,
                  rgba(6,5,10,0.75) 70%,
                  rgba(2,2,4,0.9) 100%),
                repeating-linear-gradient(90deg,
                  rgba(34,211,255,0.05) 0 1px,
                  transparent 1px 26px)
              `,
              transform: "perspective(420px) rotateX(52deg)",
              transformOrigin: "bottom center",
              boxShadow: "inset 0 20px 40px rgba(0,0,0,0.4)",
            }}
          />

          {/* Back wall AO gradient */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              background:
                "radial-gradient(ellipse 100% 80% at 50% 100%, rgba(255,37,68,0.06), transparent 50%)",
              pointerEvents: "none",
            }}
          />

          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 3,
              opacity: 0.88,
              pointerEvents: "none",
            }}
          />

          {/* Gantry rail (metal thickness) */}
          <div
            style={{
              position: "absolute",
              top: 12,
              left: "5%",
              right: "5%",
              height: 12,
              zIndex: 7,
              borderRadius: 5,
              background:
                "linear-gradient(180deg, #5a6578 0%, #2a3040 35%, #12151c 70%, #0a0c10 100%)",
              border: "1px solid rgba(34,211,255,0.4)",
              boxShadow: `
                0 0 20px rgba(34,211,255,0.3),
                inset 0 1px 0 rgba(255,255,255,0.35),
                inset 0 -2px 4px rgba(0,0,0,0.55),
                0 4px 8px rgba(0,0,0,0.4)
              `,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "6%",
                right: "6%",
                top: 4,
                height: 2,
                borderRadius: 1,
                background:
                  "linear-gradient(90deg, transparent, rgba(34,211,255,0.85), transparent)",
              }}
            />
          </div>

          {/* Live prize stack */}
          <div
            data-claw-prizes="live"
            style={{
              position: "absolute",
              bottom: 12,
              left: "4%",
              right: "4%",
              height: 100,
              zIndex: 5,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-end",
              gap: 3,
              opacity: phase === "win" ? 0.38 : 1,
              transition: "opacity 0.75s ease",
              perspective: 700,
            }}
          >
            {PRIZES.map((p, i) => (
              <div
                key={i}
                style={{
                  width: p.size,
                  height: p.size * (p.shape === "box" ? 0.92 : 1),
                  borderRadius:
                    p.shape === "coin" ? "50%" : p.shape === "cube" ? 6 : 8,
                  marginBottom: p.lift,
                  flexShrink: 0,
                  transform: `
                    translateY(${Math.sin(t * 0.0018 + i * 0.9) * 3.2}px)
                    rotateX(14deg)
                    rotateZ(${p.rot + Math.sin(t * 0.001 + i) * 2}deg)
                    translateZ(${p.z}px)
                  `,
                  background: p.bg,
                  border: p.border,
                  boxShadow: `${p.shadow}, 0 8px 14px rgba(0,0,0,0.55)`,
                  position: "relative",
                }}
              >
                {/* thickness edge */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "inherit",
                    boxShadow: "inset 0 -4px 8px rgba(0,0,0,0.35), inset 0 2px 0 rgba(255,255,255,0.15)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "14%",
                    left: "18%",
                    width: "40%",
                    height: "28%",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.28)",
                    filter: "blur(0.5px)",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Prize chute (depth box) */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              right: 12,
              bottom: 10,
              width: 52,
              height: 40,
              zIndex: 6,
              borderRadius: "10px 10px 4px 4px",
              background:
                "linear-gradient(180deg, rgba(24,28,38,0.2), rgba(0,0,0,0.75))",
              border: "1px solid rgba(255,62,92,0.3)",
              boxShadow:
                "inset 0 0 20px rgba(255,37,68,0.18), inset 0 8px 12px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 6,
                left: 8,
                right: 8,
                height: 2,
                background: "rgba(255,62,92,0.35)",
                borderRadius: 1,
              }}
            />
          </div>

          {/* ── Claw assembly (thickness) ── */}
          <div
            data-claw-assembly
            style={{
              position: "absolute",
              left: `calc(${clawX}% + ${sway}px)`,
              top: clawTop,
              transform: "translateX(-50%)",
              transition:
                phase === "drop"
                  ? "top 1.08s cubic-bezier(0.45, 0.02, 0.2, 1), left 0.2s ease-out"
                  : phase === "lift" || phase === "hold" || phase === "win"
                    ? "top 1.18s cubic-bezier(0.22, 1, 0.36, 1)"
                    : phase === "slip"
                      ? "top 0.52s ease-in"
                      : phase === "return" || phase === "lose"
                        ? "top 0.78s ease, left 0.55s ease"
                        : "top 0.28s ease, left 0.16s ease-out",
              zIndex: 9,
              width: 88,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              filter: "drop-shadow(0 10px 16px rgba(0,0,0,0.6))",
            }}
          >
            {/* Rope / cable with thickness */}
            <div
              style={{
                width: 4,
                height: phase === "drop" || phase === "close" ? 40 : 24,
                borderRadius: 2,
                background:
                  "linear-gradient(90deg, #6a7388, #c8d0e0 40%, #8a93a8 60%, #3a4254)",
                boxShadow:
                  "0 0 10px rgba(34,211,255,0.35), inset 1px 0 0 rgba(255,255,255,0.4)",
                transition: "height 0.95s cubic-bezier(0.4,0,0.2,1)",
                marginBottom: -1,
              }}
            />
            {/* Carriage on rail */}
            <div
              style={{
                width: 48,
                height: 16,
                borderRadius: 4,
                marginBottom: 2,
                background:
                  "linear-gradient(180deg, #4a5568, #1a1e28 60%, #0c0e14)",
                border: "1px solid rgba(34,211,255,0.35)",
                boxShadow:
                  "0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
            />
            {/* Motor block */}
            <div
              style={{
                width: 46,
                height: 26,
                borderRadius: 9,
                background:
                  "linear-gradient(165deg, #4a5568 0%, #2a3344 30%, #141820 65%, #0a0c10 100%)",
                border: "1px solid rgba(34,211,255,0.45)",
                boxShadow: `
                  0 0 22px rgba(34,211,255,0.35),
                  inset 0 2px 0 rgba(255,255,255,0.28),
                  inset 0 -3px 6px rgba(0,0,0,0.55),
                  0 4px 8px rgba(0,0,0,0.4)
                `,
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 7,
                  left: 9,
                  right: 9,
                  height: 4,
                  borderRadius: 2,
                  background: `linear-gradient(90deg, rgba(255,62,92,${0.4 + pulse * 0.3}), rgba(34,211,255,${0.6 + pulse * 0.3}), rgba(255,62,92,${0.4 + pulse * 0.3}))`,
                  boxShadow: `0 0 ${6 + pulse * 6}px rgba(34,211,255,0.5)`,
                }}
              />
              {/* side chamfer lights */}
              <div
                style={{
                  position: "absolute",
                  left: 3,
                  top: 6,
                  bottom: 6,
                  width: 2,
                  borderRadius: 1,
                  background: "rgba(255,255,255,0.15)",
                }}
              />
            </div>

            {/* Fingers with thickness */}
            <div
              style={{
                position: "relative",
                width: 78,
                height: 56,
                marginTop: 3,
              }}
            >
              {/* Left finger — dual layer for thickness */}
              <div
                style={{
                  position: "absolute",
                  left: clawOpen ? -2 : 18,
                  top: 0,
                  width: 18,
                  height: 52,
                  transform: clawOpen ? "rotate(-28deg)" : "rotate(11deg)",
                  transformOrigin: "top center",
                  transition:
                    "transform 0.42s cubic-bezier(0.34,1.25,0.64,1), left 0.42s ease",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "9px 5px 14px 6px",
                    background:
                      "linear-gradient(180deg, #f4f6fa 0%, #a8b0c0 28%, #5a6478 58%, #2a303c 100%)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    boxShadow:
                      "3px 0 0 rgba(0,0,0,0.25), 0 0 16px rgba(255,62,92,0.22), inset 1px 0 0 rgba(255,255,255,0.4)",
                  }}
                />
              </div>
              <div
                style={{
                  position: "absolute",
                  right: clawOpen ? -2 : 18,
                  top: 0,
                  width: 18,
                  height: 52,
                  transform: clawOpen ? "rotate(28deg)" : "rotate(-11deg)",
                  transformOrigin: "top center",
                  transition:
                    "transform 0.42s cubic-bezier(0.34,1.25,0.64,1), right 0.42s ease",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "5px 9px 6px 14px",
                    background:
                      "linear-gradient(180deg, #f4f6fa 0%, #a8b0c0 28%, #5a6478 58%, #2a303c 100%)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    boxShadow:
                      "-3px 0 0 rgba(0,0,0,0.25), 0 0 16px rgba(255,62,92,0.22), inset -1px 0 0 rgba(255,255,255,0.4)",
                  }}
                />
              </div>
              {/* Pivot joint */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: -2,
                  width: 16,
                  height: 16,
                  marginLeft: -8,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle at 35% 30%, #7a8498, #1a1e28 70%)",
                  border: "1px solid rgba(34,211,255,0.4)",
                  boxShadow:
                    "0 0 12px rgba(34,211,255,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
                  zIndex: 2,
                }}
              />

              {showHeld && (
                <div
                  data-claw-prize-held
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: 32,
                    transform: "translateX(-50%)",
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 30% 26%, #ff9aa6, #FF3E5C 38%, #8c0a1e 72%, #2a0408)",
                    border: "1.5px solid rgba(255,200,210,0.55)",
                    boxShadow:
                      "0 0 24px rgba(255,37,68,0.9), 0 0 48px rgba(255,37,68,0.45), inset 0 -4px 8px rgba(0,0,0,0.4)",
                    animation:
                      phase === "win"
                        ? "fcPrizePulse 0.72s ease-in-out infinite"
                        : undefined,
                    zIndex: 1,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "16%",
                      left: "20%",
                      width: "38%",
                      height: "28%",
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.38)",
                    }}
                  />
                </div>
              )}

              {showSlip && (
                <div
                  data-claw-prize-slip
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: 44,
                    width: 26,
                    height: 26,
                    marginLeft: -13,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 32% 28%, #ff6a7c, #8c0a1e)",
                    boxShadow: "0 0 18px rgba(255,37,68,0.55)",
                    animation: "fcFall 0.82s cubic-bezier(0.4,0,0.55,1) forwards",
                  }}
                />
              )}
            </div>
          </div>

          {/* Win / Miss overlays */}
          {overlay === "SECURED" && (
            <div
              data-claw-overlay="secured"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 25,
                display: "grid",
                placeItems: "center",
                background: `
                  radial-gradient(circle at 50% 42%, rgba(255,37,68,0.35), transparent 62%),
                  radial-gradient(circle at 50% 50%, rgba(34,211,255,0.12), transparent 70%)
                `,
                animation: "fcFadeIn 0.32s ease",
              }}
            >
              <div
                style={{
                  fontFamily: "Orbitron, sans-serif",
                  fontWeight: 700,
                  fontSize: 32,
                  letterSpacing: "0.22em",
                  color: "#fff",
                  textShadow:
                    "0 0 30px rgba(255,37,68,1), 0 0 60px rgba(255,37,68,0.6), 0 0 12px rgba(34,211,255,0.5)",
                  animation: "fcWinPop 0.55s cubic-bezier(0.22,1,0.36,1)",
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
                zIndex: 25,
                display: "grid",
                placeItems: "center",
                background: "rgba(0,0,0,0.32)",
                animation: "fcFadeIn 0.32s ease",
              }}
            >
              <div
                style={{
                  fontFamily: "Orbitron, sans-serif",
                  fontWeight: 600,
                  fontSize: 18,
                  letterSpacing: "0.22em",
                  color: "#9BA1AE",
                  textShadow: "0 0 16px rgba(0,0,0,0.9)",
                }}
              >
                MISS
              </div>
            </div>
          )}

          {/* Scanlines + vignette (subtle) */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 16,
              pointerEvents: "none",
              background: `
                repeating-linear-gradient(
                  0deg,
                  transparent,
                  transparent 2px,
                  rgba(0,0,0,0.03) 2px,
                  rgba(0,0,0,0.03) 4px
                ),
                radial-gradient(
                  ellipse 92% 85% at 50% 42%,
                  transparent 42%,
                  rgba(0,0,0,0.58) 100%
                )
              `,
              opacity: 0.9,
            }}
          />
        </div>

        {/* ── Control deck ── */}
        <div
          data-claw-controls="deck"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 128,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 22px 16px",
            gap: 12,
            background: `
              linear-gradient(180deg,
                rgba(18,20,28,0.96) 0%,
                rgba(8,9,12,0.99) 100%)
            `,
            borderTop: "1px solid rgba(255,62,92,0.22)",
            boxShadow:
              "0 -14px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {/* Status panel */}
          <div
            data-claw-status={status}
            style={{
              minWidth: 92,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background:
                "linear-gradient(165deg, rgba(24,28,38,0.9), rgba(10,12,16,0.95))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 9,
                letterSpacing: "0.2em",
                color: "#5c6478",
                marginBottom: 5,
              }}
            >
              STATUS
            </div>
            <div
              style={{
                fontFamily: "Orbitron, sans-serif",
                fontSize: 11,
                letterSpacing: "0.12em",
                color: statusColor,
                textShadow: isBusy || phase === "win" ? `0 0 12px ${statusColor}` : undefined,
              }}
            >
              {status}
            </div>
          </div>

          {/* Joystick */}
          <div
            data-claw-controls="joystick"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 7,
            }}
          >
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 8,
                letterSpacing: "0.18em",
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
                style={joyBtn(joyActive)}
              >
                ←
              </button>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle at 32% 28%, #4a5568, #12151c 68%, #06070a)",
                  border: "2px solid rgba(34,211,255,0.45)",
                  boxShadow: joyActive
                    ? `0 0 ${12 + pulse * 10}px rgba(34,211,255,0.5), inset 0 2px 6px rgba(255,255,255,0.12), 0 4px 0 #0a0c10`
                    : "inset 0 3px 8px rgba(0,0,0,0.6), 0 3px 0 #0a0c10",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "20%",
                    left: "26%",
                    width: "38%",
                    height: "30%",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.14)",
                  }}
                />
                {/* stick shaft */}
                <div
                  style={{
                    position: "absolute",
                    bottom: -6,
                    left: "50%",
                    width: 8,
                    height: 10,
                    marginLeft: -4,
                    borderRadius: 2,
                    background: "linear-gradient(180deg, #3a4254, #12151c)",
                    border: "1px solid rgba(0,0,0,0.4)",
                  }}
                />
              </div>
              <button
                type="button"
                aria-label="Right"
                data-claw-dir="right"
                disabled={!joyActive}
                onClick={() => move("right")}
                style={joyBtn(joyActive)}
              >
                →
              </button>
            </div>
          </div>

          {/* Large PULL */}
          <button
            type="button"
            data-claw-action="pull"
            onClick={() => {
              if (disabled || isBusy) return;
              onDrop();
            }}
            disabled={disabled || isBusy}
            style={{
              minWidth: 118,
              padding: "18px 26px",
              borderRadius: 16,
              border: "1px solid rgba(255,120,140,0.55)",
              cursor: disabled || isBusy ? "not-allowed" : "pointer",
              color: "#fff",
              fontFamily: "Orbitron, Inter, sans-serif",
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "0.24em",
              background:
                disabled || isBusy
                  ? "rgba(55,58,72,0.55)"
                  : "linear-gradient(180deg, #FF5A72 0%, #FF3E5C 28%, #C4102A 68%, #8C0A1E 100%)",
              boxShadow:
                disabled || isBusy
                  ? "none"
                  : `
                    0 0 40px rgba(255,37,68,0.65),
                    0 6px 0 #4a0610,
                    inset 0 2px 0 rgba(255,255,255,0.38),
                    inset 0 -4px 10px rgba(0,0,0,0.35)
                  `,
              opacity: disabled ? 0.45 : 1,
              transform: isBusy ? "translateY(3px)" : undefined,
              transition: "transform 0.14s, box-shadow 0.2s, opacity 0.2s",
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
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
          0% { transform: scale(0.32); opacity: 0; filter: blur(8px); }
          60% { transform: scale(1.12); }
          100% { transform: scale(1); opacity: 1; filter: blur(0); }
        }
        @keyframes fcPrizePulse {
          0%, 100% { box-shadow: 0 0 24px rgba(255,37,68,0.9), 0 0 48px rgba(255,37,68,0.45); }
          50% { box-shadow: 0 0 40px rgba(255,37,68,1), 0 0 72px rgba(255,37,68,0.65); }
        }
        @keyframes fcFall {
          0% { transform: translateY(0) scale(1); opacity: 0.95; }
          100% { transform: translateY(96px) scale(0.65); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}

function joyBtn(active: boolean): CSSProperties {
  return {
    width: 46,
    height: 46,
    borderRadius: 13,
    border: "1px solid rgba(34,211,255,0.42)",
    background: active
      ? "linear-gradient(180deg, #244056, #0e1822)"
      : "rgba(28,32,42,0.55)",
    color: "#22D3FF",
    fontFamily: "Orbitron, sans-serif",
    fontSize: 17,
    fontWeight: 700,
    cursor: active ? "pointer" : "not-allowed",
    opacity: active ? 1 : 0.36,
    display: "grid",
    placeItems: "center",
    boxShadow: active
      ? "0 0 18px rgba(34,211,255,0.3), inset 0 1px 0 rgba(255,255,255,0.12), 0 3px 0 #0a1018"
      : "none",
    transition: "transform 0.12s, box-shadow 0.2s",
  };
}

const PRIZES: {
  size: number;
  lift: number;
  rot: number;
  z: number;
  shape: "coin" | "box" | "cube";
  bg: string;
  border: string;
  shadow: string;
}[] = [
  {
    size: 32,
    lift: 6,
    rot: -10,
    z: 4,
    shape: "coin",
    bg: "radial-gradient(circle at 30% 26%, #5a6578, #12151c 72%)",
    border: "1.5px solid rgba(34,211,255,0.5)",
    shadow: "0 0 16px rgba(34,211,255,0.35)",
  },
  {
    size: 38,
    lift: 12,
    rot: 8,
    z: 12,
    shape: "coin",
    bg: "radial-gradient(circle at 30% 26%, #ff7a8c, #FF3E5C 45%, #6a0814 75%)",
    border: "1.5px solid rgba(255,140,160,0.6)",
    shadow: "0 0 20px rgba(255,37,68,0.5)",
  },
  {
    size: 30,
    lift: 2,
    rot: 14,
    z: 2,
    shape: "box",
    bg: "linear-gradient(145deg, #3a2058, #14081c)",
    border: "1.5px solid rgba(153,69,255,0.55)",
    shadow: "0 0 16px rgba(153,69,255,0.4)",
  },
  {
    size: 36,
    lift: 16,
    rot: -6,
    z: 16,
    shape: "cube",
    bg: "linear-gradient(145deg, #1e3a4a, #081018)",
    border: "1.5px solid rgba(34,211,255,0.55)",
    shadow: "0 0 18px rgba(34,211,255,0.4)",
  },
  {
    size: 34,
    lift: 8,
    rot: 12,
    z: 8,
    shape: "coin",
    bg: "radial-gradient(circle at 30% 26%, #ffe08a, #c9a032 55%, #4a3000)",
    border: "1.5px solid rgba(255,194,75,0.55)",
    shadow: "0 0 18px rgba(255,194,75,0.4)",
  },
  {
    size: 28,
    lift: 0,
    rot: -16,
    z: 0,
    shape: "coin",
    bg: "radial-gradient(circle at 30% 26%, #6a7488, #0e1016 72%)",
    border: "1.5px solid rgba(34,211,255,0.35)",
    shadow: "0 0 12px rgba(34,211,255,0.25)",
  },
  {
    size: 32,
    lift: 10,
    rot: 4,
    z: 10,
    shape: "box",
    bg: "linear-gradient(145deg, #4a1828, #14080c)",
    border: "1.5px solid rgba(255,62,92,0.5)",
    shadow: "0 0 16px rgba(255,37,68,0.35)",
  },
  {
    size: 26,
    lift: 4,
    rot: 18,
    z: 6,
    shape: "cube",
    bg: "linear-gradient(145deg, #1a2840, #080c14)",
    border: "1.5px solid rgba(34,211,255,0.4)",
    shadow: "0 0 12px rgba(34,211,255,0.28)",
  },
];
