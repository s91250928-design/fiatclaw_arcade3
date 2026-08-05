"use client";

/**
 * Prize visuals = textured billboard sprites from public/refs only.
 * Textures: /refs/fiatclaw-token.png, /refs/crystal.png, /refs/sol-token.png
 * No Sphere / Box / Icosahedron prize meshes.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import {
  textureForKind,
  type MoneyPrizeKind,
  type PrizeVisualSpec,
} from "@/lib/game/prize-visuals";

/** Structural marker for tests — prizes are sprite billboards. */
export const PRIZE_RENDER_MODE = "sprite-billboard-refs" as const;

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

  const s = 0.22 * scale;
  return (
    <mesh castShadow>
      <planeGeometry args={[s, s]} />
      <meshStandardMaterial
        map={map}
        transparent
        alphaTest={0.12}
        roughness={0.35}
        metalness={0.35}
        emissive="#1a0a10"
        emissiveIntensity={0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
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
    if (spec.bob) {
      ref.current.position.y =
        baseY + Math.sin(t * 1.1 + spec.seed * 0.15) * 0.016;
    }
    // Face camera-ish with gentle spin on Y
    if (spec.spin) {
      ref.current.rotation.y = t * (0.2 + (spec.seed % 5) * 0.03) + spec.seed * 0.1;
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
