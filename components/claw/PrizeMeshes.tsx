"use client";

/**
 * Premium crypto collectibles — gunmetal / dark chrome / black metal.
 * No bright toy palette. Red neon + cyan + deep purple accents only.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MoneyPrizeKind, PrizeVisualSpec } from "@/lib/game/prize-visuals";

const RED = "#FF3E5C";
const CYAN = "#22D3FF";
const PURPLE = "#7B3FE4";
const GUNMETAL = "#2a2e36";
const CHROME = "#8a919e";
const BLACK = "#0a0b0e";
const CARBON = "#12141a";

function matMetal(
  color: string,
  metalness = 0.92,
  roughness = 0.22,
  emissive?: string,
  ei = 0
) {
  return (
    <meshStandardMaterial
      color={color}
      metalness={metalness}
      roughness={roughness}
      emissive={emissive ?? "#000000"}
      emissiveIntensity={ei}
      toneMapped={emissive ? false : true}
    />
  );
}

/** Black $FIATCLAW coin with red 3-blade emboss */
function FiatClawToken({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[1.2, 0.15, 0.1]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.038, 48]} />
        {matMetal(BLACK, 0.95, 0.18, RED, 0.08)}
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.118, 0.008, 10, 48]} />
        {matMetal(RED, 0.6, 0.2, RED, 1.8)}
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.1, 48]} />
        {matMetal("#0c0e12", 0.88, 0.25)}
      </mesh>
      <group position={[0, 0.026, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh position={[0, -0.018, 0.002]}>
          <boxGeometry args={[0.065, 0.014, 0.006]} />
          {matMetal(RED, 0.5, 0.15, RED, 1.6)}
        </mesh>
        {([-0.022, 0, 0.022] as const).map((px, i) => (
          <mesh
            key={i}
            position={[px, 0.018, 0.002]}
            rotation={[0, 0, px * -12]}
          >
            <boxGeometry args={[0.012, 0.05, 0.006]} />
            {matMetal(RED, 0.5, 0.15, RED, 1.5)}
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Dark SOL disc — purple/cyan metal, not toy green */
function SolToken({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[1.1, -0.2, 0.05]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.105, 0.105, 0.036, 40]} />
        {matMetal("#12081c", 0.92, 0.2, PURPLE, 0.25)}
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.102, 0.007, 8, 40]} />
        {matMetal(CYAN, 0.7, 0.18, CYAN, 1.4)}
      </mesh>
      <group position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0.3]}>
        {[0.026, 0, -0.026].map((py, i) => (
          <mesh key={i} position={[0, py, 0.002]}>
            <boxGeometry args={[0.065, 0.015, 0.006]} />
            {matMetal(i === 1 ? PURPLE : CYAN, 0.6, 0.15, i === 1 ? PURPLE : CYAN, 1.5)}
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Premium NFT capsule — dark glass + metal bands */
function NftCapsule({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0.4, 0.3, 0.5]}>
      <mesh castShadow>
        <capsuleGeometry args={[0.045, 0.09, 8, 16]} />
        <meshPhysicalMaterial
          color="#0a1018"
          metalness={0.35}
          roughness={0.12}
          transmission={0.35}
          thickness={0.4}
          transparent
          opacity={0.85}
          emissive={CYAN}
          emissiveIntensity={0.2}
        />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <torusGeometry args={[0.046, 0.006, 8, 20]} />
        {matMetal(CHROME, 0.95, 0.15, CYAN, 0.8)}
      </mesh>
      <mesh position={[0, -0.05, 0]}>
        <torusGeometry args={[0.046, 0.006, 8, 20]} />
        {matMetal(GUNMETAL, 0.9, 0.2, RED, 0.5)}
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.02, 0.04, 0.02]} />
        {matMetal(PURPLE, 0.7, 0.2, PURPLE, 1.2)}
      </mesh>
    </group>
  );
}

/** Mystery crate — carbon-black crate with red seal */
function MysteryCrate({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0, 0.4, 0.05]}>
      <mesh castShadow position={[0, 0.055, 0]}>
        <boxGeometry args={[0.14, 0.1, 0.12]} />
        {matMetal(CARBON, 0.75, 0.4)}
      </mesh>
      <mesh position={[0, 0.108, 0]}>
        <boxGeometry args={[0.145, 0.012, 0.125]} />
        {matMetal(GUNMETAL, 0.9, 0.25)}
      </mesh>
      <mesh position={[0, 0.055, 0.062]}>
        <boxGeometry args={[0.08, 0.02, 0.008]} />
        {matMetal(RED, 0.5, 0.2, RED, 1.4)}
      </mesh>
      <mesh position={[0, 0.055, 0.065]}>
        <boxGeometry args={[0.04, 0.04, 0.006]} />
        {matMetal("#0e0e12", 0.85, 0.3, PURPLE, 0.4)}
      </mesh>
      {/* Corner rivets */}
      {([-0.055, 0.055] as const).map((rx) =>
        ([-0.04, 0.04] as const).map((rz) => (
          <mesh key={`${rx}${rz}`} position={[rx, 0.1, rz]}>
            <sphereGeometry args={[0.008, 8, 8]} />
            {matMetal(CHROME, 0.95, 0.15)}
          </mesh>
        ))
      )}
    </group>
  );
}

/** Crypto vault box — dark chrome safe */
function VaultBox({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0, -0.35, 0]}>
      <mesh castShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[0.15, 0.09, 0.11]} />
        {matMetal("#1a1e26", 0.94, 0.2)}
      </mesh>
      <mesh position={[0, 0.05, 0.056]}>
        <boxGeometry args={[0.1, 0.06, 0.008]} />
        {matMetal(GUNMETAL, 0.9, 0.22)}
      </mesh>
      <mesh position={[0.02, 0.05, 0.062]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.012, 16]} />
        {matMetal(CHROME, 0.95, 0.12, CYAN, 0.6)}
      </mesh>
      <mesh position={[-0.04, 0.05, 0.062]}>
        <boxGeometry args={[0.03, 0.012, 0.006]} />
        {matMetal(RED, 0.5, 0.2, RED, 1.2)}
      </mesh>
    </group>
  );
}

/** Metallic collectible bar / ingot */
function MetalCollectible({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0.1, 0.5, 0.1]}>
      <mesh castShadow position={[0, 0.04, 0]}>
        <boxGeometry args={[0.16, 0.05, 0.08]} />
        {matMetal("#3a404c", 0.96, 0.14)}
      </mesh>
      <mesh position={[0, 0.068, 0]}>
        <boxGeometry args={[0.14, 0.012, 0.065]} />
        {matMetal(CHROME, 0.95, 0.12, CYAN, 0.25)}
      </mesh>
      <mesh position={[0, 0.04, 0.042]}>
        <boxGeometry args={[0.15, 0.008, 0.006]} />
        {matMetal(RED, 0.5, 0.2, RED, 1.0)}
      </mesh>
    </group>
  );
}

/** SOL metal bar */
function SolBar({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0, 0.45, 0.08]}>
      <mesh castShadow position={[0, 0.042, 0]}>
        <boxGeometry args={[0.16, 0.05, 0.078]} />
        {matMetal("#1a1028", 0.93, 0.16, PURPLE, 0.2)}
      </mesh>
      <mesh position={[0, 0.042, 0.04]}>
        <boxGeometry args={[0.15, 0.008, 0.006]} />
        {matMetal(CYAN, 0.6, 0.15, CYAN, 1.4)}
      </mesh>
      <mesh position={[0, 0.042, -0.04]}>
        <boxGeometry args={[0.15, 0.008, 0.006]} />
        {matMetal(PURPLE, 0.6, 0.15, PURPLE, 1.2)}
      </mesh>
    </group>
  );
}

/** Legendary jackpot cube — dark with red/cyan edge glow */
function JackpotCube({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh castShadow position={[0, 0.07, 0]}>
        <boxGeometry args={[0.13, 0.13, 0.13]} />
        {matMetal("#0c0e14", 0.9, 0.18, RED, 0.35)}
      </mesh>
      {/* Edge neon strips */}
      {(
        [
          [0, 0.135, 0, [0.132, 0.008, 0.132]],
          [0, 0.005, 0, [0.132, 0.008, 0.132]],
        ] as const
      ).map(([x, y, z, args], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={args as [number, number, number]} />
          {matMetal(i === 0 ? RED : CYAN, 0.5, 0.15, i === 0 ? RED : CYAN, 2)}
        </mesh>
      ))}
      <mesh position={[0, 0.07, 0.068]}>
        <boxGeometry args={[0.06, 0.06, 0.008]} />
        {matMetal(BLACK, 0.85, 0.25, RED, 1.0)}
      </mesh>
      {/* Hex badge */}
      <mesh position={[0, 0.07, 0.072]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.006, 6]} />
        {matMetal(CHROME, 0.95, 0.12, CYAN, 1.2)}
      </mesh>
    </group>
  );
}

/** Soft metallic gem (dark, not toy candy) */
function DarkGem({
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
      <mesh castShadow position={[0, 0.08, 0]} rotation={[0.2, 0.4, 0.1]}>
        <octahedronGeometry args={[0.09, 0]} />
        <meshStandardMaterial
          color={color}
          metalness={0.55}
          roughness={0.12}
          emissive={emissive}
          emissiveIntensity={0.35}
          flatShading
        />
      </mesh>
    </group>
  );
}

export function PrizeMeshByKind({
  kind,
  scale = 1,
}: {
  kind: MoneyPrizeKind | "crystal" | "neon_capsule" | "jackpot_hex";
  scale?: number;
}) {
  switch (kind) {
    case "fiatclaw_token":
      return <FiatClawToken scale={scale} />;
    case "sol_token":
      return <SolToken scale={scale} />;
    case "nft_capsule":
    case "neon_capsule":
      return <NftCapsule scale={scale} />;
    case "mystery_crate":
      return <MysteryCrate scale={scale} />;
    case "vault_box":
      return <VaultBox scale={scale} />;
    case "metal_collectible":
      return <MetalCollectible scale={scale} />;
    case "jackpot_cube":
    case "jackpot_hex":
      return <JackpotCube scale={scale} />;
    case "sol_bar":
      return <SolBar scale={scale} />;
    case "sol_crystal":
      return <DarkGem color="#0e1820" emissive={CYAN} scale={scale} />;
    case "crystal_purple":
    case "crystal":
      return <DarkGem color="#1a0a28" emissive={PURPLE} scale={scale} />;
    case "crystal_red":
      return <DarkGem color="#1a080c" emissive={RED} scale={scale} />;
    case "crystal_cyan":
      return <DarkGem color="#061820" emissive={CYAN} scale={scale} />;
    case "crystal_gold":
      return <DarkGem color="#1c1810" emissive="#8a7a40" scale={scale} />;
    default:
      return <FiatClawToken scale={scale} />;
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
        baseY + Math.sin(t * 1.1 + spec.seed * 0.17) * 0.018;
    }
    if (spec.spin) {
      ref.current.rotation.y = t * (0.22 + (spec.seed % 7) * 0.03) + spec.seed;
      if (spec.kind === "fiatclaw_token" || spec.kind === "sol_token") {
        ref.current.rotation.x = 1.15 + Math.sin(t * 0.5 + spec.seed) * 0.06;
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

export function useMetalMat() {
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#8a919e",
        metalness: 0.94,
        roughness: 0.2,
      }),
    []
  );
}
