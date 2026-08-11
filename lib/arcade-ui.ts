/**
 * Shared arcade UI theme (lobby + game). No gameplay logic.
 */
import type { CSSProperties } from "react";

export const RED = "#FF3E5C";
export const CYAN = "#22D3FF";
export const MUTED = "#8B93A7";
export const DIM = "#4A5568";

export const panelStyle: CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background:
    "linear-gradient(165deg, rgba(255,255,255,0.05), rgba(8,10,14,0.92))",
  boxShadow: "0 12px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
  padding: "14px 16px",
};

export const labelStyle: CSSProperties = {
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 9,
  letterSpacing: "0.2em",
  color: DIM,
  margin: 0,
};

export const valueStyle: CSSProperties = {
  fontFamily: "Orbitron, sans-serif",
  fontSize: 15,
  fontWeight: 700,
  color: "#EDEEF2",
  margin: "6px 0 0",
};

export function ctaStyle(off: boolean): CSSProperties {
  return {
    flex: 1,
    padding: "11px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,120,140,0.45)",
    cursor: off ? "not-allowed" : "pointer",
    color: "#fff",
    fontFamily: "Orbitron, sans-serif",
    fontWeight: 800,
    fontSize: 10,
    letterSpacing: "0.12em",
    background: off
      ? "rgba(70,74,88,0.45)"
      : "linear-gradient(180deg,#FF3E5C,#C4102A 62%,#8C0A1E)",
    boxShadow: off ? "none" : "0 0 20px rgba(255,37,68,0.35)",
    opacity: off ? 0.55 : 1,
  };
}

export function ctaGhostStyle(off: boolean): CSSProperties {
  return {
    flex: 1,
    padding: "11px 12px",
    borderRadius: 10,
    border: "1px solid rgba(34,211,255,0.35)",
    cursor: off ? "not-allowed" : "pointer",
    color: CYAN,
    fontFamily: "Orbitron, sans-serif",
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: "0.12em",
    background:
      "linear-gradient(180deg, rgba(20,36,48,0.95), rgba(8,12,18,0.98))",
    opacity: off ? 0.55 : 1,
  };
}

export function dpadBtnStyle(on: boolean): CSSProperties {
  return {
    width: 48,
    height: 48,
    borderRadius: 10,
    border: `1px solid ${on ? "rgba(255,62,92,0.5)" : "rgba(80,90,110,0.35)"}`,
    background: on
      ? "linear-gradient(180deg, #2a1820, #12080c)"
      : "linear-gradient(180deg, #1a1e28, #0c0e14)",
    color: on ? RED : MUTED,
    fontFamily: "Orbitron, sans-serif",
    fontSize: 16,
    fontWeight: 700,
    cursor: on ? "pointer" : "not-allowed",
    opacity: on ? 1 : 0.4,
    display: "grid",
    placeItems: "center",
  };
}

export const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap";
