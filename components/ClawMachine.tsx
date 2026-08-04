"use client";

/**
 * AAA FiatClaw CSS-3D claw cabinet — full rewrite.
 * True perspective stacks: chassis faces, glass box, floor plane, 3D claw solids.
 * Phases driven by parent (server outcome). No odds / % UI.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  clawFingersOpen,
  clawOverlayText,
  clawShouldHoldPrize,
  clawStatusLabel,
  isClawBusyPhase,
  updateSlippedLatch,
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

const RED = "#FF3E5C";
const CYAN = "#22D3FF";
const BG = "#0a0b10";

export function ClawMachine({
  phase,
  onDrop,
  disabled,
  clawX: controlledX,
  onMove,
  canMove = false,
}: Props) {
  const fxRef = useRef<HTMLCanvasElement>(null);
  const [internalX, setInternalX] = useState(50);
  const [clock, setClock] = useState(0);
  /** Once true after slip this pull — return/lose open fingers & drop prize. */
  const [slippedThisPull, setSlippedThisPull] = useState(false);
  const clawX = controlledX ?? internalX;
  const busy = isClawBusyPhase(phase);
  const status = clawStatusLabel(phase);
  const overlay = clawOverlayText(phase);
  const joyOn = Boolean(canMove && !busy && !disabled);
  const shaking = phase === "win";
  const winBurst = phase === "win";

  useEffect(() => {
    setSlippedThisPull((prev) => updateSlippedLatch(phase, prev));
  }, [phase]);

  // RAF clock for idle bob / neon (throttled via rAF, not setState every frame heavily)
  useEffect(() => {
    let id = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 32) {
        setClock(t);
        last = t;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  // Particle field inside glass
  useEffect(() => {
    const c = fxRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    type P = { x: number; y: number; z: number; r: number; v: number; o: number; ph: number; hue: number };
    const parts: P[] = Array.from({ length: 56 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random(),
      r: 0.4 + Math.random() * 1.6,
      v: 0.00005 + Math.random() * 0.00028,
      o: 0.08 + Math.random() * 0.35,
      ph: Math.random() * Math.PI * 2,
      hue: Math.random() > 0.5 ? 0 : 1,
    }));

    const resize = () => {
      const box = c.parentElement?.getBoundingClientRect();
      if (!box) return;
      w = box.width;
      h = box.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
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
      // depth fog veil
      const fog = ctx.createLinearGradient(0, 0, 0, h);
      fog.addColorStop(0, "rgba(10,12,18,0.15)");
      fog.addColorStop(0.55, "rgba(10,12,18,0)");
      fog.addColorStop(1, "rgba(0,0,0,0.25)");
      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, w, h);

      for (const p of parts) {
        p.y -= p.v * (0.6 + p.z);
        p.x += Math.sin(t * 0.00035 + p.ph) * 0.00012;
        if (p.y < -0.02) {
          p.y = 1.02;
          p.x = Math.random();
        }
        const scale = 0.55 + p.z * 0.9;
        const px = p.x * w;
        const py = p.y * h * (0.85 + p.z * 0.15);
        const a = p.o * (0.5 + 0.5 * Math.sin(t * 0.0025 + p.ph));
        ctx.beginPath();
        ctx.shadowBlur = 8 * scale;
        ctx.shadowColor = p.hue ? "rgba(34,211,255,0.9)" : "rgba(255,62,92,0.9)";
        ctx.fillStyle = p.hue
          ? `rgba(34,211,255,${a})`
          : `rgba(255,62,92,${a})`;
        ctx.arc(px, py, p.r * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // win confetti burst
      if (winBurst) {
        for (let i = 0; i < 24; i++) {
          const ang = (i / 24) * Math.PI * 2 + t * 0.002;
          const rad = 40 + (t % 800) * 0.08 + i * 3;
          const cx = w * 0.5 + Math.cos(ang) * rad;
          const cy = h * 0.38 + Math.sin(ang) * rad * 0.55;
          ctx.beginPath();
          ctx.fillStyle = i % 2 ? "rgba(255,62,92,0.75)" : "rgba(34,211,255,0.75)";
          ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [winBurst]);

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

  // Claw depth along Y in chamber % (true 3D via translateZ + top)
  const clawDepth = useMemo(() => {
    switch (phase) {
      case "drop":
      case "close":
        return { top: "52%", z: 40 };
      case "lift":
      case "hold":
      case "win":
        return { top: "10%", z: 80 };
      case "slip":
        return { top: "26%", z: 50 };
      case "return":
      case "lose":
        return { top: "9%", z: 70 };
      default:
        return { top: "8%", z: 90 };
    }
  }, [phase]);

  // Win: prize stays gripped through return → SECURED. Lose: open after slip.
  const holdPrize = clawShouldHoldPrize(phase, slippedThisPull);
  const fingersOpen = clawFingersOpen(phase, slippedThisPull);
  const slipPrize =
    phase === "slip" || (phase === "lose" && !holdPrize);

  const idleSway =
    phase === "idle" || phase === "ready" ? Math.sin(clock * 0.0011) * 1.6 : 0;
  const pulse = 0.55 + 0.45 * Math.sin(clock * 0.0022);

  const statusColor =
    phase === "win"
      ? "#14F195"
      : phase === "lose" || phase === "slip"
        ? "#FF6B7A"
        : busy
          ? CYAN
          : "#EDEEF2";

  const clawTransition =
    phase === "drop"
      ? "top 1.1s cubic-bezier(0.4, 0, 0.15, 1), transform 1.1s cubic-bezier(0.4, 0, 0.15, 1), left 0.18s ease-out"
      : phase === "lift" || phase === "hold" || phase === "win"
        ? "top 1.2s cubic-bezier(0.22, 1, 0.36, 1), transform 1.2s cubic-bezier(0.22, 1, 0.36, 1)"
        : phase === "slip"
          ? "top 0.5s ease-in, transform 0.5s ease-in"
          : "top 0.75s ease, transform 0.75s ease, left 0.2s ease-out";

  return (
    <div
      data-claw-machine="aaa-css3d"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 500,
        margin: "0 auto",
        aspectRatio: "10 / 14",
        perspective: "1600px",
        perspectiveOrigin: "50% 35%",
      }}
    >
      {/* Ground contact shadow under whole cabinet */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "6%",
          right: "6%",
          bottom: -10,
          height: 36,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.75) 0%, transparent 70%)",
          filter: "blur(8px)",
          zIndex: 0,
        }}
      />

      {/* ═══════ 3D CABINET ROOT ═══════ */}
      <div
        data-claw-chassis
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform: shaking
            ? `rotateX(6deg) rotateY(${Math.sin(clock * 0.04) * 1.2}deg) translateZ(0)`
            : "rotateX(6deg) rotateY(-2deg) translateZ(0)",
          transition: shaking ? "none" : "transform 0.4s ease",
          animation: shaking ? "fcChassisShake 0.55s ease-out" : undefined,
          zIndex: 1,
        }}
      >
        {/* Cabinet body (front face with depth via layered bevels) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 28,
            transformStyle: "preserve-3d",
            background: `
              linear-gradient(145deg,
                #2a2e3a 0%,
                #161922 18%,
                ${BG} 48%,
                #05060a 100%)
            `,
            border: `1px solid rgba(255,62,92,0.4)`,
            boxShadow: `
              0 0 0 1px rgba(255,255,255,0.05) inset,
              0 0 0 5px rgba(0,0,0,0.55) inset,
              0 2px 0 rgba(255,255,255,0.07) inset,
              0 0 100px rgba(255,37,68,0.22),
              0 0 50px rgba(34,211,255,0.12),
              0 40px 80px rgba(0,0,0,0.8)
            `,
            overflow: "hidden",
          }}
        >
          {/* Top bevel lip (metal thickness) */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 14,
              background:
                "linear-gradient(180deg, #4a5160 0%, #1c2028 55%, #0c0e14 100%)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              zIndex: 40,
            }}
          />
          {/* Neon rim TOP */}
          <div
            aria-hidden
            data-claw-neon="rim"
            style={{
              position: "absolute",
              top: 12,
              left: 20,
              right: 20,
              height: 3,
              zIndex: 41,
              borderRadius: 2,
              background: `linear-gradient(90deg, transparent, ${RED}, ${CYAN}, transparent)`,
              boxShadow: `0 0 ${14 + pulse * 12}px ${RED}, 0 0 8px ${CYAN}`,
              opacity: 0.75 + pulse * 0.25,
            }}
          />

          {/* LEFT metal pillar (chamfered) — extruded look via gradient bands */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 22,
              zIndex: 35,
              background: `
                linear-gradient(90deg,
                  #040508 0%,
                  #1a1e28 22%,
                  #4a5568 42%,
                  #2a3040 55%,
                  #12151c 78%,
                  #080a0e 100%)
              `,
              boxShadow: `4px 0 20px rgba(0,0,0,0.6), inset -2px 0 0 rgba(34,211,255,0.35)`,
            }}
          >
            <div
              style={{
                position: "absolute",
                right: 1,
                top: "14%",
                bottom: "20%",
                width: 2,
                background: `linear-gradient(180deg, transparent, ${CYAN}, transparent)`,
                boxShadow: `0 0 ${10 + pulse * 8}px ${CYAN}`,
              }}
            />
          </div>
          {/* RIGHT metal pillar */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 22,
              zIndex: 35,
              background: `
                linear-gradient(270deg,
                  #040508 0%,
                  #1a1e28 22%,
                  #4a5568 42%,
                  #2a3040 55%,
                  #12151c 78%,
                  #080a0e 100%)
              `,
              boxShadow: `-4px 0 20px rgba(0,0,0,0.6), inset 2px 0 0 rgba(255,62,92,0.4)`,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 1,
                top: "14%",
                bottom: "20%",
                width: 2,
                background: `linear-gradient(180deg, transparent, ${RED}, transparent)`,
                boxShadow: `0 0 ${10 + pulse * 8}px ${RED}`,
              }}
            />
          </div>

          {/* Header marquee plate */}
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 22,
              right: 22,
              height: 48,
              zIndex: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                "linear-gradient(180deg, #2a2e3a 0%, #141820 40%, #0c0e14 100%)",
              borderBottom: "1px solid rgba(255,62,92,0.35)",
              boxShadow:
                "0 8px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 6px rgba(0,0,0,0.4)",
            }}
          >
            <span
              style={{
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: "0.36em",
                color: RED,
                textShadow: `0 0 ${14 + pulse * 12}px rgba(255,37,68,0.95), 0 0 28px rgba(255,37,68,0.5)`,
              }}
            >
              FIATCLAW ARCADE
            </span>
            <div style={{ position: "absolute", right: 14, display: "flex", gap: 5 }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background:
                      i === 0 && busy ? CYAN : i === 1 && phase === "win" ? "#14F195" : RED,
                    boxShadow: "0 0 10px currentColor",
                    opacity: 0.4 + 0.6 * Math.sin(clock * 0.004 + i),
                  }}
                />
              ))}
            </div>
          </div>

          {/* ═══════ GLASS 3D CHAMBER ═══════ */}
          <div
            data-claw-chamber="glass3d"
            style={{
              position: "absolute",
              top: 66,
              left: 28,
              right: 28,
              bottom: 136,
              transformStyle: "preserve-3d",
              perspective: "900px",
              borderRadius: 16,
              overflow: "hidden",
              zIndex: 10,
              // glass body
              background: `
                linear-gradient(180deg,
                  rgba(40,55,75,0.35) 0%,
                  rgba(18,24,36,0.4) 30%,
                  rgba(8,10,16,0.55) 70%,
                  rgba(4,5,8,0.7) 100%)
              `,
              border: "1px solid rgba(34,211,255,0.32)",
              boxShadow: `
                inset 0 0 0 2px rgba(255,255,255,0.04),
                inset 0 0 0 6px rgba(0,0,0,0.12),
                inset 0 2px 0 rgba(255,255,255,0.16),
                inset 0 -30px 50px rgba(0,0,0,0.55),
                inset 0 0 60px rgba(34,211,255,0.06),
                0 0 40px rgba(34,211,255,0.1)
              `,
            }}
          >
            {/* Glass dark edge frame */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 16,
                border: "3px solid rgba(0,0,0,0.35)",
                pointerEvents: "none",
                zIndex: 30,
                boxShadow: "inset 0 0 20px rgba(0,0,0,0.4)",
              }}
            />

            {/* Diagonal specular glare */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: "-10%",
                left: "-5%",
                width: "55%",
                height: "70%",
                background:
                  "linear-gradient(125deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 28%, transparent 55%)",
                transform: `skewX(-8deg) translateX(${Math.sin(clock * 0.0003) * 6}px)`,
                pointerEvents: "none",
                zIndex: 28,
                mixBlendMode: "screen",
              }}
            />
            {/* Inner cyan reflection */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: "40%",
                height: "45%",
                background:
                  "linear-gradient(225deg, rgba(34,211,255,0.14) 0%, transparent 55%)",
                pointerEvents: "none",
                zIndex: 27,
              }}
            />

            {/* ── Perspective floor plane (deeper grid + fog) ── */}
            <div
              data-claw-floor
              style={{
                position: "absolute",
                left: "-20%",
                right: "-20%",
                bottom: "-12%",
                height: "62%",
                transformOrigin: "center bottom",
                transform: "rotateX(64deg) translateZ(-8px)",
                transformStyle: "preserve-3d",
                zIndex: 2,
                backgroundImage: `
                  linear-gradient(rgba(34,211,255,0.14) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255,62,92,0.08) 1px, transparent 1px),
                  linear-gradient(180deg,
                    rgba(12,14,22,0.15) 0%,
                    rgba(8,9,14,0.75) 35%,
                    rgba(4,5,8,0.95) 70%,
                    rgba(0,0,0,0.98) 100%)
                `,
                backgroundSize: "32px 32px, 32px 32px, 100% 100%",
                boxShadow:
                  "inset 0 40px 50px rgba(0,0,0,0.55), 0 -24px 48px rgba(0,0,0,0.4)",
              }}
            >
              {/* Contact shadow under claw track */}
              <div
                style={{
                  position: "absolute",
                  left: `${clawX - 8}%`,
                  top: "20%",
                  width: "16%",
                  height: "30%",
                  borderRadius: "50%",
                  background: "radial-gradient(ellipse, rgba(0,0,0,0.55), transparent 70%)",
                  filter: "blur(4px)",
                  transition: "left 0.2s ease-out",
                }}
              />
            </div>

            {/* Depth fog into chamber */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 3,
                background:
                  "linear-gradient(180deg, rgba(6,8,12,0.35) 0%, transparent 35%, transparent 55%, rgba(0,0,0,0.4) 100%)",
                pointerEvents: "none",
              }}
            />

            <canvas
              ref={fxRef}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 4,
                pointerEvents: "none",
                opacity: 0.9,
              }}
            />

            {/* Metal gantry rail (3D bar) */}
            <div
              style={{
                position: "absolute",
                top: 14,
                left: "6%",
                right: "6%",
                height: 14,
                zIndex: 12,
                transformStyle: "preserve-3d",
                borderRadius: 4,
                background:
                  "linear-gradient(180deg, #6a7388 0%, #3a4254 30%, #1a1e28 70%, #0a0c10 100%)",
                border: "1px solid rgba(34,211,255,0.45)",
                boxShadow: `
                  0 0 24px rgba(34,211,255,0.35),
                  inset 0 2px 0 rgba(255,255,255,0.4),
                  inset 0 -3px 4px rgba(0,0,0,0.6),
                  0 6px 12px rgba(0,0,0,0.5)
                `,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "5%",
                  right: "5%",
                  top: 4,
                  height: 3,
                  borderRadius: 1,
                  background: `linear-gradient(90deg, transparent, ${CYAN}, transparent)`,
                }}
              />
            </div>

            {/* ── Live 3D prizes on floor ── */}
            <div
              data-claw-prizes="spheres"
              style={{
                position: "absolute",
                bottom: 18,
                left: "6%",
                right: "6%",
                height: 90,
                zIndex: 8,
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-end",
                gap: 6,
                opacity: phase === "win" ? 0.35 : 1,
                transition: "opacity 0.7s",
                transformStyle: "preserve-3d",
                perspective: "600px",
              }}
            >
              {PRIZES.map((p, i) => {
                const bob = Math.sin(clock * 0.0019 + i * 0.85) * 3.5;
                return (
                  <div
                    key={i}
                    style={{
                      position: "relative",
                      width: p.size,
                      height: p.size,
                      flexShrink: 0,
                      transformStyle: "preserve-3d",
                      transform: `
                        translateY(${bob - p.lift}px)
                        rotateX(18deg)
                        rotateY(${p.ry + Math.sin(clock * 0.001 + i) * 8}deg)
                        translateZ(${p.z}px)
                      `,
                    }}
                  >
                    {/* soft contact shadow on floor */}
                    <div
                      style={{
                        position: "absolute",
                        left: "10%",
                        right: "10%",
                        bottom: -6,
                        height: 10,
                        borderRadius: "50%",
                        background: "radial-gradient(ellipse, rgba(0,0,0,0.55), transparent 70%)",
                        filter: "blur(2px)",
                        transform: "rotateX(70deg)",
                      }}
                    />
                    {/* Multi-layer sphere: core + rim light + specular + reflection band */}
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: p.capsule ? "42%" : "50%",
                        background: p.bg,
                        border: p.border,
                        boxShadow: `
                          ${p.glow},
                          inset -8px -10px 16px rgba(0,0,0,0.55),
                          inset 5px 6px 12px rgba(255,255,255,0.28),
                          0 10px 18px rgba(0,0,0,0.55),
                          0 0 0 1px rgba(255,255,255,0.06)
                        `,
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {/* primary specular */}
                      <div
                        style={{
                          position: "absolute",
                          top: "10%",
                          left: "16%",
                          width: "42%",
                          height: "32%",
                          borderRadius: "50%",
                          background:
                            "radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.15) 45%, transparent 70%)",
                          filter: "blur(0.4px)",
                        }}
                      />
                      {/* secondary reflection band */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: "18%",
                          right: "12%",
                          width: "28%",
                          height: "18%",
                          borderRadius: "50%",
                          background:
                            "radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%)",
                        }}
                      />
                      {/* equatorial sheen */}
                      <div
                        style={{
                          position: "absolute",
                          left: "8%",
                          right: "8%",
                          top: "48%",
                          height: "12%",
                          borderRadius: "50%",
                          background:
                            "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ═══════ 3D CLAW ASSEMBLY ═══════ */}
            <div
              data-claw-assembly="3d"
              style={{
                position: "absolute",
                left: `calc(${clawX}% + ${idleSway}px)`,
                top: clawDepth.top,
                transform: `translateX(-50%) translateZ(${clawDepth.z}px)`,
                transformStyle: "preserve-3d",
                transition: clawTransition,
                zIndex: 20,
                width: 100,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                filter: "drop-shadow(0 12px 18px rgba(0,0,0,0.65))",
              }}
            >
              {/* Rope */}
              <div
                style={{
                  width: 5,
                  height: phase === "drop" || phase === "close" ? 44 : 26,
                  borderRadius: 2,
                  background:
                    "linear-gradient(90deg, #3a4254, #d0d6e2 35%, #8a93a8 55%, #2a303c)",
                  boxShadow: `0 0 12px rgba(34,211,255,0.4), inset 1px 0 0 rgba(255,255,255,0.5)`,
                  transition: "height 1s cubic-bezier(0.4,0,0.2,1)",
                  transform: "translateZ(10px)",
                }}
              />

              {/* Carriage on rail */}
              <div
                style={{
                  width: 52,
                  height: 14,
                  marginTop: 1,
                  borderRadius: 3,
                  background:
                    "linear-gradient(180deg, #5a6578, #1a1e28 60%, #080a0e)",
                  border: "1px solid rgba(34,211,255,0.4)",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.25), 0 3px 6px rgba(0,0,0,0.5)",
                  transform: "translateZ(12px)",
                }}
              />

              {/* Motor block — 3D cuboid illusion */}
              <div
                style={{
                  width: 50,
                  height: 28,
                  marginTop: 2,
                  borderRadius: 8,
                  position: "relative",
                  transformStyle: "preserve-3d",
                  transform: "translateZ(16px) rotateX(-8deg)",
                  background:
                    "linear-gradient(160deg, #5a6578 0%, #2a3344 35%, #12151c 70%, #06080c 100%)",
                  border: "1px solid rgba(34,211,255,0.5)",
                  boxShadow: `
                    0 0 26px rgba(34,211,255,0.4),
                    inset 0 2px 0 rgba(255,255,255,0.3),
                    inset 0 -4px 8px rgba(0,0,0,0.55),
                    6px 6px 0 -1px rgba(0,0,0,0.35)
                  `,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 10,
                    right: 10,
                    height: 5,
                    borderRadius: 2,
                    background: `linear-gradient(90deg, ${RED}, ${CYAN}, ${RED})`,
                    opacity: 0.65 + pulse * 0.35,
                    boxShadow: `0 0 ${8 + pulse * 6}px ${CYAN}`,
                  }}
                />
              </div>

              {/* Fingers — jointed, thick, perspective open/close */}
              <div
                style={{
                  position: "relative",
                  width: 90,
                  height: 64,
                  marginTop: 4,
                  transformStyle: "preserve-3d",
                  transform: "translateZ(14px)",
                }}
              >
                {/* Left finger: upper + lower segment */}
                <div
                  style={{
                    position: "absolute",
                    left: fingersOpen ? 2 : 22,
                    top: 0,
                    width: 20,
                    height: 58,
                    transformOrigin: "top center",
                    transform: fingersOpen
                      ? "rotateZ(-32deg) rotateY(18deg)"
                      : "rotateZ(12deg) rotateY(8deg)",
                    transition:
                      "transform 0.45s cubic-bezier(0.34,1.3,0.64,1), left 0.45s ease",
                    transformStyle: "preserve-3d",
                  }}
                >
                  {/* upper arm */}
                  <div
                    style={{
                      width: 20,
                      height: 28,
                      borderRadius: "10px 6px 4px 4px",
                      background:
                        "linear-gradient(180deg, #f2f4f8 0%, #9aa3b5 40%, #4a5366 100%)",
                      border: "1px solid rgba(255,255,255,0.35)",
                      boxShadow:
                        "4px 0 0 rgba(0,0,0,0.28), inset 1px 0 0 rgba(255,255,255,0.45), 0 0 14px rgba(255,62,92,0.2)",
                    }}
                  />
                  {/* joint */}
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      margin: "-4px auto 0",
                      borderRadius: "50%",
                      background:
                        "radial-gradient(circle at 35% 30%, #8a93a8, #1a1e28)",
                      border: "1px solid rgba(34,211,255,0.35)",
                      boxShadow: "0 0 8px rgba(34,211,255,0.3)",
                    }}
                  />
                  {/* lower claw tip */}
                  <div
                    style={{
                      width: 16,
                      height: 26,
                      margin: "0 auto",
                      borderRadius: "4px 4px 12px 8px",
                      background:
                        "linear-gradient(180deg, #c0c6d4 0%, #5a6478 50%, #2a303c 100%)",
                      border: "1px solid rgba(255,255,255,0.25)",
                      boxShadow: "3px 0 0 rgba(0,0,0,0.25)",
                      transform: fingersOpen ? "rotateZ(-8deg)" : "rotateZ(6deg)",
                      transition: "transform 0.4s ease",
                    }}
                  />
                </div>

                {/* Right finger */}
                <div
                  style={{
                    position: "absolute",
                    right: fingersOpen ? 2 : 22,
                    top: 0,
                    width: 20,
                    height: 58,
                    transformOrigin: "top center",
                    transform: fingersOpen
                      ? "rotateZ(32deg) rotateY(-18deg)"
                      : "rotateZ(-12deg) rotateY(-8deg)",
                    transition:
                      "transform 0.45s cubic-bezier(0.34,1.3,0.64,1), right 0.45s ease",
                    transformStyle: "preserve-3d",
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 28,
                      borderRadius: "6px 10px 4px 4px",
                      background:
                        "linear-gradient(180deg, #f2f4f8 0%, #9aa3b5 40%, #4a5366 100%)",
                      border: "1px solid rgba(255,255,255,0.35)",
                      boxShadow:
                        "-4px 0 0 rgba(0,0,0,0.28), inset -1px 0 0 rgba(255,255,255,0.45), 0 0 14px rgba(255,62,92,0.2)",
                    }}
                  />
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      margin: "-4px auto 0",
                      borderRadius: "50%",
                      background:
                        "radial-gradient(circle at 35% 30%, #8a93a8, #1a1e28)",
                      border: "1px solid rgba(34,211,255,0.35)",
                    }}
                  />
                  <div
                    style={{
                      width: 16,
                      height: 26,
                      margin: "0 auto",
                      borderRadius: "4px 4px 8px 12px",
                      background:
                        "linear-gradient(180deg, #c0c6d4 0%, #5a6478 50%, #2a303c 100%)",
                      border: "1px solid rgba(255,255,255,0.25)",
                      boxShadow: "-3px 0 0 rgba(0,0,0,0.25)",
                      transform: fingersOpen ? "rotateZ(8deg)" : "rotateZ(-6deg)",
                      transition: "transform 0.4s ease",
                    }}
                  />
                </div>

                {/* Pivot hub */}
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: -4,
                    width: 18,
                    height: 18,
                    marginLeft: -9,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 32% 28%, #9aa3b5, #1a1e28 70%)",
                    border: "1px solid rgba(34,211,255,0.45)",
                    boxShadow: `0 0 14px rgba(34,211,255,0.4), inset 0 1px 0 rgba(255,255,255,0.3)`,
                    zIndex: 3,
                  }}
                />

                {/* Held prize */}
                {holdPrize && (
                  <div
                    data-claw-prize-held
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: 34,
                      width: 32,
                      height: 32,
                      marginLeft: -16,
                      borderRadius: "50%",
                      background:
                        "radial-gradient(circle at 30% 24%, #ffb0b8, #FF3E5C 40%, #8c0a1e 75%, #2a0408)",
                      border: "1.5px solid rgba(255,210,215,0.55)",
                      boxShadow:
                        "0 0 28px rgba(255,37,68,0.95), 0 0 56px rgba(255,37,68,0.5), inset -4px -6px 10px rgba(0,0,0,0.4), inset 3px 3px 8px rgba(255,255,255,0.3)",
                      animation:
                        phase === "win"
                          ? "fcPrizePulse 0.7s ease-in-out infinite"
                          : undefined,
                      zIndex: 2,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: "14%",
                        left: "18%",
                        width: "40%",
                        height: "30%",
                        borderRadius: "50%",
                        background:
                          "radial-gradient(circle, rgba(255,255,255,0.55), transparent 70%)",
                      }}
                    />
                  </div>
                )}

                {/* Slipping prize */}
                {slipPrize && (
                  <div
                    data-claw-prize-slip
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: 48,
                      width: 28,
                      height: 28,
                      marginLeft: -14,
                      borderRadius: "50%",
                      background:
                        "radial-gradient(circle at 30% 26%, #ff6a7c, #8c0a1e)",
                      boxShadow: "0 0 20px rgba(255,37,68,0.6)",
                      animation: "fcFall 0.85s cubic-bezier(0.4,0,0.55,1) forwards",
                    }}
                  />
                )}
              </div>
            </div>

            {/* SECURED / MISS */}
            {overlay === "SECURED" && (
              <div
                data-claw-overlay="secured"
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 40,
                  display: "grid",
                  placeItems: "center",
                  background: `
                    radial-gradient(circle at 50% 40%, rgba(255,37,68,0.4), transparent 60%),
                    radial-gradient(circle at 50% 50%, rgba(34,211,255,0.15), transparent 70%)
                  `,
                  animation: "fcFadeIn 0.3s ease",
                }}
              >
                <div
                  style={{
                    fontFamily: "Orbitron, sans-serif",
                    fontWeight: 700,
                    fontSize: 34,
                    letterSpacing: "0.24em",
                    color: "#fff",
                    textShadow: `0 0 32px ${RED}, 0 0 64px ${RED}, 0 0 16px ${CYAN}`,
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
                  zIndex: 40,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(0,0,0,0.38)",
                  animation: "fcFadeIn 0.3s ease",
                }}
              >
                <div
                  style={{
                    fontFamily: "Orbitron, sans-serif",
                    fontWeight: 600,
                    fontSize: 20,
                    letterSpacing: "0.26em",
                    color: "#9BA1AE",
                    textShadow: "0 0 20px rgba(0,0,0,0.9)",
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
                zIndex: 32,
                pointerEvents: "none",
                background: `
                  repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.028) 2px, rgba(0,0,0,0.028) 4px),
                  radial-gradient(ellipse 90% 85% at 50% 40%, transparent 40%, rgba(0,0,0,0.62) 100%)
                `,
              }}
            />
          </div>

          {/* ═══════ UNIFIED CONTROL DECK (one metal plate) ═══════ */}
          <div
            data-claw-controls="deck"
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 136,
              zIndex: 40,
              display: "flex",
              alignItems: "stretch",
              justifyContent: "space-between",
              padding: "14px 16px 16px",
              gap: 12,
              background: `
                linear-gradient(180deg,
                  #242836 0%,
                  #141820 28%,
                  #0c0e14 65%,
                  ${BG} 100%)
              `,
              borderTop: "1px solid rgba(255,62,92,0.35)",
              boxShadow: `
                0 -18px 44px rgba(0,0,0,0.55),
                inset 0 1px 0 rgba(255,255,255,0.1),
                inset 0 10px 20px rgba(0,0,0,0.35),
                inset 0 -1px 0 rgba(34,211,255,0.08)
              `,
            }}
          >
            {/* engraved panel rails */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 6,
                left: 18,
                right: 18,
                height: 2,
                borderRadius: 1,
                background: `linear-gradient(90deg, transparent, rgba(255,62,92,0.45), rgba(34,211,255,0.4), transparent)`,
                opacity: 0.7,
              }}
            />
            {/* Status plate */}
            <div
              data-claw-status={status}
              style={{
                minWidth: 100,
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.1)",
                background:
                  "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(16,18,24,0.95) 40%, #080a0e 100%)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.45), 0 0 20px rgba(255,37,68,0.08)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 9,
                  letterSpacing: "0.22em",
                  color: "#5c6478",
                  marginBottom: 6,
                }}
              >
                STATUS
              </div>
              <div
                style={{
                  fontFamily: "Orbitron, sans-serif",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  color: statusColor,
                  textShadow:
                    busy || phase === "win"
                      ? `0 0 14px ${statusColor}`
                      : undefined,
                }}
              >
                {status}
              </div>
            </div>

            {/* Joystick assembly */}
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
                  letterSpacing: "0.2em",
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
                  disabled={!joyOn}
                  onClick={() => move("left")}
                  style={arcadeBtn(joyOn, "cyan")}
                >
                  ←
                </button>

                {/* 3D stick */}
                <div
                  style={{
                    width: 48,
                    height: 52,
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background:
                        "radial-gradient(circle at 32% 28%, #5a6578, #12151c 65%, #040508)",
                      border: `2px solid rgba(34,211,255,${joyOn ? 0.55 : 0.25})`,
                      boxShadow: joyOn
                        ? `0 0 ${14 + pulse * 10}px rgba(34,211,255,0.55), inset 0 2px 6px rgba(255,255,255,0.15), 0 5px 0 #06080c`
                        : "inset 0 4px 10px rgba(0,0,0,0.65), 0 4px 0 #06080c",
                      position: "relative",
                      zIndex: 2,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: "18%",
                        left: "24%",
                        width: "40%",
                        height: "32%",
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.16)",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      width: 10,
                      height: 16,
                      marginTop: -4,
                      borderRadius: 3,
                      background:
                        "linear-gradient(180deg, #3a4254, #12151c 70%, #06080c)",
                      border: "1px solid rgba(0,0,0,0.5)",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
                      zIndex: 1,
                    }}
                  />
                </div>

                <button
                  type="button"
                  aria-label="Right"
                  data-claw-dir="right"
                  disabled={!joyOn}
                  onClick={() => move("right")}
                  style={arcadeBtn(joyOn, "cyan")}
                >
                  →
                </button>
              </div>
            </div>

            {/* PULL — large arcade plunger */}
            <button
              type="button"
              data-claw-action="pull"
              onClick={() => {
                if (disabled || busy) return;
                onDrop();
              }}
              disabled={disabled || busy}
              style={{
                minWidth: 124,
                padding: "18px 28px",
                borderRadius: 16,
                border: "1px solid rgba(255,140,155,0.55)",
                cursor: disabled || busy ? "not-allowed" : "pointer",
                color: "#fff",
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: "0.26em",
                background:
                  disabled || busy
                    ? "linear-gradient(180deg, #3a3e4a, #1a1c24)"
                    : `linear-gradient(180deg, #FF6A7E 0%, ${RED} 32%, #C4102A 68%, #7a0818 100%)`,
                boxShadow:
                  disabled || busy
                    ? "inset 0 2px 6px rgba(0,0,0,0.4)"
                    : `
                      0 0 44px rgba(255,37,68,0.7),
                      0 7px 0 #4a0610,
                      inset 0 2px 0 rgba(255,255,255,0.4),
                      inset 0 -5px 12px rgba(0,0,0,0.4)
                    `,
                opacity: disabled ? 0.45 : 1,
                transform: busy ? "translateY(4px)" : undefined,
                transition: "transform 0.12s, box-shadow 0.2s",
                textShadow: "0 2px 4px rgba(0,0,0,0.5)",
              }}
            >
              {busy ? "···" : "PULL"}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fcFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fcWinPop {
          0% { transform: scale(0.3) translateZ(0); opacity: 0; filter: blur(10px); }
          55% { transform: scale(1.12); }
          100% { transform: scale(1); opacity: 1; filter: blur(0); }
        }
        @keyframes fcPrizePulse {
          0%, 100% { box-shadow: 0 0 28px rgba(255,37,68,0.95), 0 0 56px rgba(255,37,68,0.5); }
          50% { box-shadow: 0 0 44px rgba(255,37,68,1), 0 0 80px rgba(255,37,68,0.7); }
        }
        @keyframes fcFall {
          0% { transform: translateY(0) scale(1); opacity: 0.95; }
          100% { transform: translateY(100px) scale(0.6); opacity: 0; }
        }
        @keyframes fcChassisShake {
          0%, 100% { transform: rotateX(6deg) rotateY(-2deg); }
          20% { transform: rotateX(6.5deg) rotateY(0.8deg) translateX(2px); }
          40% { transform: rotateX(5.5deg) rotateY(-3deg) translateX(-2px); }
          60% { transform: rotateX(6.2deg) rotateY(0.5deg) translateX(1px); }
          80% { transform: rotateX(5.8deg) rotateY(-2.5deg) translateX(-1px); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}

function arcadeBtn(active: boolean, _tone: "cyan" | "red"): CSSProperties {
  return {
    width: 48,
    height: 48,
    borderRadius: 14,
    border: "1px solid rgba(34,211,255,0.45)",
    background: active
      ? "linear-gradient(180deg, #2a4860 0%, #0e1822 55%, #060a10 100%)"
      : "linear-gradient(180deg, #2a2e38, #14161c)",
    color: CYAN,
    fontFamily: "Orbitron, sans-serif",
    fontSize: 18,
    fontWeight: 700,
    cursor: active ? "pointer" : "not-allowed",
    opacity: active ? 1 : 0.35,
    display: "grid",
    placeItems: "center",
    boxShadow: active
      ? "0 0 20px rgba(34,211,255,0.35), inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 0 #060a10"
      : "inset 0 2px 4px rgba(0,0,0,0.4)",
    transition: "transform 0.1s, box-shadow 0.2s",
  };
}

const PRIZES: {
  size: number;
  lift: number;
  ry: number;
  z: number;
  capsule: boolean;
  bg: string;
  border: string;
  glow: string;
}[] = [
  {
    size: 34,
    lift: 4,
    ry: -12,
    z: 8,
    capsule: false,
    bg: "radial-gradient(circle at 30% 25%, #6a7a90, #1a2030 55%, #080a10 85%)",
    border: "1.5px solid rgba(34,211,255,0.55)",
    glow: "0 0 18px rgba(34,211,255,0.4)",
  },
  {
    size: 40,
    lift: 10,
    ry: 10,
    z: 18,
    capsule: false,
    bg: "radial-gradient(circle at 30% 25%, #ff8a98, #FF3E5C 45%, #5a0810 80%)",
    border: "1.5px solid rgba(255,150,165,0.6)",
    glow: "0 0 22px rgba(255,37,68,0.55)",
  },
  {
    size: 30,
    lift: 2,
    ry: 22,
    z: 4,
    capsule: true,
    bg: "radial-gradient(circle at 30% 25%, #7a50b0, #2a1040 60%, #100818)",
    border: "1.5px solid rgba(153,69,255,0.55)",
    glow: "0 0 16px rgba(153,69,255,0.45)",
  },
  {
    size: 36,
    lift: 14,
    ry: -6,
    z: 22,
    capsule: false,
    bg: "radial-gradient(circle at 30% 25%, #4ad4ff, #0a3040 55%, #040e14)",
    border: "1.5px solid rgba(34,211,255,0.6)",
    glow: "0 0 20px rgba(34,211,255,0.5)",
  },
  {
    size: 32,
    lift: 6,
    ry: 16,
    z: 12,
    capsule: false,
    bg: "radial-gradient(circle at 30% 25%, #ffe08a, #c9a032 50%, #3a2800)",
    border: "1.5px solid rgba(255,194,75,0.55)",
    glow: "0 0 18px rgba(255,194,75,0.4)",
  },
  {
    size: 28,
    lift: 0,
    ry: -20,
    z: 2,
    capsule: true,
    bg: "radial-gradient(circle at 30% 25%, #5a6578, #12151c 65%, #06080c)",
    border: "1.5px solid rgba(34,211,255,0.35)",
    glow: "0 0 12px rgba(34,211,255,0.25)",
  },
  {
    size: 34,
    lift: 8,
    ry: 4,
    z: 14,
    capsule: false,
    bg: "radial-gradient(circle at 30% 25%, #ff6a7c, #8c0a1e 60%, #200408)",
    border: "1.5px solid rgba(255,62,92,0.55)",
    glow: "0 0 18px rgba(255,37,68,0.4)",
  },
  {
    size: 26,
    lift: 3,
    ry: 28,
    z: 6,
    capsule: true,
    bg: "radial-gradient(circle at 30% 25%, #3a90b0, #0a2030 60%, #040a10)",
    border: "1.5px solid rgba(34,211,255,0.4)",
    glow: "0 0 12px rgba(34,211,255,0.3)",
  },
];
