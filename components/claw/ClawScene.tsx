"use client";

/**
 * FIATCLAW VAULT — premium industrial crypto vault (Mockup A).
 * Massive titanium / carbon-fiber cylinder chamber + heavy 3-blade robotic claw.
 * Visual redesign only — gameplay phases, containment, and prize logic unchanged.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, useTexture } from "@react-three/drei";
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
const GOLD = "#F5C542";
const TITANIUM = "#0a0c10";
const TITANIUM_MID = "#12161e";
const CARBON = "#0e1014";
const GUNMETAL = "#1c222c";
/**
 * Mid-tone industrial metal — readable form under red/cyan neon.
 * Never pure white (#fff) — avoids white bloom wash.
 */
const CHROME = "#9aa4b2";
const STEEL = "#8a94a2";
const STEEL_DARK = "#5a6470";

export interface ClawSceneProps {
  phase: ClawPhase;
  clawX: number;
}

export const CABINET_SHELL_MODE = "hollow-open-front" as const;
export const CLAW_BLADES = CLAW_FINGER_COUNT;
export const MACHINE_STYLE = "crypto-vault-glass-cylinder" as const;

function useSlipped(phase: ClawPhase) {
  const slipped = useRef(false);
  slipped.current = updateSlippedLatch(phase, slipped.current);
  return slipped.current;
}

/** Max X travel so claw stays inside glass radius (~1.55). */
function mapClawX(pct: number) {
  return ((Math.min(86, Math.max(14, pct)) - 50) / 36) * 0.48;
}

function targetClawY(phase: ClawPhase) {
  switch (phase) {
    case "drop":
    case "close":
      return 0.15;
    case "lift":
    case "hold":
    case "win":
      return 0.55;
    case "slip":
      return 0.28;
    case "return":
    case "lose":
      return 0.5;
    default:
      return 0.55;
  }
}

function metal(c: string, m = 0.92, r = 0.2) {
  return { color: c, metalness: m, roughness: r } as const;
}

function carbonMat() {
  return {
    color: CARBON,
    metalness: 0.55,
    roughness: 0.62,
  } as const;
}

/** Etalon glass neon signs as textures (no Text wrap artifacts). */
function VaultSign({
  url,
  position,
  rotation,
  width = 0.95,
  height = 0.48,
}: {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  width?: number;
  height?: number;
}) {
  const map = useTexture(url);
  useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
  }, [map]);
  return (
    <mesh position={position} rotation={rotation} renderOrder={2}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={map}
        transparent
        alphaTest={0.05}
        toneMapped={false}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Thick titanium structural ring + neon trim (red or cyan only). */
function VaultRing({
  y,
  radius,
  tube = 0.05,
  neon,
  metalColor = GUNMETAL,
}: {
  y: number;
  radius: number;
  tube?: number;
  neon?: string;
  metalColor?: string;
}) {
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[radius, tube, 14, 72]} />
        <meshStandardMaterial {...metal(metalColor, 0.96, 0.18)} />
      </mesh>
      {neon && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, tube * 0.32, 10, 72]} />
          <meshStandardMaterial
            color={neon}
            emissive={neon}
            emissiveIntensity={1.75}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

/** Spinning industrial cooling fan — vault always feels alive. */
function CoolingFan({
  position,
  scale = 0.55,
  speed = 5.5,
}: {
  position: [number, number, number];
  scale?: number;
  speed?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * speed;
  });
  return (
    <group position={position} scale={scale}>
      <mesh castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.045, 24]} />
        <meshStandardMaterial {...metal(TITANIUM_MID, 0.94, 0.22)} />
      </mesh>
      <mesh position={[0, 0.028, 0]}>
        <torusGeometry args={[0.15, 0.012, 8, 28]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.1}
          toneMapped={false}
        />
      </mesh>
      <group ref={ref}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh
            key={i}
            rotation={[0, 0, (i * Math.PI) / 3]}
            position={[0, 0.025, 0]}
            castShadow
          >
            <boxGeometry args={[0.13, 0.012, 0.032]} />
            <meshStandardMaterial {...metal(CHROME, 0.95, 0.16)} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Carbon-fiber panel strip on titanium structure. */
function CarbonPanel({
  position,
  rotation = [0, 0, 0],
  size = [0.35, 0.12, 0.03],
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  size?: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial {...carbonMat()} />
    </mesh>
  );
}

/**
 * Massive industrial vault: thick titanium base + premium glass cylinder + armored crown.
 * Neon rings decorate structure only — red + cyan only.
 */
function VaultShell() {
  const R = 1.55;
  const H = 3.15;
  const idleNeon = useRef(0);
  const crownGlow = useRef<THREE.MeshStandardMaterial>(null);
  const basePulse = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_, dt) => {
    idleNeon.current += dt;
    const pulse = 1.2 + Math.sin(idleNeon.current * 1.4) * 0.35;
    if (crownGlow.current) crownGlow.current.emissiveIntensity = pulse;
    if (basePulse.current)
      basePulse.current.emissiveIntensity = 0.55 + Math.sin(idleNeon.current * 0.9) * 0.2;
  });

  return (
    <group userData={{ shell: "glass-cylinder-vault", style: MACHINE_STYLE }}>
      {/* === MASSIVE TITANIUM BASE === */}
      <mesh position={[0, -1.68, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.05, 2.25, 0.42, 56]} />
        <meshStandardMaterial {...metal(TITANIUM, 0.96, 0.22)} />
      </mesh>
      {/* Carbon fiber band on base */}
      <mesh position={[0, -1.52, 0]} castShadow>
        <cylinderGeometry args={[2.0, 2.02, 0.1, 56]} />
        <meshStandardMaterial {...carbonMat()} />
      </mesh>
      <mesh position={[0, -1.42, 0]} castShadow>
        <cylinderGeometry args={[1.78, 1.88, 0.16, 56]} />
        <meshStandardMaterial {...metal(TITANIUM_MID, 0.95, 0.2)} />
      </mesh>
      <VaultRing y={-1.38} radius={1.82} tube={0.042} neon={CYAN} metalColor="#151a22" />
      <VaultRing y={-1.82} radius={2.08} tube={0.038} neon={RED} metalColor="#10141c" />
      <VaultRing y={-1.95} radius={2.18} tube={0.028} neon={CYAN} metalColor="#0c1016" />

      {/* Circuit-detail risers on base (luxury vault identity) */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh
            key={`riser-${i}`}
            position={[Math.cos(a) * 1.95, -1.55, Math.sin(a) * 1.95]}
            rotation={[0, -a, 0]}
            castShadow
          >
            <boxGeometry args={[0.08, 0.22, 0.04]} />
            <meshStandardMaterial {...metal(GUNMETAL, 0.9, 0.28)} />
          </mesh>
        );
      })}

      {/* Inner floor — dark titanium + dual neon wash */}
      <mesh position={[0, -1.34, 0]} receiveShadow>
        <cylinderGeometry args={[1.42, 1.42, 0.07, 56]} />
        <meshStandardMaterial {...metal("#06080c", 0.78, 0.42)} />
      </mesh>
      <mesh position={[0, -1.295, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.35, 56]} />
        <meshStandardMaterial
          ref={basePulse}
          color="#060810"
          emissive={CYAN}
          emissiveIntensity={0.55}
          transparent
          opacity={0.5}
        />
      </mesh>
      <mesh position={[0, -1.29, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.95, 1.32, 56]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={0.45}
          transparent
          opacity={0.28}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Floor grid etching */}
      <mesh position={[0, -1.288, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.42, 48]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={0.8}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* === PREMIUM REINFORCED GLASS CYLINDER === */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[R + 0.03, R + 0.03, H, 72, 1, true]} />
        <meshPhysicalMaterial
          color="#6a9ab8"
          metalness={0.08}
          roughness={0.04}
          transmission={0.82}
          thickness={0.95}
          transparent
          opacity={0.32}
          ior={1.52}
          side={THREE.DoubleSide}
          depthWrite={false}
          clearcoat={1}
          clearcoatRoughness={0.04}
          envMapIntensity={2.1}
          reflectivity={0.72}
        />
      </mesh>
      {/* Inner glass liner — deeper reflections */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[R - 0.05, R - 0.05, H * 0.98, 56, 1, true]} />
        <meshPhysicalMaterial
          color="#90c0d8"
          metalness={0}
          roughness={0.02}
          transmission={0.94}
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
          clearcoat={1}
          clearcoatRoughness={0.05}
          envMapIntensity={1.8}
        />
      </mesh>
      {/* Glass rim highlight bands (cinematic reflections) */}
      <mesh position={[0, 1.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[R - 0.02, R + 0.04, 64]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={0.35}
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Thick vertical titanium struts + carbon inserts (6) */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 12;
        const x = Math.cos(a) * R;
        const z = Math.sin(a) * R;
        return (
          <group key={`strut-${i}`}>
            <mesh position={[x, 0.2, z]} castShadow>
              <boxGeometry args={[0.12, H, 0.1]} />
              <meshStandardMaterial {...metal(TITANIUM_MID, 0.95, 0.2)} />
            </mesh>
            <CarbonPanel
              position={[x * 1.01, 0.45, z * 1.01]}
              rotation={[0, -a, 0]}
              size={[0.06, 0.55, 0.04]}
            />
            <CarbonPanel
              position={[x * 1.01, -0.55, z * 1.01]}
              rotation={[0, -a, 0]}
              size={[0.06, 0.4, 0.04]}
            />
            {/* Neon edge on every other strut */}
            {i % 2 === 0 && (
              <mesh position={[x * 1.04, 0.2, z * 1.04]}>
                <boxGeometry args={[0.02, H * 0.92, 0.02]} />
                <meshStandardMaterial
                  color={i % 4 === 0 ? RED : CYAN}
                  emissive={i % 4 === 0 ? RED : CYAN}
                  emissiveIntensity={1.3}
                  toneMapped={false}
                />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Structural metal rings + neon trim */}
      <VaultRing y={1.55} radius={R + 0.04} tube={0.055} neon={RED} />
      <VaultRing y={0.85} radius={R + 0.04} tube={0.045} neon={CYAN} />
      <VaultRing y={0.15} radius={R + 0.04} tube={0.045} neon={RED} />
      <VaultRing y={-0.55} radius={R + 0.04} tube={0.048} neon={CYAN} />
      <VaultRing y={-1.15} radius={R + 0.04} tube={0.05} neon={RED} />

      {/* === ARMORED CROWN / GANTRY HOUSING === */}
      <mesh position={[0, 1.85, 0]} castShadow>
        <cylinderGeometry args={[1.72, 1.65, 0.32, 56]} />
        <meshStandardMaterial {...metal(TITANIUM, 0.96, 0.18)} />
      </mesh>
      <mesh position={[0, 1.85, 0]}>
        <cylinderGeometry args={[1.74, 1.67, 0.12, 56]} />
        <meshStandardMaterial {...carbonMat()} />
      </mesh>
      <mesh position={[0, 2.08, 0]} castShadow>
        <cylinderGeometry args={[1.48, 1.68, 0.22, 56]} />
        <meshStandardMaterial {...metal(TITANIUM_MID, 0.95, 0.2)} />
      </mesh>
      <mesh position={[0, 2.28, 0]} castShadow>
        <cylinderGeometry args={[1.2, 1.42, 0.18, 48]} />
        <meshStandardMaterial {...metal("#0e1218", 0.94, 0.22)} />
      </mesh>
      <VaultRing y={2.0} radius={1.55} tube={0.035} neon={CYAN} />
      <VaultRing y={1.72} radius={1.62} tube={0.032} neon={RED} />

      {/* Crown badge strip */}
      <mesh position={[0, 2.05, 1.35]} castShadow>
        <boxGeometry args={[1.1, 0.14, 0.06]} />
        <meshStandardMaterial {...metal("#0c1016", 0.9, 0.25)} />
      </mesh>
      <mesh position={[0, 2.05, 1.39]}>
        <boxGeometry args={[0.95, 0.05, 0.02]} />
        <meshStandardMaterial
          ref={crownGlow}
          color={RED}
          emissive={RED}
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>

      {/* Ceiling neon rings — cyan + red only */}
      <mesh position={[0, 1.62, 0]}>
        <torusGeometry args={[0.95, 0.036, 12, 56]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.55}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 1.58, 0]}>
        <torusGeometry args={[0.62, 0.024, 10, 48]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.25}
          toneMapped={false}
        />
      </mesh>

      {/* Crown cooling fans — mechanical idle life */}
      <CoolingFan position={[-0.55, 2.22, 0.35]} scale={0.42} speed={6.2} />
      <CoolingFan position={[0.55, 2.22, 0.35]} scale={0.42} speed={5.8} />
      <CoolingFan position={[0, 2.22, -0.5]} scale={0.38} speed={7.1} />

      {/* Back metal panel for depth/silhouette */}
      <mesh position={[0, 0.25, -R * 0.12]} castShadow>
        <cylinderGeometry
          args={[
            R - 0.1,
            R - 0.1,
            H * 0.9,
            36,
            1,
            true,
            Math.PI * 0.55,
            Math.PI * 0.9,
          ]}
        />
        <meshStandardMaterial
          {...metal("#080a0e", 0.9, 0.35)}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Carbon rear panel insert */}
      <mesh position={[0, 0.3, -R * 0.22]} castShadow>
        <boxGeometry args={[1.6, 1.8, 0.05]} />
        <meshStandardMaterial {...carbonMat()} />
      </mesh>

      {/* Neon signs ON outer glass */}
      <VaultSign
        url="/refs/sign-win.png"
        position={[-1.62, 0.6, 0.6]}
        rotation={[0, 0.72, 0]}
        width={1.1}
        height={0.58}
      />
      <VaultSign
        url="/refs/sign-claw.png"
        position={[1.62, 0.6, 0.6]}
        rotation={[0, -0.72, 0]}
        width={1.1}
        height={0.48}
      />

      {/* Base cooling fans */}
      <CoolingFan position={[-1.95, -1.32, 0.45]} scale={0.58} speed={4.8} />
      <CoolingFan position={[1.95, -1.32, 0.45]} scale={0.58} speed={5.2} />

      <InteriorFog />
      <FloatingParticles />
      <VolumetricHazes />
    </group>
  );
}

/** Rising fog particles inside the chamber — red/cyan tinted. */
function InteriorFog() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 220;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const cRed = new THREE.Color(RED);
    const cCyan = new THREE.Color(CYAN);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.25 + Math.random() * 1.2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -1.15 + Math.random() * 2.4;
      pos[i * 3 + 2] = Math.sin(a) * r;
      const c = i % 2 === 0 ? cCyan : cRed;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, []);
  useFrame(() => {
    if (!ref.current) return;
    const arr = (ref.current.geometry.attributes.position as THREE.BufferAttribute)
      .array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1]! += 0.003;
      arr[i]! += Math.sin(arr[i + 1]! * 2) * 0.0004;
      if (arr[i + 1]! > 1.45) arr[i + 1] = -1.2;
    }
    ref.current.geometry.attributes.position!.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.055}
        vertexColors
        transparent
        opacity={0.32}
        depthWrite={false}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/** Fine floating dust / ember particles. */
function FloatingParticles() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 90;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.35;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -1.0 + Math.random() * 2.6;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((s) => {
    if (!ref.current) return;
    ref.current.rotation.y = s.clock.elapsedTime * 0.04;
    const arr = (ref.current.geometry.attributes.position as THREE.BufferAttribute)
      .array as Float32Array;
    const t = s.clock.elapsedTime;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1]! += 0.0012 + Math.sin(t + i) * 0.0003;
      if (arr[i + 1]! > 1.6) arr[i + 1] = -1.15;
    }
    ref.current.geometry.attributes.position!.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.028}
        color={CYAN}
        transparent
        opacity={0.45}
        depthWrite={false}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/** Soft volumetric haze planes — casino vault atmosphere. */
function VolumetricHazes() {
  const g0 = useRef<THREE.Mesh>(null);
  const g1 = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (g0.current) {
      g0.current.rotation.y = t * 0.08;
      (g0.current.material as THREE.MeshStandardMaterial).opacity =
        0.06 + Math.sin(t * 0.6) * 0.02;
    }
    if (g1.current) {
      g1.current.rotation.y = -t * 0.06;
      (g1.current.material as THREE.MeshStandardMaterial).opacity =
        0.05 + Math.cos(t * 0.5) * 0.018;
    }
  });
  return (
    <group>
      <mesh ref={g0} position={[0, -0.2, 0]}>
        <cylinderGeometry args={[1.35, 1.35, 1.8, 32, 1, true]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={0.25}
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={g1} position={[0, 0.4, 0]}>
        <cylinderGeometry args={[1.25, 1.25, 1.4, 32, 1, true]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={0.22}
          transparent
          opacity={0.05}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function PrizePile({ phase }: { phase: ClawPhase }) {
  const layout = useMemo(() => buildPrizePileLayout(42), []);
  const dim = phase === "win" ? 0.35 : 1;
  return (
    <group
      position={[0, -1.34, 0]}
      userData={{
        prizePile: "vault-dense-sprites",
        prizeCount: layout.length,
        moneyOnly: true,
      }}
    >
      {layout.map((spec, i) => (
        <AnimatedPrize key={i} spec={spec} dim={dim} />
      ))}
    </group>
  );
}

/**
 * Industrial 3-blade finger — thin elegant capsules (containment-safe)
 * with visible hydraulics, joints, and neon edge accents.
 */
function MetalBlade({
  fingerRef,
  yaw,
}: {
  fingerRef: React.MutableRefObject<THREE.Group | null>;
  yaw: number;
}) {
  const steel = {
    color: CHROME,
    metalness: 0.88,
    roughness: 0.22,
  } as const;
  return (
    <group rotation={[0, yaw, 0]}>
      <group ref={fingerRef as React.Ref<THREE.Group>} position={[0.05, 0, 0]}>
        {/* Shoulder block */}
        <mesh position={[0.02, 0, 0]} castShadow>
          <boxGeometry args={[0.055, 0.05, 0.048]} />
          <meshStandardMaterial color={STEEL_DARK} metalness={0.85} roughness={0.28} />
        </mesh>
        {/* Dual hydraulic pistons */}
        <mesh position={[0.045, -0.025, 0.028]} rotation={[0, 0, 0.4]} castShadow>
          <cylinderGeometry args={[0.01, 0.01, 0.1, 10]} />
          <meshStandardMaterial color={STEEL} metalness={0.9} roughness={0.22} />
        </mesh>
        <mesh position={[0.045, -0.025, -0.028]} rotation={[0, 0, 0.4]} castShadow>
          <cylinderGeometry args={[0.01, 0.01, 0.1, 10]} />
          <meshStandardMaterial color={STEEL} metalness={0.9} roughness={0.22} />
        </mesh>
        {/* Hydraulic cylinder housing */}
        <mesh position={[0.038, -0.01, 0.028]} castShadow>
          <cylinderGeometry args={[0.016, 0.016, 0.04, 10]} />
          <meshStandardMaterial {...metal("#1a2030", 0.9, 0.28)} />
        </mesh>
        {/* Upper arm — thin elegant capsule (test: 0.022) */}
        <mesh position={[0.06, -0.065, 0]} rotation={[0, 0, 0.48]} castShadow>
          <capsuleGeometry args={[0.022, 0.11, 6, 14]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        {/* Knuckle joint */}
        <mesh position={[0.1, -0.155, 0]} castShadow>
          <sphereGeometry args={[0.028, 16, 16]} />
          <meshStandardMaterial color={STEEL} metalness={0.88} roughness={0.24} />
        </mesh>
        <mesh position={[0.1, -0.155, 0]} rotation={[Math.PI / 2, 0, 0.25]}>
          <torusGeometry args={[0.032, 0.006, 8, 18]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.5}
            toneMapped={false}
          />
        </mesh>
        {/* Mid C-curve — thin (test: 0.02) */}
        <mesh position={[0.125, -0.255, 0]} rotation={[0, 0, 0.95]} castShadow>
          <capsuleGeometry args={[0.02, 0.11, 6, 14]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        {/* Serrated tip hook */}
        <mesh position={[0.11, -0.35, 0.012]} rotation={[0.2, 0, 1.35]} castShadow>
          <capsuleGeometry args={[0.016, 0.075, 5, 12]} />
          <meshStandardMaterial
            color={STEEL_DARK}
            metalness={0.86}
            roughness={0.28}
          />
        </mesh>
        {/* Cyan edge accent on blade */}
        <mesh position={[0.12, -0.26, 0.022]} rotation={[0, 0, 0.95]}>
          <boxGeometry args={[0.006, 0.1, 0.004]} />
          <meshStandardMaterial
            color={CYAN}
            emissive={CYAN}
            emissiveIntensity={1.1}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Heavy industrial 3-blade claw — strictly inside glass cylinder.
 * Thick motor housing + hydraulics + cables; thin containment-safe fingers.
 */
function ClawAssembly({ phase, clawX }: { phase: ClawPhase; clawX: number }) {
  const slipped = useSlipped(phase);
  const hold = clawShouldHoldPrize(phase, slipped);
  const open = clawFingersOpen(phase, slipped);
  const group = useRef<THREE.Group>(null);
  const motorGroup = useRef<THREE.Group>(null);
  const f0 = useRef<THREE.Group>(null);
  const f1 = useRef<THREE.Group>(null);
  const f2 = useRef<THREE.Group>(null);
  const prize = useRef<THREE.Group>(null);
  const fall = useRef(0);
  const cableScale = useRef(0.45);
  const idleT = useRef(0);

  const x = mapClawX(clawX);
  const yTarget = targetClawY(phase);

  useFrame((_, dt) => {
    if (!group.current) return;
    idleT.current += dt;

    group.current.position.x = THREE.MathUtils.damp(
      group.current.position.x,
      x,
      8,
      dt
    );
    group.current.position.y = THREE.MathUtils.damp(
      group.current.position.y,
      yTarget,
      phase === "drop" ? 3.4 : 5,
      dt
    );

    // Idle micro-sway when waiting — vault feels alive
    if (phase === "idle" || phase === "ready") {
      group.current.rotation.z = Math.sin(idleT.current * 0.7) * 0.015;
      if (motorGroup.current) {
        motorGroup.current.rotation.y = Math.sin(idleT.current * 0.35) * 0.04;
      }
    } else {
      group.current.rotation.z = THREE.MathUtils.damp(
        group.current.rotation.z,
        0,
        6,
        dt
      );
    }

    // Modest open — tips stay inside chamber
    const openAng = open ? 0.22 : 0.05;
    for (const fr of [f0, f1, f2]) {
      if (fr.current) {
        fr.current.rotation.z = THREE.MathUtils.damp(
          fr.current.rotation.z,
          openAng,
          11,
          dt
        );
      }
    }

    const targetCable =
      phase === "drop" || phase === "close"
        ? 0.75
        : phase === "slip"
          ? 0.48
          : 0.3;
    cableScale.current = THREE.MathUtils.damp(
      cableScale.current,
      targetCable,
      6,
      dt
    );

    if (prize.current) {
      if (hold) {
        fall.current = 0;
        prize.current.visible = true;
        prize.current.position.set(0, -0.42, 0.02);
      } else if (phase === "slip" || phase === "lose") {
        prize.current.visible = true;
        fall.current += dt * 2.3;
        prize.current.position.y = -0.42 - fall.current;
        if (fall.current > 1.5) prize.current.visible = false;
      } else {
        prize.current.visible = false;
        fall.current = 0;
      }
    }
  });

  const baseCable = 0.72;

  return (
    <group
      ref={group}
      position={[0, 0.9, 0.05]}
      scale={1.18}
      userData={{
        clawBlades: CLAW_BLADES,
        style: "solid-metal-3blade",
        containment: "inside-glass-cylinder",
        maxTravelX: 0.48,
      }}
    >
      {/* Heavy ceiling carriage — under crown, inside R */}
      <mesh position={[0, 0.44, 0]} castShadow>
        <boxGeometry args={[0.52, 0.16, 0.34]} />
        <meshStandardMaterial {...metal(TITANIUM, 0.94, 0.2)} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <boxGeometry args={[0.48, 0.08, 0.3]} />
        <meshStandardMaterial {...carbonMat()} />
      </mesh>
      <mesh position={[0, 0.54, 0]} castShadow>
        <boxGeometry args={[1.05, 0.07, 0.12]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.92, 0.24)} />
      </mesh>
      <mesh position={[0, 0.585, 0]}>
        <boxGeometry args={[1.0, 0.014, 0.04]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.45}
          toneMapped={false}
        />
      </mesh>
      {/* Rail ends */}
      {[-0.52, 0.52].map((sx) => (
        <mesh key={sx} position={[sx, 0.54, 0]} castShadow>
          <boxGeometry args={[0.08, 0.1, 0.14]} />
          <meshStandardMaterial {...metal(TITANIUM_MID, 0.93, 0.22)} />
        </mesh>
      ))}

      {/* Hydraulic tubes on carriage */}
      {[-0.16, 0.16].map((sx) => (
        <group key={sx}>
          <mesh
            position={[sx, 0.34, 0.08]}
            rotation={[0.18, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.018, 0.02, 0.26, 12]} />
            <meshStandardMaterial {...metal("#1a2030", 0.9, 0.28)} />
          </mesh>
          <mesh position={[sx, 0.22, 0.1]} castShadow>
            <cylinderGeometry args={[0.024, 0.024, 0.05, 12]} />
            <meshStandardMaterial {...metal(STEEL_DARK, 0.88, 0.3)} />
          </mesh>
        </group>
      ))}

      {/* Cable reel + motor winch */}
      <mesh position={[0, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.1, 18]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.92, 0.24)} />
      </mesh>
      <mesh position={[0, 0.32, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.07, 0.008, 8, 20]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </mesh>

      {/* Braided steel cable */}
      <mesh
        position={[0, 0.24 - (baseCable * cableScale.current) / 2, 0]}
        scale={[1, cableScale.current, 1]}
      >
        <cylinderGeometry args={[0.018, 0.015, baseCable, 12]} />
        <meshStandardMaterial color="#1a1c20" metalness={0.94} roughness={0.28} />
      </mesh>
      {/* Secondary guide cables */}
      {[-0.03, 0.03].map((ox) => (
        <mesh
          key={ox}
          position={[ox, 0.24 - (baseCable * cableScale.current) / 2, 0.02]}
          scale={[1, cableScale.current, 1]}
        >
          <cylinderGeometry args={[0.006, 0.005, baseCable, 8]} />
          <meshStandardMaterial color="#2a2e34" metalness={0.9} roughness={0.32} />
        </mesh>
      ))}

      {/* Heavy motor housing + exactly 3 blades */}
      <group
        ref={motorGroup}
        position={[0, 0.24 - baseCable * cableScale.current - 0.07, 0]}
        userData={{ fingers: CLAW_BLADES, motor: true }}
      >
        {/* Cable collar */}
        <mesh position={[0, 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.05, 0.07, 16]} />
          <meshStandardMaterial {...metal(TITANIUM_MID, 0.93, 0.22)} />
        </mesh>
        {/* Main motor body — carbon + titanium */}
        <mesh castShadow>
          <cylinderGeometry args={[0.13, 0.14, 0.22, 32]} />
          <meshStandardMaterial {...carbonMat()} />
        </mesh>
        <mesh castShadow>
          <cylinderGeometry args={[0.12, 0.13, 0.18, 32]} />
          <meshStandardMaterial color="#1e2630" metalness={0.88} roughness={0.26} />
        </mesh>
        {/* Top flange */}
        <mesh position={[0, 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.115, 0.125, 0.05, 28]} />
          <meshStandardMaterial color={STEEL} metalness={0.9} roughness={0.22} />
        </mesh>
        {/* Side hydraulic tanks */}
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            position={[s * 0.1, 0.02, 0.08]}
            rotation={[0.3, 0, s * 0.15]}
            castShadow
          >
            <cylinderGeometry args={[0.028, 0.03, 0.14, 12]} />
            <meshStandardMaterial {...metal("#1a2030", 0.9, 0.26)} />
          </mesh>
        ))}
        {/* Red neon collars */}
        <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.14, 0.012, 10, 36]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.55}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, -0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.142, 0.01, 10, 36]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.35}
            toneMapped={false}
          />
        </mesh>
        {/* Cyan status ring */}
        <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.118, 0.007, 8, 28]} />
          <meshStandardMaterial
            color={CYAN}
            emissive={CYAN}
            emissiveIntensity={1.2}
            toneMapped={false}
          />
        </mesh>
        {/* Lower reducer + pivot */}
        <mesh position={[0, -0.14, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.07, 0.07, 24]} />
          <meshStandardMaterial
            color={STEEL_DARK}
            metalness={0.88}
            roughness={0.28}
          />
        </mesh>
        <mesh position={[0, -0.2, 0]} castShadow>
          <sphereGeometry args={[0.055, 20, 20]} />
          <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.2} />
        </mesh>

        {/* Exactly 3 industrial metal blades */}
        <group position={[0, -0.2, 0]}>
          <MetalBlade fingerRef={f0} yaw={-0.95} />
          <MetalBlade fingerRef={f1} yaw={0.95} />
          <MetalBlade fingerRef={f2} yaw={Math.PI} />
          {/* Soft red/cyan fill — no white */}
          <pointLight
            position={[0.12, -0.1, 0.22]}
            intensity={1.55}
            color={CYAN}
            distance={1.5}
          />
          <pointLight
            position={[-0.12, -0.14, 0.2]}
            intensity={1.45}
            color={RED}
            distance={1.4}
          />
          <group ref={prize} visible={false}>
            <PrizeMeshByKind kind="fiatclaw_token" scale={hold ? 1.1 : 0.9} />
          </group>
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
      pos[i * 3] = (Math.random() - 0.5) * 0.55;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.55;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.55;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((s) => {
    if (!ref.current || !active) return;
    ref.current.rotation.y = s.clock.elapsedTime * 2;
    ref.current.scale.setScalar(1.3 + Math.sin(s.clock.elapsedTime * 5) * 0.2);
  });
  if (!active) return null;
  return (
    <points ref={ref} position={[0, 0.6, 0.6]} geometry={geo}>
      <pointsMaterial
        size={0.04}
        color={GOLD}
        transparent
        opacity={0.9}
        sizeAttenuation
      />
    </points>
  );
}

export function ClawScene({ phase, clawX }: ClawSceneProps) {
  const root = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((state, dt) => {
    t.current += dt;
    const cam = state.camera;
    const idle = phase === "idle" || phase === "ready";
    if (idle) {
      cam.position.x = Math.sin(t.current * 0.15) * 0.14;
      cam.position.y = 0.12 + Math.sin(t.current * 0.11) * 0.045;
    }
    if (phase === "win") {
      cam.position.z = THREE.MathUtils.damp(cam.position.z, 5.8, 2.5, dt);
      if (root.current) {
        root.current.position.x = Math.sin(performance.now() * 0.04) * 0.025;
      }
    } else if (phase === "lose" || phase === "slip") {
      cam.position.z = THREE.MathUtils.damp(cam.position.z, 6.6, 2, dt);
    } else {
      cam.position.z = THREE.MathUtils.damp(cam.position.z, 6.5, 1.5, dt);
    }
    cam.lookAt(0, 0.08, 0);
    if (root.current && idle) {
      root.current.rotation.y = Math.sin(t.current * 0.1) * 0.035;
    }
  });

  return (
    <>
      <color attach="background" args={["#030508"]} />
      <fog attach="fog" args={["#030508", 8, 22]} />

      {/* Dark-neon lighting — red #FF3E5C + cyan #22D3FF only (no white flood) */}
      <ambientLight intensity={0.18} color="#0a1520" />
      <directionalLight
        position={[3.5, 5, 4]}
        intensity={0.45}
        color={CYAN}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-3, 3, 2]} intensity={0.28} color={RED} />
      <pointLight position={[-2.4, 2.0, 2.6]} intensity={1.75} color={CYAN} />
      <pointLight position={[2.4, 1.6, 2.6]} intensity={1.9} color={RED} />
      <pointLight position={[0, 1.4, 1.6]} intensity={1.05} color={CYAN} />
      <pointLight position={[0, 0.2, 1.5]} intensity={1.15} color={RED} />
      <pointLight position={[0, -1.0, 0.5]} intensity={0.55} color={CYAN} />
      <pointLight position={[0, 2.3, 0]} intensity={0.7} color={RED} />
      <spotLight
        position={[0, 3.4, 2.0]}
        angle={0.48}
        penumbra={0.7}
        intensity={1.15}
        color={CYAN}
      />
      <spotLight
        position={[0, 1.5, -1.6]}
        angle={0.55}
        penumbra={0.75}
        intensity={0.85}
        color={RED}
      />

      <group ref={root}>
        <VaultShell />
        <PrizePile phase={phase} />
        <ClawAssembly phase={phase} clawX={clawX} />
        <WinBurst active={phase === "win"} />
      </group>

      <ContactShadows
        position={[0, -1.92, 0]}
        opacity={0.82}
        scale={14}
        blur={2.6}
        far={7}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.78}
          luminanceThreshold={0.58}
          luminanceSmoothing={0.35}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
