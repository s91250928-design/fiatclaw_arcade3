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
 * Client-only WebGL canvas — camera framed for full cabinet face (machine ref),
 * not a zoomed-in low-poly chamber (photo 4).
 */
export default function ClawCanvas({ phase, clawX }: Props) {
  return (
    <div
      data-claw-webgl="r3f"
      data-claw-refs="machine+claw+prizes"
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 22,
        overflow: "hidden",
        background: "#050608",
      }}
    >
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        camera={{ position: [0, 0.05, 6.6], fov: 34, near: 0.1, far: 40 }}
        style={{ width: "100%", height: "100%" }}
      >
        <Suspense fallback={null}>
          <ClawScene phase={phase} clawX={clawX} />
        </Suspense>
      </Canvas>
    </div>
  );
}
