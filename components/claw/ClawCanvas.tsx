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
 * Full industrial vault camera — machine dominates the frame.
 * Rectangular titanium vault (not arcade cylinder).
 */
export default function ClawCanvas({ phase, clawX }: Props) {
  return (
    <div
      data-claw-webgl="r3f"
      data-claw-style="industrial-rect-vault"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background:
          "radial-gradient(ellipse 70% 58% at 50% 40%, #140810 0%, #06080e 48%, #010204 100%)",
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
        camera={{ position: [0, 0.22, 7.25], fov: 35, near: 0.1, far: 60 }}
        style={{ width: "100%", height: "100%" }}
      >
        <Suspense fallback={null}>
          <ClawScene phase={phase} clawX={clawX} />
        </Suspense>
      </Canvas>
    </div>
  );
}
