"use client";

/**
 * Premium metallic crypto collectibles — industrial adult palette.
 * Black / gunmetal / chrome + red neon / cyan / purple only.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MoneyPrizeKind, PrizeVisualSpec } from "@/lib/game/prize-visuals";

const RED = "#FF3E5C";
const CYAN = "#22D3FF";
const PURPLE = "#7B3FE4";
const GUNMETAL = "#2a2e36";
const CHROME = "#9aa3b0";
const BLACK = "#0a0b0e";
const CARBON = "#12141a";

function M({
  color,
  metalness = 0.93,
  roughness = 0.2,
  emissive,
  ei = 0,
}: {
  color: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  ei?: number;
}) {
  return (
    <meshStandardMaterial
      color={color}
      metalness={metalness}
      roughness={roughness}
      emissive={emissive ?? "#000000"}
      emissiveIntensity={ei}
      toneMapped={!emissive}
    />
  );
}

function FiatClawToken({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[1.2, 0.1, 0.05]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.036, 40]} />
        <M color={BLACK} metalness={0.96} roughness={0.16} emissive={RED} ei={0.1} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.108, 0.007, 8, 40]} />
        <M color={RED} metalness={0.5} roughness={0.18} emissive={RED} ei={1.9} />
      </mesh>
      <group position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh position={[0, -0.016, 0.002]}>
          <boxGeometry args={[0.06, 0.012, 0.005]} />
          <M color={RED} emissive={RED} ei={1.6} />
        </mesh>
        {([-0.02, 0, 0.02] as const).map((px, i) => (
          <mesh key={i} position={[px, 0.016, 0.002]} rotation={[0, 0, -px * 14]}>
            <boxGeometry args={[0.011, 0.045, 0.005]} />
            <M color={RED} emissive={RED} ei={1.5} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function SolToken({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[1.1, -0.15, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.034, 36]} />
        <M color="#10081c" metalness={0.94} roughness={0.18} emissive={PURPLE} ei={0.28} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.098, 0.006, 8, 36]} />
        <M color={CYAN} metalness={0.6} roughness={0.16} emissive={CYAN} ei={1.5} />
      </mesh>
      <group position={[0, 0.019, 0]} rotation={[-Math.PI / 2, 0, 0.28]}>
        {[0.024, 0, -0.024].map((py, i) => (
          <mesh key={i} position={[0, py, 0.002]}>
            <boxGeometry args={[0.06, 0.013, 0.005]} />
            <M
              color={i === 1 ? PURPLE : CYAN}
              emissive={i === 1 ? PURPLE : CYAN}
              ei={1.4}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function NftCapsule({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0.35, 0.25, 0.5]}>
      <mesh castShadow>
        <capsuleGeometry args={[0.042, 0.085, 6, 14]} />
        <meshPhysicalMaterial
          color="#080e16"
          metalness={0.4}
          roughness={0.1}
          transmission={0.4}
          thickness={0.35}
          transparent
          opacity={0.88}
          emissive={CYAN}
          emissiveIntensity={0.22}
        />
      </mesh>
      <mesh position={[0, 0.048, 0]}>
        <torusGeometry args={[0.043, 0.005, 8, 16]} />
        <M color={CHROME} metalness={0.96} roughness={0.12} emissive={CYAN} ei={0.7} />
      </mesh>
      <mesh position={[0, -0.048, 0]}>
        <torusGeometry args={[0.043, 0.005, 8, 16]} />
        <M color={GUNMETAL} metalness={0.9} roughness={0.2} emissive={RED} ei={0.4} />
      </mesh>
    </group>
  );
}

function MysteryCrate({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0, 0.35, 0]}>
      <mesh castShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[0.13, 0.095, 0.11]} />
        <M color={CARBON} metalness={0.72} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.135, 0.012, 0.115]} />
        <M color={GUNMETAL} metalness={0.9} roughness={0.24} />
      </mesh>
      <mesh position={[0, 0.05, 0.058]}>
        <boxGeometry args={[0.07, 0.018, 0.008]} />
        <M color={RED} emissive={RED} ei={1.5} />
      </mesh>
    </group>
  );
}

function VaultBox({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0, -0.3, 0]}>
      <mesh castShadow position={[0, 0.048, 0]}>
        <boxGeometry args={[0.14, 0.085, 0.1]} />
        <M color="#181c24" metalness={0.95} roughness={0.18} />
      </mesh>
      <mesh position={[0.02, 0.048, 0.054]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.016, 0.016, 0.012, 14]} />
        <M color={CHROME} metalness={0.97} roughness={0.1} emissive={CYAN} ei={0.5} />
      </mesh>
      <mesh position={[-0.038, 0.048, 0.054]}>
        <boxGeometry args={[0.028, 0.01, 0.006]} />
        <M color={RED} emissive={RED} ei={1.2} />
      </mesh>
    </group>
  );
}

function TreasureChest({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0, 0.5, 0]}>
      <mesh castShadow position={[0, 0.04, 0]}>
        <boxGeometry args={[0.15, 0.07, 0.1]} />
        <M color="#1a1410" metalness={0.88} roughness={0.28} emissive="#3a2010" ei={0.15} />
      </mesh>
      <mesh position={[0, 0.085, 0]} rotation={[0.15, 0, 0]}>
        <boxGeometry args={[0.152, 0.04, 0.1]} />
        <M color="#12161e" metalness={0.92} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0.055, 0.052]}>
        <boxGeometry args={[0.04, 0.025, 0.012]} />
        <M color={CHROME} metalness={0.96} roughness={0.12} emissive={CYAN} ei={0.8} />
      </mesh>
      <mesh position={[0, 0.04, 0.052]}>
        <boxGeometry args={[0.12, 0.006, 0.004]} />
        <M color={RED} emissive={RED} ei={1.0} />
      </mesh>
    </group>
  );
}

function MetalCollectible({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0.08, 0.55, 0.1]}>
      <mesh castShadow position={[0, 0.038, 0]}>
        <boxGeometry args={[0.15, 0.048, 0.075]} />
        <M color="#3a404c" metalness={0.97} roughness={0.12} />
      </mesh>
      <mesh position={[0, 0.038, 0.04]}>
        <boxGeometry args={[0.14, 0.008, 0.005]} />
        <M color={RED} emissive={RED} ei={1.1} />
      </mesh>
    </group>
  );
}

function SolBar({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale} rotation={[0, 0.4, 0.05]}>
      <mesh castShadow position={[0, 0.04, 0]}>
        <boxGeometry args={[0.15, 0.048, 0.072]} />
        <M color="#161028" metalness={0.94} roughness={0.16} emissive={PURPLE} ei={0.22} />
      </mesh>
      <mesh position={[0, 0.04, 0.038]}>
        <boxGeometry args={[0.14, 0.007, 0.005]} />
        <M color={CYAN} emissive={CYAN} ei={1.4} />
      </mesh>
    </group>
  );
}

function JackpotCube({ scale = 1 }: { scale?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!ref.current) return;
    ref.current.rotation.y = s.clock.elapsedTime * 0.45;
    const p = 1 + Math.sin(s.clock.elapsedTime * 2.2) * 0.04;
    ref.current.scale.setScalar(scale * p);
  });
  return (
    <group ref={ref}>
      <mesh castShadow position={[0, 0.08, 0]}>
        <boxGeometry args={[0.16, 0.16, 0.16]} />
        <M color="#0a0c12" metalness={0.92} roughness={0.16} emissive={RED} ei={0.55} />
      </mesh>
      <mesh position={[0, 0.162, 0]}>
        <boxGeometry args={[0.162, 0.01, 0.162]} />
        <M color={RED} emissive={RED} ei={2.4} />
      </mesh>
      <mesh position={[0, 0.0, 0]}>
        <boxGeometry args={[0.162, 0.01, 0.162]} />
        <M color={CYAN} emissive={CYAN} ei={2.0} />
      </mesh>
      <pointLight position={[0, 0.08, 0]} intensity={1.2} color={RED} distance={1.5} />
      <mesh position={[0, 0.08, 0.085]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.008, 6]} />
        <M color={CHROME} metalness={0.97} roughness={0.1} emissive={CYAN} ei={1.5} />
      </mesh>
    </group>
  );
}

export function PrizeMeshByKind({
  kind,
  scale = 1,
}: {
  kind: MoneyPrizeKind | string;
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
    case "treasure_chest":
      return <TreasureChest scale={scale} />;
    case "metal_collectible":
      return <MetalCollectible scale={scale} />;
    case "jackpot_cube":
    case "jackpot_hex":
      return <JackpotCube scale={scale} />;
    case "sol_bar":
      return <SolBar scale={scale} />;
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
        baseY + Math.sin(t * 1.05 + spec.seed * 0.15) * 0.014;
    }
    if (spec.spin) {
      ref.current.rotation.y = t * (0.18 + (spec.seed % 7) * 0.025) + spec.seed;
      if (spec.kind === "fiatclaw_token" || spec.kind === "sol_token") {
        ref.current.rotation.x = 1.15 + Math.sin(t * 0.45 + spec.seed) * 0.05;
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
