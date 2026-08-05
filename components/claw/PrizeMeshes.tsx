"use client";

/**
 * Prize visuals = camera-facing billboard sprites from public/refs.
 * No Sphere/Box/Icosahedron prize meshes. No Y-spin edge-on disappearance.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, useTexture } from "@react-three/drei";
import * as THREE from "three";
import {
  textureForKind,
  type MoneyPrizeKind,
  type PrizeVisualSpec,
} from "@/lib/game/prize-visuals";

/** Structural marker for tests — prizes are sprite billboards from /refs/. */
export const PRIZE_RENDER_MODE = "sprite-billboard-refs" as const;
/** Paths under public/refs (loaded via textureForKind / PRIZE_TEXTURES). */
export const PRIZE_REF_DIR = "/refs/" as const;

function PrizeBillboard({
  textureUrl,
  scale = 1,
}: {
  textureUrl: string;
  scale?: number;
}) {
  const map = useTexture(textureUrl);
  useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
  }, [map]);

  const s = 0.52 * scale;
  return (
    <Billboard follow lockX={false} lockY={false} lockZ={false}>
      <mesh renderOrder={1}>
        <planeGeometry args={[s, s]} />
        <meshBasicMaterial
          map={map}
          transparent
          alphaTest={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </Billboard>
  );
}

export function PrizeMeshByKind({
  kind,
  scale = 1,
}: {
  kind: MoneyPrizeKind | string;
  scale?: number;
}) {
  const url = textureForKind(kind as MoneyPrizeKind);
  return <PrizeBillboard textureUrl={url} scale={scale} />;
}

export function AnimatedPrize({
  spec,
  dim = 1,
}: {
  spec: PrizeVisualSpec;
  dim?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!ref.current) return;
    const t = s.clock.elapsedTime;
    const baseY = spec.position[1];
    // Idle bob only — never spin Y (billboards stay face-camera)
    if (spec.bob) {
      ref.current.position.y =
        baseY + Math.sin(t * 1.05 + spec.seed * 0.15) * 0.014;
    }
  });

  const url = spec.texture || textureForKind(spec.kind);

  return (
    <group
      ref={ref}
      position={[spec.position[0], spec.position[1], spec.position[2]]}
      scale={dim}
      userData={{ prizeRender: PRIZE_RENDER_MODE, kind: spec.kind }}
    >
      <PrizeBillboard textureUrl={url} scale={spec.scale} />
    </group>
  );
}
