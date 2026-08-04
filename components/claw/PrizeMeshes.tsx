"use client";

/**
 * Professional money-shaped R3F prize meshes for the claw chamber.
 * Crystals, $FIATCLAW tokens, SOL bars/crystals, neon capsules, jackpot hex.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MoneyPrizeKind, PrizeVisualSpec } from "@/lib/game/prize-visuals";

const RED = "#FF3E5C";
const CYAN = "#22D3FF";
const GOLD = "#FFC24B";
const BLACK = "#0a0b10";

function Crystal({
  color,
  emissive,
  scale = 1,
}: {
  color: string;
  emissive: string;
  scale?: number;
}) {
  return (
    <group scale={scale}>
      {/* Faceted gem body */}
      <mesh castShadow position={[0, 0.08, 0]} rotation={[0, Math.PI / 5, 0]}>
        <octahedronGeometry args={[0.11, 0]} />
        <meshStandardMaterial
          color={color}
          metalness={0.35}
          roughness={0.12}
          emissive={emissive}
          emissiveIntensity={0.35}
          flatShading
        />
      </mesh>
      {/* Inner glow core */}
      <mesh position={[0, 0.08, 0]}>
        <octahedronGeometry args={[0.045, 0]} />
        <meshStandardMaterial
          color={emissive}
          emissive={emissive}
          emissiveIntensity={1.4}
          toneMapped={false}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Crown facets */}
      <mesh castShadow position={[0, 0.16, 0]} scale={[0.55, 0.4, 0.55]}>
        <octahedronGeometry args={[0.08, 0]} />
        <meshStandardMaterial
          color={color}
          metalness={0.4}
          roughness={0.1}
          emissive={emissive}
          emissiveIntensity={0.2}
          flatShading
        />
      </mesh>
    </group>
  );
}

function FiatClawToken({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[Math.PI / 2.4, 0, 0.3]}>
      {/* Coin rim */}
      <mesh castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.035, 32]} />
        <meshStandardMaterial
          color={BLACK}
          metalness={0.85}
          roughness={0.28}
          emissive={RED}
          emissiveIntensity={0.15}
        />
      </mesh>
      {/* Outer neon ring */}
      <mesh position={[0, 0.019, 0]}>
        <torusGeometry args={[0.1, 0.008, 8, 40]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>
      {/* Face disc */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.085, 32]} />
        <meshStandardMaterial
          color="#120810"
          metalness={0.7}
          roughness={0.35}
        />
      </mesh>
      {/* Claw / F mark — simple extruded bars forming "F" + claw hook */}
      <mesh position={[-0.02, 0.025, 0.01]}>
        <boxGeometry args={[0.02, 0.01, 0.07]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0.015, 0.025, 0.028]}>
        <boxGeometry args={[0.045, 0.01, 0.018]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0.01, 0.025, 0]}>
        <boxGeometry args={[0.035, 0.01, 0.016]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.1}
          toneMapped={false}
        />
      </mesh>
      {/* Tiny claw tip */}
      <mesh position={[0.04, 0.025, -0.02]} rotation={[0, 0, 0.6]}>
        <boxGeometry args={[0.03, 0.01, 0.012]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={0.9}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function SolBar({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh castShadow position={[0, 0.05, 0]} rotation={[0, 0.4, 0]}>
        <boxGeometry args={[0.16, 0.06, 0.08]} />
        <meshStandardMaterial
          color="#9945FF"
          metalness={0.9}
          roughness={0.2}
          emissive="#14F195"
          emissiveIntensity={0.2}
        />
      </mesh>
      {/* Ingot chamfer top */}
      <mesh position={[0, 0.085, 0]} rotation={[0, 0.4, 0]}>
        <boxGeometry args={[0.14, 0.02, 0.065]} />
        <meshStandardMaterial
          color="#c4b5fd"
          metalness={0.85}
          roughness={0.18}
          emissive={CYAN}
          emissiveIntensity={0.15}
        />
      </mesh>
      {/* Neon edge lines */}
      <mesh position={[0, 0.05, 0.042]} rotation={[0, 0.4, 0]}>
        <boxGeometry args={[0.15, 0.008, 0.008]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function SolCrystal({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh castShadow position={[0, 0.09, 0]} rotation={[0.2, 0.5, 0.1]}>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial
          color="#14F195"
          metalness={0.45}
          roughness={0.15}
          emissive={CYAN}
          emissiveIntensity={0.4}
          flatShading
        />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <icosahedronGeometry args={[0.04, 0]} />
        <meshStandardMaterial
          color="#9945FF"
          emissive="#9945FF"
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function NeonCapsule({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0.3, 0.2, 0.5]}>
      <mesh castShadow>
        <capsuleGeometry args={[0.05, 0.1, 6, 12]} />
        <meshStandardMaterial
          color="#0a2030"
          metalness={0.7}
          roughness={0.25}
          emissive={CYAN}
          emissiveIntensity={0.35}
        />
      </mesh>
      <mesh>
        <capsuleGeometry args={[0.052, 0.1, 4, 12]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={0.8}
          toneMapped={false}
          transparent
          opacity={0.25}
          wireframe
        />
      </mesh>
    </group>
  );
}

function GoldCrystal({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh castShadow position={[0, 0.1, 0]} rotation={[0, Math.PI / 6, 0]}>
        <octahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial
          color={GOLD}
          metalness={0.95}
          roughness={0.12}
          emissive={GOLD}
          emissiveIntensity={0.45}
          flatShading
        />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <octahedronGeometry args={[0.05, 0]} />
        <meshStandardMaterial
          color="#fff3c4"
          emissive={GOLD}
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function JackpotHex({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh castShadow position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.07, 6]} />
        <meshStandardMaterial
          color="#1a0a10"
          metalness={0.8}
          roughness={0.25}
          emissive={RED}
          emissiveIntensity={0.4}
          flatShading
        />
      </mesh>
      <mesh position={[0, 0.11, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.02, 6]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.3}
          toneMapped={false}
          flatShading
        />
      </mesh>
      {/* Cyan rim */}
      <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.115, 0.01, 6, 6]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function PrizeMeshByKind({
  kind,
  scale = 1,
}: {
  kind: MoneyPrizeKind;
  scale?: number;
}) {
  switch (kind) {
    case "fiatclaw_token":
      return <FiatClawToken scale={scale} />;
    case "sol_bar":
      return <SolBar scale={scale} />;
    case "sol_crystal":
      return <SolCrystal scale={scale} />;
    case "neon_capsule":
      return <NeonCapsule scale={scale} />;
    case "gold_crystal":
      return <GoldCrystal scale={scale} />;
    case "jackpot_hex":
      return <JackpotHex scale={scale} />;
    case "crystal":
    default:
      return (
        <Crystal
          color={RED}
          emissive={RED}
          scale={scale}
        />
      );
  }
}

/** Single pile item with idle bob/spin. */
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
        baseY + Math.sin(t * 1.3 + spec.seed * 0.2) * 0.018;
    }
    if (spec.spin) {
      ref.current.rotation.y = t * (0.35 + (spec.seed % 5) * 0.05) + spec.seed;
    }
  });

  return (
    <group
      ref={ref}
      position={[spec.position[0], spec.position[1], spec.position[2]]}
      scale={dim}
    >
      <PrizeMeshByKind kind={spec.kind} scale={spec.scale} />
    </group>
  );
}
