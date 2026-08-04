"use client";

/**
 * Arcade-grade money prizes for the claw chamber.
 * $FIATCLAW coins, SOL crystals/bars, multi-color faceted gems, jackpot hex.
 * Not generic single-diamond primitives.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MoneyPrizeKind, PrizeVisualSpec } from "@/lib/game/prize-visuals";

const RED = "#FF3E5C";
const CYAN = "#22D3FF";
const GOLD = "#FFC24B";
const PURPLE = "#9945FF";
const SOL_GREEN = "#14F195";
const BLACK = "#0a0b10";

/** Multi-part faceted gem: dual octa + dodeca crown + glow core */
function FacetedGem({
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
      {/* Main body — higher-detail octa */}
      <mesh castShadow position={[0, 0.09, 0]} rotation={[0.15, Math.PI / 5, 0.08]}>
        <octahedronGeometry args={[0.1, 1]} />
        <meshStandardMaterial
          color={color}
          metalness={0.45}
          roughness={0.08}
          emissive={emissive}
          emissiveIntensity={0.4}
          flatShading
        />
      </mesh>
      {/* Pavilion (lower) */}
      <mesh castShadow position={[0, 0.02, 0]} rotation={[0, Math.PI / 7, 0]} scale={[0.75, 0.55, 0.75]}>
        <octahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial
          color={color}
          metalness={0.5}
          roughness={0.1}
          emissive={emissive}
          emissiveIntensity={0.25}
          flatShading
        />
      </mesh>
      {/* Table / crown */}
      <mesh castShadow position={[0, 0.155, 0]} scale={[0.5, 0.28, 0.5]}>
        <dodecahedronGeometry args={[0.09, 0]} />
        <meshStandardMaterial
          color={color}
          metalness={0.55}
          roughness={0.06}
          emissive={emissive}
          emissiveIntensity={0.3}
          flatShading
        />
      </mesh>
      {/* Internal glow */}
      <mesh position={[0, 0.09, 0]}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshStandardMaterial
          color={emissive}
          emissive={emissive}
          emissiveIntensity={2}
          toneMapped={false}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Specular catch light (tiny plane) */}
      <mesh position={[0.03, 0.14, 0.04]} rotation={[-0.5, 0.4, 0]}>
        <planeGeometry args={[0.04, 0.025]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.45} />
      </mesh>
    </group>
  );
}

/** Volumetric $FIATCLAW coin — black/red, embossed claw mark */
function FiatClawToken({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[1.15, 0.2, 0.15]}>
      {/* Thick rim cylinder */}
      <mesh castShadow>
        <cylinderGeometry args={[0.115, 0.115, 0.042, 48]} />
        <meshStandardMaterial
          color={BLACK}
          metalness={0.9}
          roughness={0.22}
          emissive={RED}
          emissiveIntensity={0.12}
        />
      </mesh>
      {/* Beveled outer lip */}
      <mesh position={[0, 0.022, 0]}>
        <cylinderGeometry args={[0.118, 0.112, 0.01, 48]} />
        <meshStandardMaterial color="#1a0a10" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Neon torus edge */}
      <mesh position={[0, 0.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.112, 0.01, 10, 48]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.8}
          toneMapped={false}
        />
      </mesh>
      {/* Face plate */}
      <mesh position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.095, 48]} />
        <meshStandardMaterial color="#0e0608" metalness={0.75} roughness={0.3} />
      </mesh>
      {/* Inner ring */}
      <mesh position={[0, 0.024, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.07, 0.082, 40]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={0.9}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Embossed claw: three prongs + base */}
      <group position={[0, 0.028, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        {/* Base bar */}
        <mesh position={[0, -0.02, 0.002]}>
          <boxGeometry args={[0.07, 0.016, 0.008]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.3}
            toneMapped={false}
          />
        </mesh>
        {/* Left prong */}
        <mesh position={[-0.025, 0.015, 0.002]} rotation={[0, 0, 0.35]}>
          <boxGeometry args={[0.014, 0.055, 0.008]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.25}
            toneMapped={false}
          />
        </mesh>
        {/* Center prong */}
        <mesh position={[0, 0.02, 0.002]}>
          <boxGeometry args={[0.016, 0.06, 0.008]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.35}
            toneMapped={false}
          />
        </mesh>
        {/* Right prong */}
        <mesh position={[0.025, 0.015, 0.002]} rotation={[0, 0, -0.35]}>
          <boxGeometry args={[0.014, 0.055, 0.008]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.25}
            toneMapped={false}
          />
        </mesh>
        {/* Cyan tip accent */}
        <mesh position={[0, 0.048, 0.003]}>
          <sphereGeometry args={[0.01, 10, 10]} />
          <meshStandardMaterial
            color={CYAN}
            emissive={CYAN}
            emissiveIntensity={1.5}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

/** Solana-readable crystal (green + purple) */
function SolCrystal({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh castShadow position={[0, 0.1, 0]} rotation={[0.25, 0.6, 0.1]}>
        <icosahedronGeometry args={[0.1, 1]} />
        <meshStandardMaterial
          color={SOL_GREEN}
          metalness={0.5}
          roughness={0.12}
          emissive={CYAN}
          emissiveIntensity={0.35}
          flatShading
        />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[0.25, 0.6, 0.1]}>
        <icosahedronGeometry args={[0.045, 0]} />
        <meshStandardMaterial
          color={PURPLE}
          emissive={PURPLE}
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
      {/* Solana “blade” accent */}
      <mesh position={[0.04, 0.12, 0.04]} rotation={[0.5, 0.2, 0.8]}>
        <boxGeometry args={[0.02, 0.08, 0.012]} />
        <meshStandardMaterial
          color={PURPLE}
          metalness={0.8}
          roughness={0.15}
          emissive={PURPLE}
          emissiveIntensity={0.6}
        />
      </mesh>
    </group>
  );
}

/** SOL ingot / bar with chamfers */
function SolBar({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0, 0.45, 0.08]}>
      <mesh castShadow position={[0, 0.045, 0]}>
        <boxGeometry args={[0.17, 0.055, 0.085]} />
        <meshStandardMaterial
          color={PURPLE}
          metalness={0.92}
          roughness={0.18}
          emissive={SOL_GREEN}
          emissiveIntensity={0.18}
        />
      </mesh>
      {/* Top chamfer face */}
      <mesh position={[0, 0.078, 0]}>
        <boxGeometry args={[0.15, 0.018, 0.07]} />
        <meshStandardMaterial
          color="#c4b5fd"
          metalness={0.88}
          roughness={0.14}
          emissive={CYAN}
          emissiveIntensity={0.2}
        />
      </mesh>
      {/* Side neon rails */}
      <mesh position={[0, 0.045, 0.045]}>
        <boxGeometry args={[0.16, 0.01, 0.01]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0.045, -0.045]}>
        <boxGeometry args={[0.16, 0.01, 0.01]} />
        <meshStandardMaterial
          color={SOL_GREEN}
          emissive={SOL_GREEN}
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function NeonCapsule({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0.35, 0.25, 0.55]}>
      <mesh castShadow>
        <capsuleGeometry args={[0.048, 0.1, 8, 16]} />
        <meshStandardMaterial
          color="#061820"
          metalness={0.75}
          roughness={0.2}
          emissive={CYAN}
          emissiveIntensity={0.4}
        />
      </mesh>
      {/* Solana gradient band */}
      <mesh>
        <capsuleGeometry args={[0.05, 0.1, 4, 16]} />
        <meshStandardMaterial
          color={PURPLE}
          emissive={PURPLE}
          emissiveIntensity={0.7}
          transparent
          opacity={0.35}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0.07, 0]}>
        <torusGeometry args={[0.05, 0.006, 8, 20]} />
        <meshStandardMaterial
          color={SOL_GREEN}
          emissive={SOL_GREEN}
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
        <cylinderGeometry args={[0.115, 0.115, 0.075, 6]} />
        <meshStandardMaterial
          color="#14060a"
          metalness={0.85}
          roughness={0.2}
          emissive={RED}
          emissiveIntensity={0.45}
          flatShading
        />
      </mesh>
      <mesh position={[0, 0.112, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.02, 6]} />
        <meshStandardMaterial
          color={GOLD}
          metalness={0.9}
          roughness={0.15}
          emissive={GOLD}
          emissiveIntensity={0.8}
          toneMapped={false}
          flatShading
        />
      </mesh>
      <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.118, 0.012, 6, 6]} />
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

export function PrizeMeshByKind({
  kind,
  scale = 1,
}: {
  kind: MoneyPrizeKind | "crystal";
  scale?: number;
}) {
  // legacy "crystal" alias
  if (kind === "crystal" || kind === "crystal_red") {
    return <FacetedGem color={RED} emissive={RED} scale={scale} />;
  }
  switch (kind) {
    case "crystal_cyan":
      return <FacetedGem color={CYAN} emissive={CYAN} scale={scale} />;
    case "crystal_purple":
      return <FacetedGem color={PURPLE} emissive={PURPLE} scale={scale} />;
    case "crystal_gold":
      return <FacetedGem color={GOLD} emissive={GOLD} scale={scale} />;
    case "fiatclaw_token":
      return <FiatClawToken scale={scale} />;
    case "sol_bar":
      return <SolBar scale={scale} />;
    case "sol_crystal":
      return <SolCrystal scale={scale} />;
    case "neon_capsule":
      return <NeonCapsule scale={scale} />;
    case "jackpot_hex":
      return <JackpotHex scale={scale} />;
    default:
      return <FacetedGem color={RED} emissive={RED} scale={scale} />;
  }
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
        baseY + Math.sin(t * 1.25 + spec.seed * 0.17) * 0.02;
    }
    if (spec.spin) {
      ref.current.rotation.y = t * (0.28 + (spec.seed % 7) * 0.04) + spec.seed;
      if (spec.kind === "fiatclaw_token") {
        ref.current.rotation.x = 1.1 + Math.sin(t * 0.6 + spec.seed) * 0.08;
      }
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

/** Shared materials for metal claw parts */
export function useMetalMat() {
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c5ccd8",
        metalness: 0.92,
        roughness: 0.22,
      }),
    []
  );
}
