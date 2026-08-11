"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { ClawScene } from "./ClawScene";
import type { ClawPhase } from "@/lib/game/claw-phases";

interface Props {
  phase: ClawPhase;
  clawX: number;
}

/**
 * Exterior-readable vault camera — front hero, slight elevation.
 * Premium industrial crypto vault framing (Mockup A).
 */
export default function ClawCanvas({ phase, clawX }: Props) {
  return (
    <div
      data-claw-webgl="r3f"
      data-claw-style="crypto-vault-glass-cylinder"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background:
          "radial-gradient(ellipse 72% 62% at 50% 42%, #1a0814 0%, #080a12 50%, #020306 100%)",
      }}
    >
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        camera={{ position: [0, 0.12, 6.5], fov: 33, near: 0.1, far: 60 }}
        style={{ width: "100%", height: "100%" }}
      >
        <Suspense fallback={null}>
          <ClawScene phase={phase} clawX={clawX} />
        </Suspense>
      </Canvas>
    </div>
  );
}
