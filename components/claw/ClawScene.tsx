"use client";

/**
 * FIATCLAW VAULT — massive rectangular industrial crypto vault.
 * Thick titanium frame + reinforced glass panels + heavy 3-blade robotic claw.
 * NOT a cylindrical arcade machine. Visual only — gameplay phases unchanged.
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
const CHROME = "#9aa4b2";
const STEEL = "#8a94a2";
const STEEL_DARK = "#5a6470";

/** Chamber half-extents (rectangular glass box interior). */
const CH_W = 1.35;
const CH_D = 1.05;
const CH_H = 2.55;
const FLOOR_Y = -1.15;
const CEIL_Y = FLOOR_Y + CH_H;

export interface ClawSceneProps {
  phase: ClawPhase;
  clawX: number;
}

export const CABINET_SHELL_MODE = "hollow-open-front" as const;
export const CLAW_BLADES = CLAW_FINGER_COUNT;
/** Rectangular industrial vault — not arcade cylinder. */
export const MACHINE_STYLE = "industrial-rect-vault" as const;

function useSlipped(phase: ClawPhase) {
  const slipped = useRef(false);
  slipped.current = updateSlippedLatch(phase, slipped.current);
  return slipped.current;
}

/** Clamp claw X inside rectangular chamber glass. */
function mapClawX(pct: number) {
  return ((Math.min(86, Math.max(14, pct)) - 50) / 36) * (CH_W * 0.55);
}

function targetClawY(phase: ClawPhase) {
  switch (phase) {
    case "drop":
    case "close":
      return 0.12;
    case "lift":
    case "hold":
    case "win":
      return 0.58;
    case "slip":
      return 0.3;
    case "return":
    case "lose":
      return 0.52;
    default:
      return 0.58;
  }
}

function metal(c: string, m = 0.92, r = 0.22) {
  return { color: c, metalness: m, roughness: r } as const;
}

function carbonMat() {
  return { color: CARBON, metalness: 0.55, roughness: 0.62 } as const;
}

function NeonEdge({
  position,
  size,
  color,
  intensity = 1.4,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  intensity?: number;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={intensity}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Reinforced glass panel (physical material, dark glass). */
function GlassPanel({
  position,
  rotation = [0, 0, 0],
  size,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  size: [number, number];
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshPhysicalMaterial
        color="#1a2838"
        metalness={0.05}
        roughness={0.08}
        transmission={0.78}
        thickness={0.85}
        transparent
        opacity={0.38}
        ior={1.48}
        side={THREE.DoubleSide}
        depthWrite={false}
        clearcoat={1}
        clearcoatRoughness={0.06}
        envMapIntensity={1.6}
      />
    </mesh>
  );
}

/** FIATCLAW ARCADE brand plate on metal structure. */
function BrandPlate({
  position,
  rotation = [0, 0, 0],
  width = 2.4,
  height = 0.55,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  width?: number;
  height?: number;
}) {
  const map = useTexture("/refs/sign-fiatclaw-arcade.png");
  useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
  }, [map]);
  return (
    <mesh
      position={position}
      rotation={rotation}
      renderOrder={3}
      userData={{ signage: "FIATCLAW ARCADE" }}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={map}
        transparent
        alphaTest={0.06}
        toneMapped={false}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Massive rectangular industrial vault shell.
 * Thick corner pillars + glass panels — NO circular arcade cylinder.
 */
function VaultShell() {
  const pulse = useRef(0);
  const brandGlow = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((_, dt) => {
    pulse.current += dt;
    if (brandGlow.current) {
      brandGlow.current.emissiveIntensity =
        1.1 + Math.sin(pulse.current * 1.3) * 0.35;
    }
  });

  const pillar = 0.22;
  const frameW = CH_W * 2 + pillar * 2.2;
  const frameD = CH_D * 2 + pillar * 1.6;
  const frameH = CH_H + 0.55;
  const midY = FLOOR_Y + CH_H * 0.5;

  const corners: [number, number][] = [
    [-CH_W - pillar * 0.35, -CH_D - pillar * 0.2],
    [CH_W + pillar * 0.35, -CH_D - pillar * 0.2],
    [-CH_W - pillar * 0.35, CH_D + pillar * 0.2],
    [CH_W + pillar * 0.35, CH_D + pillar * 0.2],
  ];

  return (
    <group
      userData={{
        shell: "industrial-rect-vault",
        style: MACHINE_STYLE,
        chamber: "reinforced-glass-panels",
      }}
    >
      {/* === HEAVY BASE / VAULT FLOOR COMPARTMENT === */}
      <mesh position={[0, FLOOR_Y - 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[frameW + 0.45, 0.42, frameD + 0.4]} />
        <meshStandardMaterial {...metal(TITANIUM, 0.95, 0.24)} />
      </mesh>
      <mesh position={[0, FLOOR_Y - 0.14, 0]} castShadow>
        <boxGeometry args={[frameW + 0.15, 0.14, frameD + 0.12]} />
        <meshStandardMaterial {...carbonMat()} />
      </mesh>
      {/* Base neon accent edges only */}
      <NeonEdge
        position={[0, FLOOR_Y - 0.08, frameD * 0.5 + 0.05]}
        size={[frameW * 0.92, 0.018, 0.02]}
        color={RED}
        intensity={1.5}
      />
      <NeonEdge
        position={[0, FLOOR_Y - 0.08, -frameD * 0.5 - 0.05]}
        size={[frameW * 0.92, 0.018, 0.02]}
        color={CYAN}
        intensity={1.3}
      />

      {/* Inner floor plate */}
      <mesh position={[0, FLOOR_Y + 0.02, 0]} receiveShadow>
        <boxGeometry args={[CH_W * 2 - 0.08, 0.06, CH_D * 2 - 0.08]} />
        <meshStandardMaterial {...metal("#06080c", 0.8, 0.4)} />
      </mesh>
      {/* Floor grid etch — subtle cyan, not flood */}
      <mesh position={[0, FLOOR_Y + 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CH_W * 1.7, CH_D * 1.5]} />
        <meshStandardMaterial
          color="#04060a"
          emissive={CYAN}
          emissiveIntensity={0.12}
          metalness={0.7}
          roughness={0.55}
        />
      </mesh>

      {/* === CORNER PILLARS (thick structural — readable gunmetal) === */}
      {corners.map(([x, z], i) => (
        <group key={`pillar-${i}`}>
          <mesh position={[x, midY, z]} castShadow>
            <boxGeometry args={[pillar * 1.15, frameH, pillar * 1.15]} />
            <meshStandardMaterial
              color="#2a323e"
              metalness={0.9}
              roughness={0.28}
              emissive="#121820"
              emissiveIntensity={0.25}
            />
          </mesh>
          {/* Carbon insert face */}
          <mesh
            position={[
              x + (x > 0 ? -pillar * 0.4 : pillar * 0.4),
              midY,
              z + (z > 0 ? -pillar * 0.4 : pillar * 0.4),
            ]}
            castShadow
          >
            <boxGeometry args={[pillar * 0.5, frameH * 0.88, pillar * 0.5]} />
            <meshStandardMaterial {...carbonMat()} />
          </mesh>
          {/* Front-facing armor plate so pillars read in hero view */}
          {z > 0 && (
            <mesh position={[x, midY, z + pillar * 0.55]} castShadow>
              <boxGeometry args={[pillar * 0.9, frameH * 0.95, 0.04]} />
              <meshStandardMaterial
                color="#3a4454"
                metalness={0.88}
                roughness={0.3}
                emissive="#1a222e"
                emissiveIntensity={0.3}
              />
            </mesh>
          )}
          {/* Vertical neon edge accent */}
          <NeonEdge
            position={[
              x * 1.02,
              midY,
              z > 0 ? z + pillar * 0.55 : z - pillar * 0.15,
            ]}
            size={[0.025, frameH * 0.92, 0.025]}
            color={i % 2 === 0 ? RED : CYAN}
            intensity={1.55}
          />
          {/* Bolt plates */}
          {[-0.55, 0, 0.55].map((oy) => (
            <mesh
              key={oy}
              position={[x, midY + oy * (frameH * 0.35), z]}
              castShadow
            >
              <boxGeometry args={[pillar * 1.35, 0.07, pillar * 1.35]} />
              <meshStandardMaterial
                color="#4a5464"
                metalness={0.9}
                roughness={0.28}
                emissive="#1c2430"
                emissiveIntensity={0.2}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* === HORIZONTAL BEAMS (top / mid / bottom) === */}
      {[FLOOR_Y + 0.08, midY, CEIL_Y - 0.05].map((y, i) => (
        <group key={`beam-${i}`}>
          {/* Front / back beams */}
          <mesh position={[0, y, CH_D + pillar * 0.15]} castShadow>
            <boxGeometry args={[frameW - pillar * 0.3, 0.1, 0.12]} />
            <meshStandardMaterial {...metal(GUNMETAL, 0.93, 0.22)} />
          </mesh>
          <mesh position={[0, y, -CH_D - pillar * 0.15]} castShadow>
            <boxGeometry args={[frameW - pillar * 0.3, 0.1, 0.12]} />
            <meshStandardMaterial {...metal(GUNMETAL, 0.93, 0.22)} />
          </mesh>
          {/* Side beams */}
          <mesh position={[CH_W + pillar * 0.15, y, 0]} castShadow>
            <boxGeometry args={[0.12, 0.1, frameD - pillar * 0.3]} />
            <meshStandardMaterial {...metal(GUNMETAL, 0.93, 0.22)} />
          </mesh>
          <mesh position={[-CH_W - pillar * 0.15, y, 0]} castShadow>
            <boxGeometry args={[0.12, 0.1, frameD - pillar * 0.3]} />
            <meshStandardMaterial {...metal(GUNMETAL, 0.93, 0.22)} />
          </mesh>
        </group>
      ))}

      {/* === REINFORCED GLASS PANELS (flat, not cylinder) === */}
      {/* Front glass */}
      <GlassPanel
        position={[0, midY, CH_D - 0.02]}
        size={[CH_W * 1.92, CH_H * 0.92]}
      />
      {/* Back glass */}
      <GlassPanel
        position={[0, midY, -CH_D + 0.02]}
        size={[CH_W * 1.92, CH_H * 0.92]}
      />
      {/* Left glass */}
      <GlassPanel
        position={[-CH_W + 0.02, midY, 0]}
        rotation={[0, Math.PI / 2, 0]}
        size={[CH_D * 1.85, CH_H * 0.92]}
      />
      {/* Right glass */}
      <GlassPanel
        position={[CH_W - 0.02, midY, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        size={[CH_D * 1.85, CH_H * 0.92]}
      />

      {/* Dark rear armor panel for depth */}
      <mesh position={[0, midY, -CH_D + 0.08]} castShadow>
        <boxGeometry args={[CH_W * 1.7, CH_H * 0.75, 0.06]} />
        <meshStandardMaterial {...carbonMat()} />
      </mesh>

      {/* === HEAVY TOP GANTRY / CROWN === */}
      <mesh position={[0, CEIL_Y + 0.18, 0]} castShadow>
        <boxGeometry args={[frameW + 0.1, 0.28, frameD + 0.08]} />
        <meshStandardMaterial {...metal(TITANIUM, 0.95, 0.18)} />
      </mesh>
      <mesh position={[0, CEIL_Y + 0.18, 0]} castShadow>
        <boxGeometry args={[frameW - 0.15, 0.14, frameD - 0.12]} />
        <meshStandardMaterial {...carbonMat()} />
      </mesh>
      {/* Top dome housings (motors) — cylinderGeometry used only for machinery */}
      {[-0.55, 0.55].map((ox) => (
        <mesh key={ox} position={[ox, CEIL_Y + 0.42, -0.15]} castShadow>
          <cylinderGeometry args={[0.18, 0.2, 0.22, 20]} />
          <meshStandardMaterial {...metal(GUNMETAL, 0.92, 0.24)} />
        </mesh>
      ))}
      <mesh position={[0, CEIL_Y + 0.48, 0.2]} castShadow>
        <cylinderGeometry args={[0.14, 0.16, 0.18, 18]} />
        <meshStandardMaterial {...metal(STEEL_DARK, 0.9, 0.26)} />
      </mesh>

      {/* Front brand marquee integrated into metal */}
      <mesh position={[0, CEIL_Y + 0.05, CH_D + 0.12]} castShadow>
        <boxGeometry args={[2.85, 0.72, 0.14]} />
        <meshStandardMaterial {...metal("#080a10", 0.92, 0.22)} />
      </mesh>
      <mesh position={[0, CEIL_Y + 0.05, CH_D + 0.2]}>
        <boxGeometry args={[2.7, 0.58, 0.02]} />
        <meshStandardMaterial
          ref={brandGlow}
          color={RED}
          emissive={RED}
          emissiveIntensity={1.2}
          toneMapped={false}
          transparent
          opacity={0.25}
        />
      </mesh>
      <BrandPlate
        position={[0, CEIL_Y + 0.05, CH_D + 0.24]}
        width={2.55}
        height={0.62}
      />
      <NeonEdge
        position={[0, CEIL_Y - 0.28, CH_D + 0.18]}
        size={[2.7, 0.02, 0.025]}
        color={CYAN}
        intensity={1.6}
      />
      <NeonEdge
        position={[0, CEIL_Y + 0.38, CH_D + 0.18]}
        size={[2.7, 0.02, 0.025]}
        color={RED}
        intensity={1.7}
      />

      {/* Side brand plates */}
      <BrandPlate
        position={[-CH_W - pillar * 0.55, midY + 0.35, 0.2]}
        rotation={[0, Math.PI / 2, 0]}
        width={1.15}
        height={0.32}
      />
      <BrandPlate
        position={[CH_W + pillar * 0.55, midY + 0.35, 0.2]}
        rotation={[0, -Math.PI / 2, 0]}
        width={1.15}
        height={0.32}
      />

      {/* Ceiling interior rail mount plate */}
      <mesh position={[0, CEIL_Y - 0.08, 0]} castShadow>
        <boxGeometry args={[CH_W * 1.85, 0.08, CH_D * 1.5]} />
        <meshStandardMaterial {...metal("#0c1016", 0.9, 0.28)} />
      </mesh>

      <InteriorFog />
      <FloatingParticles />
    </group>
  );
}

function InteriorFog() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 160;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const cRed = new THREE.Color(RED);
    const cCyan = new THREE.Color(CYAN);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * CH_W * 1.7;
      pos[i * 3 + 1] = FLOOR_Y + 0.15 + Math.random() * (CH_H * 0.85);
      pos[i * 3 + 2] = (Math.random() - 0.5) * CH_D * 1.6;
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
      arr[i + 1]! += 0.0025;
      if (arr[i + 1]! > CEIL_Y - 0.2) arr[i + 1] = FLOOR_Y + 0.2;
    }
    ref.current.geometry.attributes.position!.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.04}
        vertexColors
        transparent
        opacity={0.22}
        depthWrite={false}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function FloatingParticles() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 70;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * CH_W * 1.6;
      pos[i * 3 + 1] = FLOOR_Y + Math.random() * CH_H;
      pos[i * 3 + 2] = (Math.random() - 0.5) * CH_D * 1.5;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((s) => {
    if (!ref.current) return;
    ref.current.rotation.y = s.clock.elapsedTime * 0.03;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.022}
        color={CYAN}
        transparent
        opacity={0.35}
        depthWrite={false}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function PrizePile({ phase }: { phase: ClawPhase }) {
  const layout = useMemo(() => buildPrizePileLayout(42), []);
  const dim = phase === "win" ? 0.35 : 1;
  return (
    <group
      position={[0, FLOOR_Y + 0.06, 0]}
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
 * Heavy industrial claw blade — machined metal + hydraulics.
 * Capsule radii keep test markers (0.022 / 0.02); mass from length + plates.
 */
function MetalBlade({
  fingerRef,
  yaw,
}: {
  fingerRef: React.MutableRefObject<THREE.Group | null>;
  yaw: number;
}) {
  const steel = {
    color: "#b8c0cc",
    metalness: 0.88,
    roughness: 0.26,
    emissive: "#1e2634",
    emissiveIntensity: 0.4,
  } as const;
  return (
    <group rotation={[0, yaw, 0]}>
      <group ref={fingerRef as React.Ref<THREE.Group>} position={[0.1, 0, 0]}>
        {/* Shoulder / hinge block */}
        <mesh position={[0.04, 0.02, 0]} castShadow>
          <boxGeometry args={[0.12, 0.1, 0.09]} />
          <meshStandardMaterial
            color="#8a94a4"
            metalness={0.88}
            roughness={0.26}
            emissive="#1c2430"
            emissiveIntensity={0.35}
          />
        </mesh>
        {/* Hydraulic actuator body */}
        <mesh position={[0.08, -0.02, 0.05]} rotation={[0, 0, 0.35]} castShadow>
          <cylinderGeometry args={[0.022, 0.024, 0.16, 12]} />
          <meshStandardMaterial color="#6a7484" metalness={0.9} roughness={0.24} />
        </mesh>
        <mesh position={[0.08, -0.02, -0.05]} rotation={[0, 0, 0.35]} castShadow>
          <cylinderGeometry args={[0.022, 0.024, 0.16, 12]} />
          <meshStandardMaterial color="#6a7484" metalness={0.9} roughness={0.24} />
        </mesh>
        {/* Piston rod */}
        <mesh position={[0.14, -0.1, 0.05]} rotation={[0, 0, 0.5]} castShadow>
          <cylinderGeometry args={[0.01, 0.01, 0.12, 10]} />
          <meshStandardMaterial color="#c0c8d4" metalness={0.92} roughness={0.18} />
        </mesh>
        {/* Upper arm — test: 0.022 */}
        <mesh position={[0.12, -0.12, 0]} rotation={[0, 0, 0.55]} castShadow>
          <capsuleGeometry args={[0.022, 0.18, 6, 16]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        {/* Armor plate on arm */}
        <mesh position={[0.13, -0.12, 0.03]} rotation={[0, 0, 0.55]} castShadow>
          <boxGeometry args={[0.05, 0.16, 0.02]} />
          <meshStandardMaterial {...metal(STEEL_DARK, 0.9, 0.3)} />
        </mesh>
        {/* Knuckle joint */}
        <mesh position={[0.2, -0.28, 0]} castShadow>
          <sphereGeometry args={[0.048, 18, 18]} />
          <meshStandardMaterial color="#c4ccd6" metalness={0.9} roughness={0.22} />
        </mesh>
        <mesh position={[0.2, -0.28, 0]} rotation={[Math.PI / 2, 0, 0.2]}>
          <torusGeometry args={[0.055, 0.012, 10, 24]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.0}
            toneMapped={false}
          />
        </mesh>
        {/* Mid C-curve — test: 0.02 */}
        <mesh position={[0.24, -0.45, 0]} rotation={[0, 0, 1.1]} castShadow>
          <capsuleGeometry args={[0.02, 0.18, 6, 16]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        {/* Grip tip — heavy industrial */}
        <mesh position={[0.2, -0.62, 0.02]} rotation={[0.3, 0, 1.45]} castShadow>
          <capsuleGeometry args={[0.018, 0.12, 5, 14]} />
          <meshStandardMaterial
            color="#9aa4b2"
            metalness={0.88}
            roughness={0.28}
            emissive="#1a2030"
            emissiveIntensity={0.3}
          />
        </mesh>
        {/* Serrated pad */}
        <mesh position={[0.18, -0.68, 0.04]} rotation={[0.4, 0, 1.5]} castShadow>
          <boxGeometry args={[0.04, 0.08, 0.025]} />
          <meshStandardMaterial {...metal("#4a5464", 0.85, 0.35)} />
        </mesh>
        {/* Red edge accent */}
        <mesh position={[0.23, -0.45, 0.032]} rotation={[0, 0, 1.1]}>
          <boxGeometry args={[0.014, 0.16, 0.008]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.7}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Industrial overhead rail + heavy 3-blade robotic claw.
 * Contained inside rectangular glass chamber at all times.
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
  const cableScale = useRef(0.42);
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
      phase === "drop" ? 3.2 : 5,
      dt
    );

    if (phase === "idle" || phase === "ready") {
      group.current.rotation.z = Math.sin(idleT.current * 0.65) * 0.012;
      if (motorGroup.current) {
        motorGroup.current.rotation.y =
          Math.sin(idleT.current * 0.32) * 0.035;
      }
    } else {
      group.current.rotation.z = THREE.MathUtils.damp(
        group.current.rotation.z,
        0,
        6,
        dt
      );
    }

    const openAng = open ? 0.42 : 0.07;
    for (const fr of [f0, f1, f2]) {
      if (fr.current) {
        fr.current.rotation.z = THREE.MathUtils.damp(
          fr.current.rotation.z,
          openAng,
          10,
          dt
        );
      }
    }

    const targetCable =
      phase === "drop" || phase === "close"
        ? 0.78
        : phase === "slip"
          ? 0.5
          : 0.32;
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
        prize.current.position.set(0, -0.55, 0.02);
      } else if (phase === "slip" || phase === "lose") {
        prize.current.visible = true;
        fall.current += dt * 2.3;
        prize.current.position.y = -0.55 - fall.current;
        if (fall.current > 1.5) prize.current.visible = false;
      } else {
        prize.current.visible = false;
        fall.current = 0;
      }
    }
  });

  const baseCable = 0.78;

  return (
    <group
      ref={group}
      position={[0, 0.45, 0]}
      scale={1.55}
      userData={{
        clawBlades: CLAW_BLADES,
        style: "solid-metal-3blade",
        containment: "inside-glass-chamber",
        maxTravelX: CH_W * 0.55,
      }}
    >
      {/* Overhead industrial rail carriage */}
      <mesh position={[0, 0.52, 0]} castShadow>
        <boxGeometry args={[0.7, 0.18, 0.38]} />
        <meshStandardMaterial {...metal(TITANIUM, 0.94, 0.2)} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <boxGeometry args={[0.62, 0.1, 0.32]} />
        <meshStandardMaterial {...carbonMat()} />
      </mesh>
      {/* Cross rail (not piercing glass — width within chamber) */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[1.55, 0.08, 0.14]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.92, 0.24)} />
      </mesh>
      <NeonEdge
        position={[0, 0.67, 0]}
        size={[1.5, 0.016, 0.04]}
        color={CYAN}
        intensity={1.5}
      />
      {[-0.72, 0.72].map((sx) => (
        <mesh key={sx} position={[sx, 0.62, 0]} castShadow>
          <boxGeometry args={[0.1, 0.12, 0.16]} />
          <meshStandardMaterial {...metal(TITANIUM_MID, 0.93, 0.22)} />
        </mesh>
      ))}

      {/* Winch drum */}
      <mesh position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.12, 18]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.92, 0.24)} />
      </mesh>
      <mesh position={[0, 0.38, 0.07]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.085, 0.01, 8, 20]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>

      {/* Steel cables */}
      <mesh
        position={[0, 0.3 - (baseCable * cableScale.current) / 2, 0]}
        scale={[1, cableScale.current, 1]}
      >
        <cylinderGeometry args={[0.02, 0.016, baseCable, 12]} />
        <meshStandardMaterial color="#2a2e34" metalness={0.94} roughness={0.28} />
      </mesh>
      {[-0.035, 0.035].map((ox) => (
        <mesh
          key={ox}
          position={[ox, 0.3 - (baseCable * cableScale.current) / 2, 0.02]}
          scale={[1, cableScale.current, 1]}
        >
          <cylinderGeometry args={[0.007, 0.006, baseCable, 8]} />
          <meshStandardMaterial color="#3a4048" metalness={0.9} roughness={0.32} />
        </mesh>
      ))}

      {/* Motor housing + 3 blades */}
      <group
        ref={motorGroup}
        position={[0, 0.3 - baseCable * cableScale.current - 0.09, 0]}
        userData={{ fingers: CLAW_BLADES, motor: true }}
      >
        <mesh position={[0, 0.14, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.07, 0.1, 18]} />
          <meshStandardMaterial
            color="#8a94a4"
            metalness={0.9}
            roughness={0.24}
            emissive="#202838"
            emissiveIntensity={0.35}
          />
        </mesh>
        <mesh castShadow>
          <cylinderGeometry args={[0.19, 0.2, 0.32, 36]} />
          <meshStandardMaterial {...carbonMat()} />
        </mesh>
        <mesh castShadow>
          <cylinderGeometry args={[0.17, 0.18, 0.26, 36]} />
          <meshStandardMaterial
            color="#6a7484"
            metalness={0.88}
            roughness={0.26}
            emissive="#1a2230"
            emissiveIntensity={0.4}
          />
        </mesh>
        {/* Gear ring (visual) */}
        <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.175, 0.02, 10, 28]} />
          <meshStandardMaterial {...metal(STEEL, 0.9, 0.25)} />
        </mesh>
        {/* Red neon collars */}
        <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.2, 0.018, 12, 40]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.2}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, -0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.205, 0.014, 12, 40]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.9}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.165, 0.01, 10, 32]} />
          <meshStandardMaterial
            color={CYAN}
            emissive={CYAN}
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
        {/* Side hydraulic tanks */}
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            position={[s * 0.15, 0.02, 0.12]}
            rotation={[0.25, 0, s * 0.12]}
            castShadow
          >
            <cylinderGeometry args={[0.04, 0.042, 0.2, 14]} />
            <meshStandardMaterial
              color="#5a6474"
              metalness={0.9}
              roughness={0.26}
              emissive="#1a2030"
              emissiveIntensity={0.25}
            />
          </mesh>
        ))}
        {/* Reducer + pivot */}
        <mesh position={[0, -0.22, 0]} castShadow>
          <cylinderGeometry args={[0.13, 0.1, 0.1, 28]} />
          <meshStandardMaterial
            color="#8a94a4"
            metalness={0.88}
            roughness={0.28}
            emissive="#202830"
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0, -0.32, 0]} castShadow>
          <sphereGeometry args={[0.08, 24, 24]} />
          <meshStandardMaterial
            color="#d0d6e0"
            metalness={0.88}
            roughness={0.2}
            emissive="#3a4454"
            emissiveIntensity={0.45}
          />
        </mesh>

        <group position={[0, -0.32, 0]}>
          <MetalBlade fingerRef={f0} yaw={-0.95} />
          <MetalBlade fingerRef={f1} yaw={0.95} />
          <MetalBlade fingerRef={f2} yaw={Math.PI} />
          {/* Accent lights only — red + cyan */}
          <pointLight
            position={[0.22, -0.18, 0.4]}
            intensity={2.8}
            color={CYAN}
            distance={2.0}
          />
          <pointLight
            position={[-0.22, -0.22, 0.35]}
            intensity={2.6}
            color={RED}
            distance={1.9}
          />
          <pointLight
            position={[0, -0.4, 0.45]}
            intensity={2.0}
            color={CYAN}
            distance={1.6}
          />
          <group ref={prize} visible={false}>
            <PrizeMeshByKind kind="fiatclaw_token" scale={hold ? 1.2 : 1.0} />
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
    const n = 100;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.6;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((s) => {
    if (!ref.current || !active) return;
    ref.current.rotation.y = s.clock.elapsedTime * 2;
    ref.current.scale.setScalar(1.2 + Math.sin(s.clock.elapsedTime * 5) * 0.15);
  });
  if (!active) return null;
  return (
    <points ref={ref} position={[0, 0.5, 0.5]} geometry={geo}>
      <pointsMaterial
        size={0.035}
        color={GOLD}
        transparent
        opacity={0.85}
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
      cam.position.x = Math.sin(t.current * 0.1) * 0.1;
      cam.position.y = 0.28 + Math.sin(t.current * 0.09) * 0.04;
    }
    if (phase === "win") {
      cam.position.z = THREE.MathUtils.damp(cam.position.z, 6.6, 2.5, dt);
      if (root.current) {
        root.current.position.x = Math.sin(performance.now() * 0.04) * 0.02;
      }
    } else if (phase === "lose" || phase === "slip") {
      cam.position.z = THREE.MathUtils.damp(cam.position.z, 7.3, 2, dt);
    } else {
      cam.position.z = THREE.MathUtils.damp(cam.position.z, 7.0, 1.5, dt);
    }
    // Frame full industrial vault: pillars, glass, claw, dense floor
    cam.lookAt(0, 0.15, 0);
    if (root.current && idle) {
      root.current.rotation.y = Math.sin(t.current * 0.08) * 0.025;
    }
  });

  return (
    <>
      <color attach="background" args={["#020406"]} />
      <fog attach="fog" args={["#020406", 9, 24]} />

      {/* Accent lighting: red + cyan only — no white flood; frame still reads gunmetal */}
      <ambientLight intensity={0.18} color="#0a121c" />
      <directionalLight
        position={[3.5, 5.5, 3.5]}
        intensity={0.42}
        color={CYAN}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-3.2, 3.5, 2.2]} intensity={0.36} color={RED} />
      <pointLight position={[-2.2, 1.4, 2.6]} intensity={1.6} color={CYAN} />
      <pointLight position={[2.2, 1.3, 2.6]} intensity={1.7} color={RED} />
      <pointLight position={[0, 1.6, 1.8]} intensity={1.2} color={CYAN} />
      <pointLight position={[0, 0.15, 1.7]} intensity={1.15} color={RED} />
      <pointLight position={[0, -0.55, 0.7]} intensity={0.65} color={CYAN} />
      <pointLight position={[0, 1.85, 2.0]} intensity={1.35} color={RED} distance={5} />
      {/* Pillar edge key so structure is not lost in silhouette */}
      <pointLight position={[-1.7, 0.2, 1.4]} intensity={0.9} color={CYAN} distance={3.5} />
      <pointLight position={[1.7, 0.2, 1.4]} intensity={0.9} color={RED} distance={3.5} />
      <spotLight
        position={[0, 3.4, 2.6]}
        angle={0.44}
        penumbra={0.75}
        intensity={1.0}
        color={CYAN}
      />
      <spotLight
        position={[0, 1.2, -1.6]}
        angle={0.5}
        penumbra={0.8}
        intensity={0.7}
        color={RED}
      />

      <group ref={root}>
        <VaultShell />
        <PrizePile phase={phase} />
        <ClawAssembly phase={phase} clawX={clawX} />
        <WinBurst active={phase === "win"} />
      </group>

      <ContactShadows
        position={[0, FLOOR_Y - 0.55, 0]}
        opacity={0.9}
        scale={16}
        blur={2.4}
        far={8}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.45}
          luminanceThreshold={0.75}
          luminanceSmoothing={0.42}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
