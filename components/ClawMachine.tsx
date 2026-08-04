"use client";

import { useEffect, useRef, useState } from "react";

export type ClawPhase =
  | "idle"
  | "ready"
  | "drop"
  | "grab"
  | "pull"
  | "win"
  | "lose";

interface Props {
  phase: ClawPhase;
  onPull: () => void;
  disabled?: boolean;
}

/** Premium cyber-neon claw cabinet. Phases driven by parent. */
export function ClawMachine({ phase, onPull, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [clawX, setClawX] = useState(50);
  const isBusy = ["drop", "grab", "pull"].includes(phase);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const parts = Array.from({ length: 48 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.6,
      v: 0.00012 + Math.random() * 0.0004,
      o: 0.12 + Math.random() * 0.4,
      phase: Math.random() * Math.PI * 2,
      hue: Math.random() > 0.55 ? 0 : 190,
    }));

    const resize = () => {
      const r = c.parentElement?.getBoundingClientRect();
      if (!r) return;
      w = r.width;
      h = r.height;
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
      for (const p of parts) {
        p.y -= p.v;
        p.x += Math.sin(t * 0.0004 + p.phase) * 0.00015;
        if (p.y < -0.02) {
          p.y = 1.02;
          p.x = Math.random();
        }
        const color =
          p.hue === 0
            ? `rgba(255,55,90,${p.o})`
            : `rgba(34,211,255,${p.o * 0.85})`;
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    if (phase === "idle" || phase === "ready") setClawX(50);
    if (phase === "drop") setClawX(42 + Math.random() * 16);
  }, [phase]);

  const clawTop =
    phase === "idle" || phase === "ready"
      ? "8%"
      : phase === "drop"
        ? "58%"
        : phase === "grab"
          ? "58%"
          : phase === "pull" || phase === "win"
            ? "14%"
            : phase === "lose"
              ? "22%"
              : "8%";

  const clawOpen =
    phase === "drop" ||
    phase === "idle" ||
    phase === "ready" ||
    phase === "lose";
  const showPrize = phase === "grab" || phase === "pull" || phase === "win";
  const prizeHeld = phase === "pull" || phase === "win";

  const onPullClick = () => {
    if (disabled || isBusy) return;
    onPull();
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 440,
        margin: "0 auto",
        aspectRatio: "3 / 4",
        borderRadius: 22,
        overflow: "hidden",
        background:
          "linear-gradient(165deg, #0c0e14 0%, #12141c 40%, #0a0b10 100%)",
        border: "1px solid rgba(255,55,90,0.28)",
        boxShadow:
          "0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 60px rgba(255,37,68,0.12), 0 24px 48px rgba(0,0,0,0.55)",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)",
          pointerEvents: "none",
          zIndex: 6,
          opacity: 0.5,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 70% at 50% 40%, transparent 40%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
          zIndex: 5,
        }}
      />

      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, zIndex: 1, opacity: 0.7 }}
      />

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          zIndex: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(180deg, rgba(18,20,28,0.95), rgba(12,14,20,0.7))",
          borderBottom: "1px solid rgba(255,55,90,0.2)",
        }}
      >
        <span
          style={{
            fontFamily: "Orbitron, Inter, sans-serif",
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: "0.28em",
            color: "#FF3E5C",
            textShadow: "0 0 16px rgba(255,37,68,0.7)",
          }}
        >
          FIATCLAW ARCADE
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          top: 48,
          left: 14,
          right: 14,
          bottom: 88,
          borderRadius: 16,
          border: "1px solid rgba(34,211,255,0.12)",
          background:
            "linear-gradient(180deg, rgba(20,28,40,0.35), rgba(8,10,16,0.5))",
          boxShadow: "inset 0 0 40px rgba(34,211,255,0.04)",
          overflow: "hidden",
          zIndex: 2,
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: "8%",
            right: "8%",
            height: 56,
            display: "flex",
            justifyContent: "space-around",
            alignItems: "flex-end",
            opacity: phase === "win" ? 0.35 : 0.7,
            transition: "opacity 0.6s",
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                width: 28 + (i % 3) * 4,
                height: 28 + (i % 3) * 4,
                borderRadius: "50%",
                background:
                  i % 2 === 0
                    ? "radial-gradient(circle at 35% 30%, #2a2e3a, #0e1016 70%)"
                    : "radial-gradient(circle at 35% 30%, #3a1520, #12080c 70%)",
                border: `1.5px solid ${
                  i % 2 === 0
                    ? "rgba(34,211,255,0.35)"
                    : "rgba(255,55,90,0.4)"
                }`,
                boxShadow: `0 0 12px ${
                  i % 2 === 0
                    ? "rgba(34,211,255,0.2)"
                    : "rgba(255,37,68,0.25)"
                }`,
              }}
            />
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            top: 12,
            left: "10%",
            right: "10%",
            height: 4,
            borderRadius: 2,
            background:
              "linear-gradient(90deg, transparent, rgba(34,211,255,0.35), transparent)",
            zIndex: 3,
          }}
        />

        <div
          style={{
            position: "absolute",
            left: `${clawX}%`,
            top: clawTop,
            transform: "translateX(-50%)",
            transition:
              phase === "drop"
                ? "top 1.05s cubic-bezier(0.4, 0, 0.2, 1)"
                : phase === "pull" || phase === "win"
                  ? "top 1.15s cubic-bezier(0.22, 1, 0.36, 1)"
                  : phase === "lose"
                    ? "top 0.7s ease-in"
                    : "top 0.4s ease, left 0.5s ease",
            zIndex: 4,
            width: 72,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 2,
              height: 28,
              background:
                "linear-gradient(180deg, rgba(200,210,230,0.5), rgba(34,211,255,0.4))",
              boxShadow: "0 0 6px rgba(34,211,255,0.35)",
              marginBottom: -2,
            }}
          />
          <div
            style={{
              width: 36,
              height: 18,
              borderRadius: 6,
              background: "linear-gradient(180deg, #2a3040, #141820)",
              border: "1px solid rgba(34,211,255,0.35)",
              boxShadow: "0 0 14px rgba(34,211,255,0.25)",
            }}
          />
          <div
            style={{
              position: "relative",
              width: 64,
              height: 44,
              marginTop: 2,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: clawOpen ? 2 : 16,
                top: 0,
                width: 14,
                height: 40,
                borderRadius: "6px 4px 10px 4px",
                background:
                  "linear-gradient(180deg, #e8ecf4, #8a93a8 40%, #3a4254)",
                border: "1px solid rgba(255,255,255,0.25)",
                transform: clawOpen ? "rotate(-22deg)" : "rotate(8deg)",
                transformOrigin: "top center",
                transition: "transform 0.35s ease, left 0.35s ease",
                boxShadow: "0 0 10px rgba(255,55,90,0.2)",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: clawOpen ? 2 : 16,
                top: 0,
                width: 14,
                height: 40,
                borderRadius: "4px 6px 4px 10px",
                background:
                  "linear-gradient(180deg, #e8ecf4, #8a93a8 40%, #3a4254)",
                border: "1px solid rgba(255,255,255,0.25)",
                transform: clawOpen ? "rotate(22deg)" : "rotate(-8deg)",
                transformOrigin: "top center",
                transition: "transform 0.35s ease, right 0.35s ease",
                boxShadow: "0 0 10px rgba(255,55,90,0.2)",
              }}
            />
            {showPrize && prizeHeld && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: 28,
                  transform: "translateX(-50%)",
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle at 32% 28%, #ff6a7c, #c4102a 55%, #5a0812)",
                  border: "1.5px solid rgba(255,200,210,0.5)",
                  boxShadow:
                    "0 0 20px rgba(255,37,68,0.75), 0 0 40px rgba(255,37,68,0.35)",
                  animation:
                    phase === "win"
                      ? "fcPrizePulse 0.8s ease-in-out infinite"
                      : undefined,
                }}
              />
            )}
            {phase === "lose" && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: 50,
                  transform: "translateX(-50%)",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle at 32% 28%, #ff6a7c, #8c0a1e)",
                  opacity: 0.85,
                  animation: "fcFall 0.75s ease-in forwards",
                }}
              />
            )}
          </div>
        </div>

        {phase === "win" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 10,
              display: "grid",
              placeItems: "center",
              background:
                "radial-gradient(circle, rgba(255,37,68,0.18), transparent 65%)",
              animation: "fcFadeIn 0.35s ease",
            }}
          >
            <div
              style={{
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 700,
                fontSize: 28,
                letterSpacing: "0.18em",
                color: "#fff",
                textShadow:
                  "0 0 24px rgba(255,37,68,0.95), 0 0 48px rgba(255,37,68,0.5)",
                animation: "fcWinPop 0.5s cubic-bezier(0.22,1,0.36,1)",
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
              zIndex: 10,
              display: "grid",
              placeItems: "center",
              background: "rgba(0,0,0,0.25)",
              animation: "fcFadeIn 0.35s ease",
            }}
          >
            <div
              style={{
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 600,
                fontSize: 18,
                letterSpacing: "0.22em",
                color: "#9BA1AE",
              }}
            >
              MISS
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 88,
          zIndex: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          background:
            "linear-gradient(180deg, rgba(14,16,22,0.9), rgba(10,11,16,0.98))",
          borderTop: "1px solid rgba(255,55,90,0.15)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9,
              letterSpacing: "0.16em",
              color: "#5c6478",
            }}
          >
            STATUS
          </span>
          <span
            style={{
              fontFamily: "Orbitron, sans-serif",
              fontSize: 11,
              letterSpacing: "0.12em",
              color:
                phase === "win"
                  ? "#14F195"
                  : phase === "lose"
                    ? "#FF6B7A"
                    : isBusy
                      ? "#22D3FF"
                      : "#EDEEF2",
            }}
          >
            {phase === "idle" && "STANDBY"}
            {phase === "ready" && "ARMED"}
            {phase === "drop" && "DESCENDING"}
            {phase === "grab" && "LOCKING"}
            {phase === "pull" && "RETRACTING"}
            {phase === "win" && "PRIZE LOCKED"}
            {phase === "lose" && "NO CATCH"}
          </span>
        </div>

        <button
          type="button"
          onClick={onPullClick}
          disabled={disabled || isBusy}
          style={{
            padding: "14px 36px",
            borderRadius: 12,
            border: "1px solid rgba(255,120,140,0.45)",
            cursor: disabled || isBusy ? "not-allowed" : "pointer",
            color: "#fff",
            fontFamily: "Orbitron, Inter, sans-serif",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.22em",
            background:
              disabled || isBusy
                ? "rgba(70,74,88,0.45)"
                : "linear-gradient(180deg,#FF3E5C,#C4102A 55%,#8C0A1E)",
            boxShadow:
              disabled || isBusy
                ? "none"
                : "0 0 32px rgba(255,37,68,0.55), 0 4px 0 #5a0812",
            opacity: disabled ? 0.45 : 1,
          }}
        >
          {phase === "drop"
            ? "DROP"
            : phase === "grab"
              ? "GRAB"
              : phase === "pull"
                ? "···"
                : "PULL"}
        </button>
      </div>

      <style>{`
        @keyframes fcFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fcWinPop {
          0% { transform: scale(0.4); opacity: 0; }
          70% { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fcPrizePulse {
          0%, 100% { box-shadow: 0 0 20px rgba(255,37,68,0.75), 0 0 40px rgba(255,37,68,0.35); }
          50% { box-shadow: 0 0 32px rgba(255,37,68,1), 0 0 60px rgba(255,37,68,0.55); }
        }
        @keyframes fcFall {
          0% { transform: translateX(-50%) translateY(0); opacity: 0.9; }
          100% { transform: translateX(-50%) translateY(80px); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}
