"use client";

/**
 * FIATCLAW VAULT — industrial crypto vault design language
 * (reference board: rectangular armored bank-vault machine, NOT arcade cylinder).
 * Visual only — claw phases, prize logic, containment hooks unchanged.
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
const TITANIUM_MID = "#161b24";
const CARBON = "#0c0e12";
const GUNMETAL = "#242a34";
const STEEL = "#8a94a2";
const STEEL_DARK = "#5a6470";
const BRUSHED = "#6a7484";

/** Interior chamber half-size (glass box). */
const HW = 1.45;
const HD = 1.15;
const CH_H = 2.4;
const FLOOR_Y = -1.05;
const CEIL_Y = FLOOR_Y + CH_H;
const MID_Y = FLOOR_Y + CH_H * 0.5;

export interface ClawSceneProps {
  phase: ClawPhase;
  clawX: number;
}

export const CABINET_SHELL_MODE = "hollow-open-front" as const;
export const CLAW_BLADES = CLAW_FINGER_COUNT;
export const MACHINE_STYLE = "industrial-rect-vault" as const;

function useSlipped(phase: ClawPhase) {
  const slipped = useRef(false);
  slipped.current = updateSlippedLatch(phase, slipped.current);
  return slipped.current;
}

function mapClawX(pct: number) {
  return ((Math.min(86, Math.max(14, pct)) - 50) / 36) * (HW * 0.52);
}

function targetClawY(phase: ClawPhase) {
  switch (phase) {
    case "drop":
    case "close":
      return -0.05; // descend to prize field
    case "lift":
    case "hold":
    case "win":
      return 0.72; // raised clear of pile
    case "slip":
      return 0.35;
    case "return":
    case "lose":
      return 0.68;
    default:
      return 0.78; // idle: hang mid-chamber so 3 blades read (reference)
  }
}

function metal(c: string, m = 0.92, r = 0.24) {
  return { color: c, metalness: m, roughness: r } as const;
}

function carbonMat() {
  return { color: CARBON, metalness: 0.5, roughness: 0.65 } as const;
}

function Neon({
  position,
  size,
  color,
  intensity = 1.5,
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

function ArmorPlate({
  position,
  size,
  rotation = [0, 0, 0],
  color = GUNMETAL,
}: {
  position: [number, number, number];
  size: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        metalness={0.9}
        roughness={0.3}
        emissive="#0a1018"
        emissiveIntensity={0.15}
      />
    </mesh>
  );
}

function BoltRow({
  y,
  z,
  xs,
}: {
  y: number;
  z: number;
  xs: number[];
}) {
  return (
    <group>
      {xs.map((x) => (
        <mesh key={x} position={[x, y, z]} castShadow>
          <cylinderGeometry args={[0.028, 0.028, 0.04, 10]} />
          <meshStandardMaterial {...metal(STEEL_DARK, 0.9, 0.3)} />
        </mesh>
      ))}
    </group>
  );
}

function GlassPanel({
  position,
  rotation = [0, 0, 0],
  w,
  h,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  w: number;
  h: number;
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[w, h]} />
      <meshPhysicalMaterial
        color="#1a3048"
        metalness={0.05}
        roughness={0.04}
        transmission={0.88}
        thickness={1.1}
        transparent
        opacity={0.28}
        ior={1.5}
        side={THREE.DoubleSide}
        depthWrite={false}
        clearcoat={1}
        clearcoatRoughness={0.04}
        envMapIntensity={2.2}
        reflectivity={0.75}
      />
    </mesh>
  );
}

function BrandSign({
  position,
  rotation = [0, 0, 0],
  width = 2.6,
  height = 0.58,
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
      renderOrder={4}
      userData={{ signage: "FIATCLAW ARCADE" }}
    >
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

/**
 * Massive armored rectangular vault — design language from FIATCLAW VAULT board.
 * Layered titanium panels, thick pillars, reinforced glass, industrial top unit.
 */
function VaultShell() {
  const t = useRef(0);
  const brandGlow = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((_, dt) => {
    t.current += dt;
    if (brandGlow.current) {
      brandGlow.current.emissiveIntensity =
        1.15 + Math.sin(t.current * 1.25) * 0.3;
    }
  });

  const outerW = HW * 2 + 1.05;
  const outerD = HD * 2 + 0.85;
  const outerH = CH_H + 1.05;
  const pillar = 0.34;

  const corners: [number, number][] = [
    [-(HW + 0.22), -(HD + 0.12)],
    [HW + 0.22, -(HD + 0.12)],
    [-(HW + 0.22), HD + 0.12],
    [HW + 0.22, HD + 0.12],
  ];

  return (
    <group
      userData={{
        shell: "industrial-rect-vault",
        style: MACHINE_STYLE,
        chamber: "reinforced-glass-panels",
      }}
    >
      {/* ── HEAVY VAULT BASE ── */}
      <mesh position={[0, FLOOR_Y - 0.48, 0]} castShadow receiveShadow>
        <boxGeometry args={[outerW + 0.55, 0.5, outerD + 0.5]} />
        <meshStandardMaterial {...metal(TITANIUM, 0.94, 0.26)} />
      </mesh>
      <mesh position={[0, FLOOR_Y - 0.2, 0]} castShadow>
        <boxGeometry args={[outerW + 0.25, 0.16, outerD + 0.22]} />
        <meshStandardMaterial {...carbonMat()} />
      </mesh>
      {/* Base skirt armor */}
      <ArmorPlate
        position={[0, FLOOR_Y - 0.12, outerD * 0.5 + 0.02]}
        size={[outerW + 0.1, 0.18, 0.1]}
        color="#1a2030"
      />
      <Neon
        position={[0, FLOOR_Y - 0.02, outerD * 0.5 + 0.08]}
        size={[outerW * 0.88, 0.02, 0.022]}
        color={RED}
        intensity={1.6}
      />
      <Neon
        position={[0, FLOOR_Y - 0.02, -outerD * 0.5 - 0.08]}
        size={[outerW * 0.88, 0.02, 0.022]}
        color={CYAN}
        intensity={1.4}
      />

      {/* Inner floor */}
      <mesh position={[0, FLOOR_Y + 0.03, 0]} receiveShadow>
        <boxGeometry args={[HW * 2 - 0.06, 0.08, HD * 2 - 0.06]} />
        <meshStandardMaterial {...metal("#05070c", 0.78, 0.42)} />
      </mesh>
      <mesh position={[0, FLOOR_Y + 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[HW * 1.85, HD * 1.65]} />
        <meshStandardMaterial
          color="#060a10"
          emissive={CYAN}
          emissiveIntensity={0.1}
          metalness={0.75}
          roughness={0.5}
        />
      </mesh>

      {/* ── CORNER PILLARS (thick structural) ── */}
      {corners.map(([x, z], i) => (
        <group key={`p-${i}`}>
          <mesh position={[x, MID_Y, z]} castShadow>
            <boxGeometry args={[pillar, outerH * 0.92, pillar]} />
            <meshStandardMaterial
              color="#2c3442"
              metalness={0.9}
              roughness={0.28}
              emissive="#121820"
              emissiveIntensity={0.22}
            />
          </mesh>
          {/* Layered armor sleeves */}
          {[-0.7, -0.25, 0.25, 0.7].map((oy) => (
            <mesh
              key={oy}
              position={[x, MID_Y + oy * (outerH * 0.28), z]}
              castShadow
            >
              <boxGeometry args={[pillar * 1.28, 0.1, pillar * 1.28]} />
              <meshStandardMaterial
                color="#3a4454"
                metalness={0.9}
                roughness={0.3}
                emissive="#1a222e"
                emissiveIntensity={0.2}
              />
            </mesh>
          ))}
          {/* Carbon face insert */}
          <mesh
            position={[
              x + (x > 0 ? -pillar * 0.38 : pillar * 0.38),
              MID_Y,
              z + (z > 0 ? -pillar * 0.38 : pillar * 0.38),
            ]}
            castShadow
          >
            <boxGeometry args={[pillar * 0.55, outerH * 0.75, pillar * 0.55]} />
            <meshStandardMaterial {...carbonMat()} />
          </mesh>
          {/* Front-facing armor for hero view */}
          {z > 0 && (
            <mesh position={[x, MID_Y, z + pillar * 0.55]} castShadow>
              <boxGeometry args={[pillar * 0.95, outerH * 0.88, 0.05]} />
              <meshStandardMaterial
                color="#3a4658"
                metalness={0.88}
                roughness={0.3}
                emissive="#1c2432"
                emissiveIntensity={0.28}
              />
            </mesh>
          )}
          <Neon
            position={[
              x * 1.01,
              MID_Y,
              z > 0 ? z + pillar * 0.58 : z - pillar * 0.2,
            ]}
            size={[0.028, outerH * 0.85, 0.028]}
            color={i % 2 === 0 ? RED : CYAN}
            intensity={1.55}
          />
        </group>
      ))}

      {/* ── HORIZONTAL REINFORCEMENT BEAMS ── */}
      {[FLOOR_Y + 0.12, MID_Y - 0.15, MID_Y + 0.55, CEIL_Y - 0.08].map(
        (y, i) => (
          <group key={`b-${i}`}>
            <ArmorPlate
              position={[0, y, HD + 0.08]}
              size={[outerW - pillar * 0.5, 0.12, 0.14]}
              color="#222a36"
            />
            <ArmorPlate
              position={[0, y, -(HD + 0.08)]}
              size={[outerW - pillar * 0.5, 0.12, 0.14]}
              color="#222a36"
            />
            <ArmorPlate
              position={[HW + 0.08, y, 0]}
              size={[0.14, 0.12, outerD - pillar * 0.5]}
              color="#222a36"
            />
            <ArmorPlate
              position={[-(HW + 0.08), y, 0]}
              size={[0.14, 0.12, outerD - pillar * 0.5]}
              color="#222a36"
            />
            {i === 0 || i === 3 ? (
              <Neon
                position={[0, y, HD + 0.16]}
                size={[outerW * 0.7, 0.018, 0.02]}
                color={i === 0 ? CYAN : RED}
                intensity={1.45}
              />
            ) : null}
          </group>
        )
      )}

      {/* Side armor wings (reference: layered side panels) */}
      <ArmorPlate
        position={[-(HW + 0.42), MID_Y - 0.1, 0.15]}
        size={[0.22, outerH * 0.7, outerD * 0.55]}
        color="#1a2030"
      />
      <ArmorPlate
        position={[HW + 0.42, MID_Y - 0.1, 0.15]}
        size={[0.22, outerH * 0.7, outerD * 0.55]}
        color="#1a2030"
      />
      {/* Side brand plate (left) */}
      <mesh position={[-(HW + 0.54), MID_Y + 0.15, 0.25]} castShadow>
        <boxGeometry args={[0.06, 0.95, 0.7]} />
        <meshStandardMaterial {...metal("#0c1016", 0.9, 0.28)} />
      </mesh>
      <BrandSign
        position={[-(HW + 0.58), MID_Y + 0.15, 0.25]}
        rotation={[0, Math.PI / 2, 0]}
        width={0.65}
        height={0.85}
      />
      <Neon
        position={[-(HW + 0.55), MID_Y + 0.15, 0.25]}
        size={[0.02, 0.9, 0.02]}
        color={RED}
        intensity={1.4}
      />

      {/* ── REINFORCED GLASS PANELS ── */}
      <GlassPanel position={[0, MID_Y, HD - 0.03]} w={HW * 1.9} h={CH_H * 0.88} />
      <GlassPanel
        position={[0, MID_Y, -(HD - 0.03)]}
        w={HW * 1.9}
        h={CH_H * 0.88}
      />
      <GlassPanel
        position={[-(HW - 0.03), MID_Y, 0]}
        rotation={[0, Math.PI / 2, 0]}
        w={HD * 1.85}
        h={CH_H * 0.88}
      />
      <GlassPanel
        position={[HW - 0.03, MID_Y, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        w={HD * 1.85}
        h={CH_H * 0.88}
      />

      {/* Back carbon armor wall */}
      <mesh position={[0, MID_Y, -(HD - 0.1)]} castShadow>
        <boxGeometry args={[HW * 1.75, CH_H * 0.72, 0.08]} />
        <meshStandardMaterial {...carbonMat()} />
      </mesh>
      {/* Subtle back edge accents only — no large glow slab */}
      <Neon
        position={[0, MID_Y + 0.55, -(HD - 0.12)]}
        size={[1.2, 0.02, 0.02]}
        color={RED}
        intensity={1.1}
      />
      <Neon
        position={[0, MID_Y - 0.35, -(HD - 0.12)]}
        size={[1.2, 0.02, 0.02]}
        color={CYAN}
        intensity={0.9}
      />

      {/* ── INDUSTRIAL TOP UNIT (heavy canopy) ── */}
      <mesh position={[0, CEIL_Y + 0.22, 0]} castShadow>
        <boxGeometry args={[outerW + 0.15, 0.36, outerD + 0.12]} />
        <meshStandardMaterial {...metal(TITANIUM, 0.95, 0.2)} />
      </mesh>
      <mesh position={[0, CEIL_Y + 0.22, 0]} castShadow>
        <boxGeometry args={[outerW - 0.2, 0.18, outerD - 0.18]} />
        <meshStandardMaterial {...carbonMat()} />
      </mesh>
      {/* Top armor plates */}
      <ArmorPlate
        position={[0, CEIL_Y + 0.42, 0]}
        size={[outerW * 0.7, 0.12, outerD * 0.55]}
        color="#1c2430"
      />
      {/* Motor pods (machinery cylinders only) */}
      {[-0.65, 0.65].map((ox) => (
        <group key={ox} position={[ox, CEIL_Y + 0.48, -0.2]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.2, 0.22, 0.28, 20]} />
            <meshStandardMaterial {...metal(GUNMETAL, 0.92, 0.24)} />
          </mesh>
          <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.18, 0.015, 8, 20]} />
            <meshStandardMaterial
              color={CYAN}
              emissive={CYAN}
              emissiveIntensity={1.3}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      {/* Center winch housing */}
      <mesh position={[0, CEIL_Y + 0.5, 0.15]} castShadow>
        <cylinderGeometry args={[0.16, 0.18, 0.24, 18]} />
        <meshStandardMaterial {...metal(STEEL_DARK, 0.9, 0.26)} />
      </mesh>
      <BoltRow
        y={CEIL_Y + 0.08}
        z={HD + 0.05}
        xs={[-1.1, -0.55, 0, 0.55, 1.1]}
      />

      {/* Front brand marquee — fully in view (below canopy lip) */}
      <mesh position={[0, CEIL_Y - 0.12, HD + 0.18]} castShadow>
        <boxGeometry args={[3.15, 0.92, 0.18]} />
        <meshStandardMaterial {...metal("#080a10", 0.92, 0.22)} />
      </mesh>
      <mesh position={[0, CEIL_Y - 0.12, HD + 0.28]}>
        <boxGeometry args={[3.0, 0.78, 0.02]} />
        <meshStandardMaterial
          ref={brandGlow}
          color={RED}
          emissive={RED}
          emissiveIntensity={1.1}
          toneMapped={false}
          transparent
          opacity={0.18}
        />
      </mesh>
      <BrandSign
        position={[0, CEIL_Y - 0.12, HD + 0.32]}
        width={2.95}
        height={0.82}
      />
      <Neon
        position={[0, CEIL_Y - 0.52, HD + 0.22]}
        size={[3.0, 0.025, 0.03]}
        color={CYAN}
        intensity={1.7}
      />
      <Neon
        position={[0, CEIL_Y + 0.28, HD + 0.22]}
        size={[3.0, 0.025, 0.03]}
        color={RED}
        intensity={1.8}
      />

      {/* Ceiling interior plate + rail mount */}
      <mesh position={[0, CEIL_Y - 0.06, 0]} castShadow>
        <boxGeometry args={[HW * 1.9, 0.1, HD * 1.7]} />
        <meshStandardMaterial {...metal("#0c1016", 0.9, 0.28)} />
      </mesh>
      {/* Overhead rail track (inside chamber) */}
      <mesh position={[0, CEIL_Y - 0.18, 0]} castShadow>
        <boxGeometry args={[HW * 1.65, 0.06, 0.12]} />
        <meshStandardMaterial {...metal(BRUSHED, 0.92, 0.22)} />
      </mesh>
      <Neon
        position={[0, CEIL_Y - 0.14, 0]}
        size={[HW * 1.6, 0.014, 0.04]}
        color={CYAN}
        intensity={1.35}
      />

      <InteriorFog />
      <FloatingParticles />
    </group>
  );
}

function InteriorFog() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 180;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const cRed = new THREE.Color(RED);
    const cCyan = new THREE.Color(CYAN);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * HW * 1.8;
      pos[i * 3 + 1] = FLOOR_Y + 0.2 + Math.random() * (CH_H * 0.8);
      pos[i * 3 + 2] = (Math.random() - 0.5) * HD * 1.7;
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
      arr[i + 1]! += 0.0022;
      if (arr[i + 1]! > CEIL_Y - 0.25) arr[i + 1] = FLOOR_Y + 0.25;
    }
    ref.current.geometry.attributes.position!.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.038}
        vertexColors
        transparent
        opacity={0.2}
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
    const n = 80;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * HW * 1.7;
      pos[i * 3 + 1] = FLOOR_Y + Math.random() * CH_H;
      pos[i * 3 + 2] = (Math.random() - 0.5) * HD * 1.6;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((s) => {
    if (!ref.current) return;
    ref.current.rotation.y = s.clock.elapsedTime * 0.028;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.02}
        color={CYAN}
        transparent
        opacity={0.32}
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
      position={[0, FLOOR_Y + 0.08, 0]}
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
 * Industrial claw blade — large hanging C-grabber readable from front.
 * Thick armor plates + hydraulics (reference claw close-up).
 * Test markers: capsuleGeometry 0.022 / 0.02.
 */
function MetalBlade({
  fingerRef,
  yaw,
}: {
  fingerRef: React.MutableRefObject<THREE.Group | null>;
  yaw: number;
}) {
  const steel = {
    color: "#d0d6e0",
    metalness: 0.86,
    roughness: 0.28,
    emissive: "#304050",
    emissiveIntensity: 0.55,
  } as const;
  return (
    <group rotation={[0, yaw, 0]}>
      {/* Open/close pivot at motor rim */}
      <group ref={fingerRef as React.Ref<THREE.Group>} position={[0.1, -0.04, 0]}>
        {/* Massive shoulder block */}
        <mesh position={[0.06, 0.02, 0]} castShadow>
          <boxGeometry args={[0.16, 0.14, 0.12]} />
          <meshStandardMaterial
            color="#a8b2c0"
            metalness={0.9}
            roughness={0.24}
            emissive="#243040"
            emissiveIntensity={0.45}
          />
        </mesh>
        {/* Hydraulics */}
        <mesh position={[0.1, -0.1, 0.05]} rotation={[0, 0, 0.5]} castShadow>
          <cylinderGeometry args={[0.03, 0.032, 0.24, 12]} />
          <meshStandardMaterial color="#8a94a4" metalness={0.92} roughness={0.22} />
        </mesh>
        <mesh position={[0.1, -0.1, -0.05]} rotation={[0, 0, 0.5]} castShadow>
          <cylinderGeometry args={[0.03, 0.032, 0.24, 12]} />
          <meshStandardMaterial color="#8a94a4" metalness={0.92} roughness={0.22} />
        </mesh>
        <mesh position={[0.18, -0.24, 0.05]} rotation={[0, 0, 0.75]} castShadow>
          <cylinderGeometry args={[0.014, 0.014, 0.2, 10]} />
          <meshStandardMaterial color="#e0e4ec" metalness={0.94} roughness={0.14} />
        </mesh>
        {/* Upper arm core — test 0.022 */}
        <mesh position={[0.16, -0.22, 0]} rotation={[0, 0, 0.7]} castShadow>
          <capsuleGeometry args={[0.022, 0.26, 6, 16]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        {/* Thick armor plate (visual mass — reference weight) */}
        <mesh position={[0.17, -0.22, 0.04]} rotation={[0, 0, 0.7]} castShadow>
          <boxGeometry args={[0.09, 0.28, 0.04]} />
          <meshStandardMaterial
            color="#6a7484"
            metalness={0.9}
            roughness={0.28}
            emissive="#1e2838"
            emissiveIntensity={0.4}
          />
        </mesh>
        <mesh position={[0.17, -0.22, -0.04]} rotation={[0, 0, 0.7]} castShadow>
          <boxGeometry args={[0.09, 0.28, 0.04]} />
          <meshStandardMaterial
            color="#6a7484"
            metalness={0.9}
            roughness={0.28}
            emissive="#1e2838"
            emissiveIntensity={0.4}
          />
        </mesh>
        {/* Knuckle */}
        <mesh position={[0.28, -0.48, 0]} castShadow>
          <sphereGeometry args={[0.07, 18, 18]} />
          <meshStandardMaterial color="#d8dce4" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[0.28, -0.48, 0]} rotation={[Math.PI / 2, 0, 0.35]}>
          <torusGeometry args={[0.082, 0.016, 10, 24]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.4}
            toneMapped={false}
          />
        </mesh>
        {/* Mid C-curve — test 0.02 */}
        <mesh position={[0.22, -0.72, 0]} rotation={[0, 0, 1.35]} castShadow>
          <capsuleGeometry args={[0.02, 0.28, 6, 16]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        <mesh position={[0.24, -0.72, 0.035]} rotation={[0, 0, 1.35]} castShadow>
          <boxGeometry args={[0.08, 0.3, 0.035]} />
          <meshStandardMaterial
            color="#7a8494"
            metalness={0.88}
            roughness={0.28}
            emissive="#203040"
            emissiveIntensity={0.4}
          />
        </mesh>
        {/* Tip curves inward to grab */}
        <mesh position={[0.06, -0.96, 0.02]} rotation={[0.25, 0, 1.85]} castShadow>
          <capsuleGeometry args={[0.018, 0.18, 5, 14]} />
          <meshStandardMaterial
            color="#c0c8d4"
            metalness={0.9}
            roughness={0.26}
            emissive="#1a2030"
            emissiveIntensity={0.4}
          />
        </mesh>
        <mesh position={[-0.02, -1.08, 0.04]} rotation={[0.4, 0, 2.0]} castShadow>
          <boxGeometry args={[0.06, 0.12, 0.04]} />
          <meshStandardMaterial {...metal("#4a5464", 0.85, 0.35)} />
        </mesh>
        {/* Red neon edge */}
        <mesh position={[0.26, -0.72, 0.05]} rotation={[0, 0, 1.35]}>
          <boxGeometry args={[0.02, 0.28, 0.012]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.0}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Overhead rail carriage + heavy 3-blade industrial claw (reference close-up).
 * Contained inside rectangular glass chamber.
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
  const cableScale = useRef(0.4);
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
      group.current.rotation.z = Math.sin(idleT.current * 0.6) * 0.012;
      if (motorGroup.current) {
        motorGroup.current.rotation.y =
          Math.sin(idleT.current * 0.3) * 0.03;
      }
    } else {
      group.current.rotation.z = THREE.MathUtils.damp(
        group.current.rotation.z,
        0,
        6,
        dt
      );
    }

    // Open = wide industrial grab stance; closed = clamp
    const openAng = open ? 0.72 : 0.18;
    for (const fr of [f0, f1, f2]) {
      if (fr.current) {
        fr.current.rotation.z = THREE.MathUtils.damp(
          fr.current.rotation.z,
          openAng,
          9,
          dt
        );
      }
    }

    const targetCable =
      phase === "drop" || phase === "close"
        ? 0.82
        : phase === "slip"
          ? 0.52
          : 0.34;
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
        prize.current.position.set(0, -0.62, 0.02);
      } else if (phase === "slip" || phase === "lose") {
        prize.current.visible = true;
        fall.current += dt * 2.3;
        prize.current.position.y = -0.62 - fall.current;
        if (fall.current > 1.5) prize.current.visible = false;
      } else {
        prize.current.visible = false;
        fall.current = 0;
      }
    }
  });

  const baseCable = 0.82;

  return (
    <group
      ref={group}
      position={[0, 0.2, 0.08]}
      scale={1.75}
      userData={{
        clawBlades: CLAW_BLADES,
        style: "solid-metal-3blade",
        containment: "inside-glass-chamber",
        maxTravelX: HW * 0.52,
      }}
    >
      {/* Slim overhead rail — claw motor/blades are the visual hero */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.42, 0.12, 0.28]} />
        <meshStandardMaterial {...metal(TITANIUM, 0.94, 0.2)} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.36, 0.07, 0.22]} />
        <meshStandardMaterial {...carbonMat()} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.2, 0.06, 0.1]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.92, 0.24)} />
      </mesh>
      <Neon
        position={[0, 0.54, 0]}
        size={[1.15, 0.012, 0.03]}
        color={CYAN}
        intensity={1.5}
      />
      {[-0.55, 0.55].map((sx) => (
        <mesh key={sx} position={[sx, 0.5, 0]} castShadow>
          <boxGeometry args={[0.09, 0.1, 0.12]} />
          <meshStandardMaterial {...metal(TITANIUM_MID, 0.93, 0.22)} />
        </mesh>
      ))}

      {/* Winch drum */}
      <mesh position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 0.14, 18]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.92, 0.24)} />
      </mesh>
      <mesh position={[0, 0.4, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.095, 0.012, 8, 20]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.7}
          toneMapped={false}
        />
      </mesh>

      {/* Steel cables */}
      <mesh
        position={[0, 0.32 - (baseCable * cableScale.current) / 2, 0]}
        scale={[1, cableScale.current, 1]}
      >
        <cylinderGeometry args={[0.022, 0.018, baseCable, 12]} />
        <meshStandardMaterial color="#2a2e34" metalness={0.94} roughness={0.28} />
      </mesh>
      {[-0.04, 0.04].map((ox) => (
        <mesh
          key={ox}
          position={[ox, 0.32 - (baseCable * cableScale.current) / 2, 0.02]}
          scale={[1, cableScale.current, 1]}
        >
          <cylinderGeometry args={[0.008, 0.007, baseCable, 8]} />
          <meshStandardMaterial color="#3a4048" metalness={0.9} roughness={0.32} />
        </mesh>
      ))}

      {/* Motor + 3 blades */}
      <group
        ref={motorGroup}
        position={[0, 0.32 - baseCable * cableScale.current - 0.1, 0]}
        userData={{ fingers: CLAW_BLADES, motor: true }}
      >
        <mesh position={[0, 0.16, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.08, 0.12, 18]} />
          <meshStandardMaterial
            color="#8a94a4"
            metalness={0.9}
            roughness={0.24}
            emissive="#202838"
            emissiveIntensity={0.35}
          />
        </mesh>
        {/* Compact motor body — blades are the visual hero, not the hat */}
        <mesh castShadow>
          <cylinderGeometry args={[0.15, 0.16, 0.28, 32]} />
          <meshStandardMaterial {...carbonMat()} />
        </mesh>
        <mesh castShadow>
          <cylinderGeometry args={[0.135, 0.145, 0.22, 32]} />
          <meshStandardMaterial
            color="#7a8494"
            metalness={0.88}
            roughness={0.26}
            emissive="#1a2230"
            emissiveIntensity={0.45}
          />
        </mesh>
        <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.145, 0.018, 10, 28]} />
          <meshStandardMaterial {...metal(STEEL, 0.9, 0.25)} />
        </mesh>
        {/* Red neon collars */}
        <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.16, 0.016, 12, 36]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.3}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, -0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.165, 0.014, 12, 36]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.0}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.13, 0.01, 10, 28]} />
          <meshStandardMaterial
            color={CYAN}
            emissive={CYAN}
            emissiveIntensity={1.65}
            toneMapped={false}
          />
        </mesh>
        {/* Side hydraulic tanks */}
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            position={[s * 0.16, 0.02, 0.13]}
            rotation={[0.28, 0, s * 0.12]}
            castShadow
          >
            <cylinderGeometry args={[0.042, 0.045, 0.22, 14]} />
            <meshStandardMaterial
              color="#5a6474"
              metalness={0.9}
              roughness={0.26}
              emissive="#1a2030"
              emissiveIntensity={0.25}
            />
          </mesh>
        ))}
        {/* Pivot hub */}
        <mesh position={[0, -0.24, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.11, 0.12, 28]} />
          <meshStandardMaterial
            color="#8a94a4"
            metalness={0.88}
            roughness={0.28}
            emissive="#202830"
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0, -0.35, 0]} castShadow>
          <sphereGeometry args={[0.085, 24, 24]} />
          <meshStandardMaterial
            color="#d0d6e0"
            metalness={0.88}
            roughness={0.2}
            emissive="#3a4454"
            emissiveIntensity={0.45}
          />
        </mesh>

        {/* 120° spacing so all 3 blades read from front (reference open claw) */}
        <group position={[0, -0.35, 0]} rotation={[0.15, 0, 0]}>
          <MetalBlade fingerRef={f0} yaw={0} />
          <MetalBlade fingerRef={f1} yaw={(Math.PI * 2) / 3} />
          <MetalBlade fingerRef={f2} yaw={(Math.PI * 4) / 3} />
          <pointLight
            position={[0.25, -0.2, 0.45]}
            intensity={2.9}
            color={CYAN}
            distance={2.1}
          />
          <pointLight
            position={[-0.25, -0.25, 0.4]}
            intensity={2.7}
            color={RED}
            distance={2.0}
          />
          <pointLight
            position={[0, -0.45, 0.5]}
            intensity={2.1}
            color={CYAN}
            distance={1.7}
          />
          <group ref={prize} visible={false}>
            <PrizeMeshByKind kind="fiatclaw_token" scale={hold ? 1.25 : 1.05} />
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
    <points ref={ref} position={[0, 0.45, 0.5]} geometry={geo}>
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
      cam.position.x = Math.sin(t.current * 0.09) * 0.14;
      cam.position.y = 0.15 + Math.sin(t.current * 0.08) * 0.04;
    }
    if (phase === "win") {
      cam.position.z = THREE.MathUtils.damp(cam.position.z, 7.1, 2.5, dt);
      if (root.current) {
        root.current.position.x = Math.sin(performance.now() * 0.04) * 0.018;
      }
    } else if (phase === "lose" || phase === "slip") {
      cam.position.z = THREE.MathUtils.damp(cam.position.z, 7.7, 2, dt);
    } else {
      cam.position.z = THREE.MathUtils.damp(cam.position.z, 7.45, 1.5, dt);
    }
    // Full machine: armored shell + hanging claw + dense prize floor
    cam.lookAt(0, 0.05, 0);
    if (root.current && idle) {
      root.current.rotation.y = Math.sin(t.current * 0.07) * 0.02;
    }
  });

  return (
    <>
      <color attach="background" args={["#020406"]} />
      <fog attach="fog" args={["#020406", 10, 26]} />

      {/* Red + cyan accent only — machine stays black / gunmetal */}
      <ambientLight intensity={0.22} color="#0a121c" />
      <directionalLight
        position={[4.0, 6.0, 3.5]}
        intensity={0.55}
        color={CYAN}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-3.8, 4.0, 2.2]} intensity={0.45} color={RED} />
      <pointLight position={[-2.4, 1.6, 2.6]} intensity={1.75} color={CYAN} />
      <pointLight position={[2.4, 1.4, 2.6]} intensity={1.85} color={RED} />
      <pointLight position={[0, 1.8, 2.0]} intensity={1.4} color={CYAN} />
      <pointLight position={[0, 0.3, 1.9]} intensity={1.3} color={RED} />
      <pointLight position={[0, -0.4, 0.9]} intensity={0.75} color={CYAN} />
      <pointLight position={[0, 2.0, 2.2]} intensity={1.5} color={RED} distance={5.5} />
      <pointLight position={[-2.0, 0.2, 1.6]} intensity={1.0} color={CYAN} distance={4} />
      <pointLight position={[2.0, 0.2, 1.6]} intensity={1.0} color={RED} distance={4} />
      {/* Claw fill — steel blades must read, not silhouette */}
      <pointLight position={[0.4, 0.7, 1.3]} intensity={2.4} color={CYAN} distance={3.2} />
      <pointLight position={[-0.4, 0.6, 1.3]} intensity={2.2} color={RED} distance={3.2} />
      <spotLight
        position={[0, 3.8, 3.0]}
        angle={0.4}
        penumbra={0.78}
        intensity={1.1}
        color={CYAN}
      />
      <spotLight
        position={[0, 1.2, -1.8]}
        angle={0.48}
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
        position={[0, FLOOR_Y - 0.7, 0]}
        opacity={0.92}
        scale={18}
        blur={2.3}
        far={9}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.48}
          luminanceThreshold={0.74}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
