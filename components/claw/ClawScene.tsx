"use client";

/**
 * FIATCLAW VAULT — cylindrical glass crypto chamber (etalon-inspired).
 * Industrial metal claw · dense sprite prizes · AAA lighting.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, Text, useTexture } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import {
  CLAW_FINGER_COUNT,
  clawFingersOpen,
  clawShouldHoldPrize,
  updateSlippedLatch,
  type ClawPhase,
} from "@/lib/game/claw-phases";
import { buildPrizePileLayout } from "@/lib/game/prize-visuals";
import { AnimatedPrize, PrizeMeshByKind } from "./PrizeMeshes";

const RED = "#FF3E5C";
const CYAN = "#22D3FF";
const PURPLE = "#7B3FE4";
const GOLD = "#F5C542";
const GUNMETAL = "#2a2f3a";
const CHROME = "#b0b8c4";

export interface ClawSceneProps {
  phase: ClawPhase;
  clawX: number;
}

export const CABINET_SHELL_MODE = "hollow-open-front" as const;
export const CLAW_BLADES = CLAW_FINGER_COUNT;
export const MACHINE_STYLE = "crypto-vault-cylindrical-aaa" as const;

function useSlipped(phase: ClawPhase) {
  const slipped = useRef(false);
  slipped.current = updateSlippedLatch(phase, slipped.current);
  return slipped.current;
}

function mapClawX(pct: number) {
  return ((Math.min(88, Math.max(12, pct)) - 50) / 38) * 0.85;
}

function targetClawY(phase: ClawPhase) {
  switch (phase) {
    case "drop":
    case "close":
      return 0.15;
    case "lift":
    case "hold":
    case "win":
      return 1.15;
    case "slip":
      return 0.55;
    case "return":
    case "lose":
      return 1.1;
    default:
      return 1.15;
  }
}

function metal(c: string, m = 0.93, r = 0.24) {
  return { color: c, metalness: m, roughness: r } as const;
}

function NeonRing({
  radius,
  y,
  color,
  tube = 0.018,
}: {
  radius: number;
  y: number;
  color: string;
  tube?: number;
}) {
  return (
    <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, tube, 12, 64]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={2.4}
        toneMapped={false}
      />
    </mesh>
  );
}

function CoolingFan({
  position,
}: {
  position: [number, number, number];
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 6;
  });
  return (
    <group position={position} scale={0.55}>
      <mesh>
        <cylinderGeometry args={[0.14, 0.14, 0.04, 24]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.9, 0.35)} />
      </mesh>
      <group ref={ref}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]} position={[0, 0.02, 0]}>
            <boxGeometry args={[0.11, 0.012, 0.028]} />
            <meshStandardMaterial {...metal(CHROME, 0.95, 0.18)} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Hollow cylindrical vault chamber — glass tube + metal rings (etalon).
 */
function VaultShell() {
  const R = 1.55;
  const H = 3.4;
  return (
    <group userData={{ shell: "cylindrical-vault", style: MACHINE_STYLE }}>
      {/* Base platform */}
      <mesh position={[0, -1.55, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.85, 2.0, 0.28, 48]} />
        <meshStandardMaterial {...metal("#0e1218", 0.92, 0.28)} />
      </mesh>
      <NeonRing radius={1.75} y={-1.38} color={CYAN} tube={0.02} />
      <NeonRing radius={1.9} y={-1.68} color={RED} tube={0.016} />

      {/* Floor plate inside */}
      <mesh position={[0, -1.35, 0]} receiveShadow>
        <cylinderGeometry args={[1.45, 1.45, 0.08, 48]} />
        <meshStandardMaterial {...metal("#080a10", 0.7, 0.55)} />
      </mesh>
      <mesh position={[0, -1.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.35, 48]} />
        <meshStandardMaterial
          color="#0a0614"
          emissive={PURPLE}
          emissiveIntensity={0.2}
          transparent
          opacity={0.65}
        />
      </mesh>

      {/* Back metal panels for exterior silhouette */}
      <mesh position={[0, 0.2, -R * 0.55]} castShadow>
        <boxGeometry args={[R * 1.8, H * 0.95, 0.12]} />
        <meshStandardMaterial {...metal("#0a0c12", 0.9, 0.32)} />
      </mesh>
      <mesh position={[-R * 0.85, 0.2, -R * 0.25]} rotation={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.14, H * 0.9, R * 0.9]} />
        <meshStandardMaterial {...metal("#10141c", 0.9, 0.3)} />
      </mesh>
      <mesh position={[R * 0.85, 0.2, -R * 0.25]} rotation={[0, -0.55, 0]} castShadow>
        <boxGeometry args={[0.14, H * 0.9, R * 0.9]} />
        <meshStandardMaterial {...metal("#10141c", 0.9, 0.3)} />
      </mesh>

      {/* Front glass window (flat) — clearer than full transparent tube */}
      <mesh position={[0, 0.15, R - 0.05]}>
        <boxGeometry args={[R * 1.7, H * 0.88, 0.04]} />
        <meshPhysicalMaterial
          color="#b8d4e8"
          metalness={0}
          roughness={0.05}
          transmission={0.9}
          thickness={0.35}
          transparent
          opacity={0.16}
          ior={1.45}
          depthWrite={false}
          clearcoat={1}
          clearcoatRoughness={0.06}
        />
      </mesh>
      {/* Soft glass arc sides */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[R, R, H, 48, 1, true]} />
        <meshPhysicalMaterial
          color="#88aacc"
          metalness={0}
          roughness={0.1}
          transmission={0.75}
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Outer metal rings / structure */}
      <NeonRing radius={R + 0.04} y={1.7} color={RED} />
      <NeonRing radius={R + 0.04} y={0.9} color={CYAN} tube={0.012} />
      <NeonRing radius={R + 0.04} y={-0.1} color={RED} tube={0.012} />
      <NeonRing radius={R + 0.04} y={-0.9} color={CYAN} tube={0.014} />

      {/* Crown gantry ring */}
      <mesh position={[0, 1.85, 0]} castShadow>
        <cylinderGeometry args={[1.7, 1.65, 0.22, 48]} />
        <meshStandardMaterial {...metal("#12161e", 0.94, 0.22)} />
      </mesh>
      <NeonRing radius={1.55} y={1.95} color={RED} tube={0.02} />
      <NeonRing radius={1.4} y={1.75} color={CYAN} tube={0.012} />

      {/* Top light bar */}
      <mesh position={[0, 1.72, 0]}>
        <torusGeometry args={[0.9, 0.04, 8, 48]} />
        <meshStandardMaterial
          color="#e8f0ff"
          emissive="#ffffff"
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>

      {/* Side neon copy on back wall */}
      <Text
        position={[-0.85, 0.65, -R * 0.45]}
        fontSize={0.12}
        color={RED}
        anchorX="center"
        maxWidth={1.0}
        textAlign="center"
        outlineWidth={0.005}
        outlineColor="#4a0810"
      >
        {`WIN LEGENDARY`}
      </Text>
      <Text
        position={[0.85, 0.65, -R * 0.45]}
        fontSize={0.11}
        color={CYAN}
        anchorX="center"
        maxWidth={1.0}
        textAlign="center"
        outlineWidth={0.004}
        outlineColor="#083040"
      >
        {`CLAW FIAT. WIN.`}
      </Text>

      {/* Side carbon pillars */}
      {([-1.75, 1.75] as const).map((x) => (
        <mesh key={x} position={[x, 0.1, 0]} castShadow>
          <boxGeometry args={[0.22, 2.8, 0.22]} />
          <meshStandardMaterial color="#0c0e14" metalness={0.55} roughness={0.48} />
        </mesh>
      ))}

      <CoolingFan position={[-1.75, -1.15, 0.35]} />
      <CoolingFan position={[1.75, -1.15, 0.35]} />

      {/* Ambient smoke particles */}
      <ChamberFog />
    </group>
  );
}

function ChamberFog() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 100;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.4 + Math.random() * 1.1;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -1.1 + Math.random() * 2.2;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame(() => {
    if (!ref.current) return;
    const arr = (ref.current.geometry.attributes.position as THREE.BufferAttribute)
      .array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1]! += 0.003;
      if (arr[i + 1]! > 1.4) arr[i + 1] = -1.2;
    }
    ref.current.geometry.attributes.position!.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.04}
        color={PURPLE}
        transparent
        opacity={0.22}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function PrizePile({ phase }: { phase: ClawPhase }) {
  const layout = useMemo(() => buildPrizePileLayout(42), []);
  const dim = phase === "win" ? 0.3 : 1;
  return (
    <group
      position={[0, -1.28, 0]}
      userData={{ prizePile: "vault-sprites", prizeCount: layout.length }}
    >
      {layout.map((spec, i) => (
        <AnimatedPrize
          key={i}
          spec={{
            ...spec,
            // Map rectangular layout into circular vault floor
            position: [
              spec.position[0] * 0.72,
              spec.position[1],
              spec.position[2] * 0.72,
            ],
            scale: spec.scale * 1.15,
          }}
          dim={dim}
        />
      ))}
    </group>
  );
}

/**
 * Hero claw: public/refs/claw-sprite.png — single 3-blade silhouette.
 * Cable + carriage in 3D; fingers are the sprite (no stick-mesh splay).
 */
function ClawAssembly({ phase, clawX }: { phase: ClawPhase; clawX: number }) {
  const slipped = useSlipped(phase);
  const hold = clawShouldHoldPrize(phase, slipped);
  const open = clawFingersOpen(phase, slipped);
  const group = useRef<THREE.Group>(null);
  const sprite = useRef<THREE.Group>(null);
  const prize = useRef<THREE.Group>(null);
  const fall = useRef(0);
  const cableY = useRef(0.45);
  const map = useTexture("/refs/claw-sprite.png");
  useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
  }, [map]);

  const x = mapClawX(clawX);
  const yTarget = targetClawY(phase);

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.position.x = THREE.MathUtils.damp(
      group.current.position.x,
      x,
      8,
      dt
    );
    group.current.position.y = THREE.MathUtils.damp(
      group.current.position.y,
      yTarget,
      phase === "drop" ? 3.5 : 5,
      dt
    );

    const targetCable =
      phase === "drop" || phase === "close"
        ? 0.95
        : phase === "slip"
          ? 0.6
          : 0.42;
    cableY.current = THREE.MathUtils.damp(cableY.current, targetCable, 6, dt);

    if (sprite.current) {
      const sx = open ? 1 : 0.88;
      sprite.current.scale.x = THREE.MathUtils.damp(
        sprite.current.scale.x,
        sx,
        10,
        dt
      );
    }

    if (prize.current) {
      if (hold) {
        fall.current = 0;
        prize.current.visible = true;
        prize.current.position.set(0, -0.72, 0.05);
      } else if (phase === "slip" || phase === "lose") {
        prize.current.visible = true;
        fall.current += dt * 2.4;
        prize.current.position.y = -0.72 - fall.current;
        if (fall.current > 1.5) prize.current.visible = false;
      } else {
        prize.current.visible = false;
        fall.current = 0;
      }
    }
  });

  const cLen = 0.75;

  return (
    <group
      ref={group}
      position={[0, 0.85, 0.4]}
      scale={1.65}
      userData={{ clawBlades: CLAW_BLADES, style: "sprite-3blade-hero" }}
    >
      <mesh position={[0, 0.38, 0]} castShadow>
        <boxGeometry args={[0.5, 0.16, 0.36]} />
        <meshStandardMaterial {...metal("#1a1e28", 0.94, 0.2)} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[1.6, 0.05, 0.08]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.93, 0.22)} />
      </mesh>
      <mesh position={[0, 0.48, 0]}>
        <boxGeometry args={[1.55, 0.01, 0.03]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>

      <mesh
        position={[0, 0.22 - (cLen * cableY.current) / 2, 0]}
        scale={[1, cableY.current, 1]}
      >
        <cylinderGeometry args={[0.018, 0.018, cLen, 12]} />
        <meshStandardMaterial color="#12141a" metalness={0.9} roughness={0.35} />
      </mesh>

      <group
        position={[0, 0.22 - cLen * cableY.current - 0.08, 0]}
        userData={{ fingers: CLAW_BLADES, motor: true }}
      >
        <mesh position={[0, 0.12, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.035, 0.008, 10, 20]} />
          <meshStandardMaterial {...metal(CHROME, 0.97, 0.1)} />
        </mesh>
        {/* 3-blade product sprite */}
        <group ref={sprite} position={[0, -0.35, 0.08]}>
          <mesh renderOrder={2}>
            <planeGeometry args={[1.05, 1.3]} />
            <meshBasicMaterial
              map={map}
              transparent
              alphaTest={0.1}
              depthWrite={false}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
        <group ref={prize} visible={false}>
          <PrizeMeshByKind kind="fiatclaw_token" scale={hold ? 1.25 : 1} />
        </group>
      </group>
    </group>
  );
}

function WinBurst({ active }: { active: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 120;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.4;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((s) => {
    if (!ref.current || !active) return;
    ref.current.rotation.y = s.clock.elapsedTime * 2;
    ref.current.scale.setScalar(1.4 + Math.sin(s.clock.elapsedTime * 5) * 0.2);
  });
  if (!active) return null;
  return (
    <points ref={ref} position={[0, 0.8, 0.5]} geometry={geo}>
      <pointsMaterial size={0.04} color={GOLD} transparent opacity={0.9} sizeAttenuation />
    </points>
  );
}

export function ClawScene({ phase, clawX }: ClawSceneProps) {
  const root = useRef<THREE.Group>(null);
  const camIdle = useRef(0);

  useFrame((state, dt) => {
    camIdle.current += dt;
    // Front-hero view of vault (etalon-like)
    state.camera.lookAt(0, 0.15, 0);
    if (root.current && (phase === "idle" || phase === "ready")) {
      root.current.rotation.y = Math.sin(camIdle.current * 0.15) * 0.06;
    }
    if (phase === "win" && root.current) {
      root.current.rotation.z = Math.sin(performance.now() * 0.05) * 0.01;
    }
  });

  return (
    <>
      <color attach="background" args={["#050608"]} />
      <fog attach="fog" args={["#050608", 12, 28]} />

      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 4]} intensity={1.0} castShadow />
      <pointLight position={[-2, 1.5, 2]} intensity={1.0} color={CYAN} />
      <pointLight position={[2, 1.2, 2]} intensity={1.2} color={RED} />
      <pointLight position={[0, 1.2, 2]} intensity={0.9} color="#ffffff" />
      <pointLight position={[0, -0.5, 1]} intensity={0.55} color={PURPLE} />
      <spotLight
        position={[0, 3.2, 2]}
        angle={0.5}
        penumbra={0.45}
        intensity={2.0}
        color="#eef2ff"
      />
      <spotLight
        position={[0, 2, -1]}
        angle={0.5}
        penumbra={0.6}
        intensity={0.7}
        color={PURPLE}
      />

      <group ref={root}>
        <VaultShell />
        <PrizePile phase={phase} />
        <ClawAssembly phase={phase} clawX={clawX} />
        <WinBurst active={phase === "win"} />
      </group>

      <ContactShadows
        position={[0, -1.75, 0]}
        opacity={0.55}
        scale={10}
        blur={2.5}
        far={5}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.42}
          luminanceThreshold={0.5}
          luminanceSmoothing={0.38}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
