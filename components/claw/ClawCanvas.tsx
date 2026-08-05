"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { ClawScene } from "./ClawScene";
import type { ClawPhase } from "@/lib/game/claw-phases";

interface Props {
  phase: ClawPhase;
  clawX: number;
}

/** Cinematic vault camera — hero framing like etalon cylindrical chamber. */
export default function ClawCanvas({ phase, clawX }: Props) {
  return (
    <div
      data-claw-webgl="r3f"
      data-claw-style="crypto-vault-aaa"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background:
          "radial-gradient(ellipse 80% 70% at 50% 45%, #1a0820 0%, #050608 55%, #020304 100%)",
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
        camera={{ position: [0, 0.35, 7.4], fov: 32, near: 0.1, far: 60 }}
        style={{ width: "100%", height: "100%" }}
      >
        <Suspense fallback={null}>
          <ClawScene phase={phase} clawX={clawX} />
        </Suspense>
      </Canvas>
    </div>
  );
}
