"use client";

/**
 * Premium 2035 Web3 arcade claw machine — industrial / cyberpunk luxury.
 * Brushed black metal, carbon panels, hydraulic 3-blade claw, tempered glass.
 * Not a children's toy cabinet.
 */

import { useMemo, useRef, type MutableRefObject, type Ref } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, RoundedBox, Text } from "@react-three/drei";
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
const PURPLE = "#6B2FD6";
const GUNMETAL = "#2a2f3a";
const CARBON = "#0e1016";
const CHROME = "#9aa3b0";

export interface ClawSceneProps {
  phase: ClawPhase;
  clawX: number;
}

export const CABINET_SHELL_MODE = "hollow-open-front" as const;
export const CLAW_BLADES = CLAW_FINGER_COUNT;
export const MACHINE_STYLE = "premium-industrial-2035" as const;

function useSlipped(phase: ClawPhase) {
  const slipped = useRef(false);
  slipped.current = updateSlippedLatch(phase, slipped.current);
  return slipped.current;
}

function mapClawX(pct: number) {
  const t = (Math.min(88, Math.max(12, pct)) - 50) / 38;
  return t * 0.9;
}

function targetClawY(phase: ClawPhase) {
  switch (phase) {
    case "drop":
    case "close":
      return 0.05;
    case "lift":
    case "hold":
    case "win":
      return 1.35;
    case "slip":
      return 0.55;
    case "return":
    case "lose":
      return 1.3;
    default:
      return 1.35;
  }
}

function NeonStrip({
  position,
  args,
  color,
  intensity = 2.4,
}: {
  position: [number, number, number];
  args: [number, number, number];
  color: string;
  intensity?: number;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={intensity}
        toneMapped={false}
      />
    </mesh>
  );
}

function metal(color: string, m = 0.92, r = 0.28) {
  return { color, metalness: m, roughness: r } as const;
}

/** Animated cooling fan */
function CoolingFan({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 4.5;
  });
  return (
    <group position={position} scale={scale}>
      <mesh>
        <cylinderGeometry args={[0.12, 0.12, 0.04, 24]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.9, 0.35)} />
      </mesh>
      <group ref={ref}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]} position={[0, 0.02, 0]}>
            <boxGeometry args={[0.1, 0.01, 0.028]} />
            <meshStandardMaterial {...metal(CHROME, 0.95, 0.2)} />
          </mesh>
        ))}
        <mesh position={[0, 0.025, 0]}>
          <sphereGeometry args={[0.02, 12, 12]} />
          <meshStandardMaterial {...metal("#1a1c22", 0.9, 0.3)} />
        </mesh>
      </group>
      {/* Grill ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <torusGeometry args={[0.115, 0.008, 8, 32]} />
        <meshStandardMaterial {...metal(CHROME, 0.95, 0.18)} />
      </mesh>
    </group>
  );
}

/**
 * Hollow cabinet: industrial face-forward vitrine.
 * Brushed black metal, carbon inserts, tempered glass, premium neon.
 */
function CabinetShell() {
  const W = 3.15;
  const H = 3.9;
  const D = 1.95;
  const wall = 0.14;
  const winW = 2.25;
  const winH = 2.3;
  const winY = 0.4;
  const frontZ = D / 2 - 0.03;

  return (
    <group userData={{ shell: "face-vitrine", style: MACHINE_STYLE }}>
      {/* Structural body — thick industrial walls */}
      <mesh position={[0, 0.12, -D / 2 + wall / 2]} castShadow receiveShadow>
        <boxGeometry args={[W - wall * 1.5, H - 0.15, wall]} />
        <meshStandardMaterial {...metal("#0a0c10", 0.88, 0.38)} />
      </mesh>
      {/* Carbon fiber back plate insert */}
      <mesh position={[0, 0.35, -D / 2 + wall + 0.01]}>
        <boxGeometry args={[W - 0.5, H * 0.55, 0.02]} />
        <meshStandardMaterial
          color={CARBON}
          metalness={0.55}
          roughness={0.55}
          emissive={PURPLE}
          emissiveIntensity={0.04}
        />
      </mesh>

      {/* Side walls — heavy */}
      <mesh position={[-W / 2 + wall / 2, 0.12, 0]} castShadow>
        <boxGeometry args={[wall, H - 0.15, D]} />
        <meshStandardMaterial {...metal("#12151c", 0.9, 0.32)} />
      </mesh>
      <mesh position={[W / 2 - wall / 2, 0.12, 0]} castShadow>
        <boxGeometry args={[wall, H - 0.15, D]} />
        <meshStandardMaterial {...metal("#12151c", 0.9, 0.32)} />
      </mesh>

      {/* Carbon side inserts */}
      <mesh position={[-W / 2 + wall + 0.02, 0.3, 0.1]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.03, 1.8, 1.2]} />
        <meshStandardMaterial color={CARBON} metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[W / 2 - wall - 0.02, 0.3, 0.1]}>
        <boxGeometry args={[0.03, 1.8, 1.2]} />
        <meshStandardMaterial color={CARBON} metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Top crown */}
      <mesh position={[0, H / 2 - 0.06, 0]} castShadow>
        <boxGeometry args={[W, 0.18, D]} />
        <meshStandardMaterial {...metal("#1a1e28", 0.92, 0.26)} />
      </mesh>
      {/* Bevel crown lip */}
      <mesh position={[0, H / 2 - 0.16, frontZ - 0.1]}>
        <boxGeometry args={[W - 0.1, 0.06, 0.2]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.94, 0.22)} />
      </mesh>

      {/* Chamber floor — dark steel plate */}
      <mesh position={[0, -0.78, 0.1]} receiveShadow>
        <boxGeometry args={[W - 0.4, 0.12, D - 0.35]} />
        <meshStandardMaterial {...metal("#080a0e", 0.75, 0.55)} />
      </mesh>

      {/* Front frame — heavy industrial stiles */}
      <mesh position={[0, winY + winH / 2 + 0.24, frontZ]} castShadow>
        <boxGeometry args={[W - 0.1, 0.48, 0.16]} />
        <meshStandardMaterial {...metal("#141820", 0.92, 0.28)} />
      </mesh>
      <mesh position={[0, winY - winH / 2 - 0.18, frontZ]} castShadow>
        <boxGeometry args={[W - 0.1, 0.34, 0.16]} />
        <meshStandardMaterial {...metal("#141820", 0.92, 0.28)} />
      </mesh>
      <mesh position={[-winW / 2 - 0.18, winY, frontZ]} castShadow>
        <boxGeometry args={[0.28, winH + 0.6, 0.15]} />
        <meshStandardMaterial {...metal("#1a1f2a", 0.93, 0.26)} />
      </mesh>
      <mesh position={[winW / 2 + 0.18, winY, frontZ]} castShadow>
        <boxGeometry args={[0.28, winH + 0.6, 0.15]} />
        <meshStandardMaterial {...metal("#1a1f2a", 0.93, 0.26)} />
      </mesh>

      {/* Chrome window bevel */}
      <mesh position={[0, winY + winH / 2 - 0.02, frontZ + 0.03]}>
        <boxGeometry args={[winW + 0.1, 0.04, 0.05]} />
        <meshStandardMaterial {...metal(CHROME, 0.96, 0.14)} />
      </mesh>
      <mesh position={[0, winY - winH / 2 + 0.02, frontZ + 0.03]}>
        <boxGeometry args={[winW + 0.1, 0.04, 0.05]} />
        <meshStandardMaterial {...metal(CHROME, 0.96, 0.14)} />
      </mesh>

      {/* Marquee housing */}
      <RoundedBox
        args={[2.55, 0.4, 0.12]}
        radius={0.015}
        position={[0, winY + winH / 2 + 0.44, frontZ + 0.05]}
      >
        <meshStandardMaterial {...metal("#0a0c12", 0.88, 0.3)} />
      </RoundedBox>
      <Text
        position={[0, winY + winH / 2 + 0.44, frontZ + 0.12]}
        fontSize={0.14}
        letterSpacing={0.12}
        color={RED}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.006}
        outlineColor="#8a1020"
      >
        FIATCLAW ARCADE
      </Text>

      {/* Premium neon outline */}
      <NeonStrip
        position={[0, H / 2 - 0.02, frontZ + 0.02]}
        args={[W * 0.98, 0.025, 0.025]}
        color={RED}
        intensity={2.8}
      />
      <NeonStrip
        position={[0, H / 2 - 0.055, frontZ + 0.02]}
        args={[W * 0.9, 0.014, 0.014]}
        color={CYAN}
        intensity={2}
      />
      <NeonStrip
        position={[-W / 2 + 0.04, 0.1, frontZ]}
        args={[0.028, H * 0.9, 0.028]}
        color={CYAN}
        intensity={2.2}
      />
      <NeonStrip
        position={[W / 2 - 0.04, 0.1, frontZ]}
        args={[0.028, H * 0.9, 0.028]}
        color={RED}
        intensity={2.2}
      />
      <NeonStrip
        position={[0, winY - winH / 2 - 0.36, frontZ + 0.02]}
        args={[W * 0.88, 0.02, 0.02]}
        color={CYAN}
        intensity={1.8}
      />

      {/* Interior LED bar */}
      <mesh position={[0, winY + winH / 2 - 0.14, 0.15]}>
        <boxGeometry args={[1.8, 0.05, 0.18]} />
        <meshStandardMaterial
          color="#d0d8e8"
          emissive="#ffffff"
          emissiveIntensity={2.4}
          toneMapped={false}
        />
      </mesh>
      <NeonStrip
        position={[0, winY + winH / 2 - 0.2, 0.15]}
        args={[1.7, 0.01, 0.08]}
        color={CYAN}
        intensity={1.2}
      />

      {/* Red hydraulic rails inside */}
      <mesh position={[0.75, 0.1, 0.2]}>
        <boxGeometry args={[0.04, 0.04, 1.2]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.3}
          metalness={0.8}
          roughness={0.25}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[-0.75, 0.5, 0.1]}>
        <boxGeometry args={[0.035, 0.035, 1.0]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.0}
          metalness={0.8}
          roughness={0.25}
          toneMapped={false}
        />
      </mesh>

      {/* Ventilation grills */}
      {([-1.2, 1.2] as const).map((sx) => (
        <group key={sx} position={[sx, -0.9, frontZ + 0.02]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[0, i * 0.045, 0]}>
              <boxGeometry args={[0.28, 0.012, 0.04]} />
              <meshStandardMaterial {...metal(GUNMETAL, 0.85, 0.4)} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Speaker grills */}
      {([-1.15, 1.15] as const).map((sx) => (
        <group key={`sp${sx}`} position={[sx, 1.55, frontZ + 0.04]}>
          <mesh>
            <circleGeometry args={[0.1, 24]} />
            <meshStandardMaterial {...metal("#0a0c10", 0.7, 0.5)} />
          </mesh>
          {[0.03, 0.055, 0.08].map((r, i) => (
            <mesh key={i} rotation={[0, 0, 0]} position={[0, 0, 0.005]}>
              <ringGeometry args={[r - 0.006, r, 24]} />
              <meshStandardMaterial {...metal(CHROME, 0.9, 0.3)} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Cooling fans */}
      <CoolingFan position={[-1.15, -1.25, frontZ + 0.06]} scale={0.7} />
      <CoolingFan position={[1.15, -1.25, frontZ + 0.06]} scale={0.7} />

      {/* Heavy control console mass */}
      <RoundedBox
        args={[3.0, 0.85, 0.7]}
        radius={0.03}
        position={[0, -1.78, 0.65]}
      >
        <meshStandardMaterial {...metal("#0e1218", 0.9, 0.32)} />
      </RoundedBox>
      {/* Console carbon top plate */}
      <mesh position={[0, -1.38, 0.75]} rotation={[-0.15, 0, 0]}>
        <boxGeometry args={[2.85, 0.04, 0.55]} />
        <meshStandardMaterial color={CARBON} metalness={0.6} roughness={0.45} />
      </mesh>
      <NeonStrip
        position={[0, -1.35, 0.95]}
        args={[2.6, 0.012, 0.012]}
        color={RED}
        intensity={1.6}
      />
    </group>
  );
}

function GlassPanel() {
  return (
    <mesh position={[0, 0.4, 0.9]} renderOrder={2}>
      <boxGeometry args={[2.2, 2.25, 0.03]} />
      <meshPhysicalMaterial
        color="#a8c4d4"
        metalness={0}
        roughness={0.03}
        transmission={0.88}
        thickness={0.4}
        transparent
        opacity={0.18}
        ior={1.52}
        clearcoat={1}
        clearcoatRoughness={0.04}
        envMapIntensity={1.2}
        depthWrite={false}
      />
    </mesh>
  );
}

function PrizePile({ phase }: { phase: ClawPhase }) {
  const layout = useMemo(() => buildPrizePileLayout(42), []);
  const dim = phase === "win" ? 0.35 : 1;
  return (
    <group
      position={[0, -0.7, 0.3]}
      userData={{
        prizePile: "premium-crypto",
        prizeCount: layout.length,
        moneyOnly: true,
      }}
    >
      {/* Dark steel floor plate under prizes */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[2.1, 1.4]} />
        <meshStandardMaterial {...metal("#0a0c10", 0.7, 0.6)} />
      </mesh>
      {/* Subtle purple ambient floor wash */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <planeGeometry args={[1.8, 1.1]} />
        <meshStandardMaterial
          color="#0a0612"
          emissive={PURPLE}
          emissiveIntensity={0.15}
          transparent
          opacity={0.5}
        />
      </mesh>
      {layout.map((spec, i) => (
        <AnimatedPrize key={i} spec={spec} dim={dim} />
      ))}
    </group>
  );
}

/** Hydraulic blade with piston detail */
function HydraulicBlade({
  fingerRef,
  yaw,
}: {
  fingerRef: MutableRefObject<THREE.Group | null>;
  yaw: number;
}) {
  return (
    <group rotation={[0, yaw, 0]}>
      <group ref={fingerRef as Ref<THREE.Group>} position={[0.07, 0, 0]}>
        {/* Upper hydraulic arm */}
        <mesh position={[0.02, -0.08, 0]} castShadow rotation={[0, 0, 0.18]}>
          <capsuleGeometry args={[0.028, 0.12, 4, 12]} />
          <meshStandardMaterial {...metal("#1c2028", 0.94, 0.22)} />
        </mesh>
        {/* Piston sleeve */}
        <mesh position={[0.05, -0.18, 0]} castShadow rotation={[0, 0, 0.35]}>
          <cylinderGeometry args={[0.02, 0.022, 0.08, 12]} />
          <meshStandardMaterial {...metal(CHROME, 0.96, 0.14)} />
        </mesh>
        {/* Lower curved claw */}
        <mesh position={[0.09, -0.32, 0]} castShadow rotation={[0, 0, 0.7]}>
          <capsuleGeometry args={[0.024, 0.15, 4, 12]} />
          <meshStandardMaterial {...metal("#12151c", 0.93, 0.24)} />
        </mesh>
        {/* Tip */}
        <mesh position={[0.14, -0.44, 0]} castShadow rotation={[0.15, 0, 1.05]}>
          <capsuleGeometry args={[0.016, 0.07, 4, 10]} />
          <meshStandardMaterial {...metal("#0e1014", 0.92, 0.26)} />
        </mesh>
        {/* Red neon edge */}
        <mesh position={[0.05, -0.14, 0.025]} rotation={[0, 0, 0.25]}>
          <boxGeometry args={[0.012, 0.14, 0.01]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.8}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0.1, -0.34, 0.025]} rotation={[0, 0, 0.7]}>
          <boxGeometry args={[0.012, 0.16, 0.01]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>
        {/* Hydraulic joint bolt */}
        <mesh position={[0.04, -0.2, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.04, 10]} />
          <meshStandardMaterial {...metal(CHROME, 0.96, 0.12)} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Heavy industrial 3-blade claw — hydraulic arms, thick steel cable,
 * realistic motor housing with cooling fins and gear detail.
 */
function ClawAssembly({
  phase,
  clawX,
}: {
  phase: ClawPhase;
  clawX: number;
}) {
  const slipped = useSlipped(phase);
  const hold = clawShouldHoldPrize(phase, slipped);
  const open = clawFingersOpen(phase, slipped);
  const group = useRef<THREE.Group>(null);
  const f0 = useRef<THREE.Group>(null);
  const f1 = useRef<THREE.Group>(null);
  const f2 = useRef<THREE.Group>(null);
  const prize = useRef<THREE.Group>(null);
  const fall = useRef(0);
  const gear = useRef<THREE.Mesh>(null);

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

    const openAng = open ? 0.75 : 0.08;
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
    if (gear.current) {
      gear.current.rotation.y += dt * (phase === "drop" || phase === "lift" ? 6 : 1.2);
    }

    if (prize.current) {
      if (hold) {
        fall.current = 0;
        prize.current.visible = true;
        prize.current.position.set(0, -0.58, 0.02);
      } else if (phase === "slip" || phase === "lose") {
        prize.current.visible = true;
        fall.current += dt * 2.5;
        prize.current.position.y = -0.58 - fall.current;
        prize.current.position.x = Math.sin(fall.current * 3) * 0.05;
        if (fall.current > 1.5) prize.current.visible = false;
      } else {
        prize.current.visible = false;
        fall.current = 0;
      }
    }
  });

  const cableLen =
    phase === "drop" || phase === "close"
      ? 0.95
      : phase === "slip"
        ? 0.6
        : 0.32;

  return (
    <group
      ref={group}
      position={[0, 1.35, 0.4]}
      userData={{ clawBlades: CLAW_BLADES, style: "hydraulic-industrial" }}
    >
      {/* Heavy gantry rail */}
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[2.2, 0.08, 0.12]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.94, 0.22)} />
      </mesh>
      <mesh position={[0, 0.37, 0]}>
        <boxGeometry args={[2.15, 0.015, 0.04]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
      {/* Carriage */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.48, 0.16, 0.34]} />
        <meshStandardMaterial {...metal("#1a1e28", 0.93, 0.24)} />
      </mesh>
      <mesh position={[0, 0.2, 0.16]}>
        <boxGeometry args={[0.3, 0.08, 0.06]} />
        <meshStandardMaterial {...metal(CHROME, 0.95, 0.15)} />
      </mesh>
      {/* Side gears on carriage */}
      <mesh ref={gear} position={[0.22, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.04, 12]} />
        <meshStandardMaterial {...metal(CHROME, 0.95, 0.16)} />
      </mesh>

      {/* Thick steel braided cable (dual strand) */}
      <mesh key={`c-${cableLen.toFixed(2)}`} position={[0, -cableLen / 2 + 0.1, 0]}>
        <cylinderGeometry args={[0.022, 0.022, cableLen, 14]} />
        <meshStandardMaterial color="#1a1c20" metalness={0.85} roughness={0.4} />
      </mesh>
      <mesh
        key={`c2-${cableLen.toFixed(2)}`}
        position={[0.012, -cableLen / 2 + 0.1, 0.008]}
      >
        <cylinderGeometry args={[0.014, 0.014, cableLen * 0.98, 10]} />
        <meshStandardMaterial color="#2a2e36" metalness={0.9} roughness={0.35} />
      </mesh>

      {/* Heavy carabiner */}
      <mesh position={[0, -cableLen + 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.04, 0.01, 10, 24]} />
        <meshStandardMaterial {...metal(CHROME, 0.97, 0.12)} />
      </mesh>

      {/* Motor housing — industrial cylinder with fins + dual red rings */}
      <group position={[0, -cableLen - 0.12, 0]} userData={{ motor: true }}>
        <mesh castShadow>
          <cylinderGeometry args={[0.155, 0.165, 0.26, 36]} />
          <meshStandardMaterial {...metal("#14161c", 0.94, 0.24)} />
        </mesh>
        {/* Cooling fins */}
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 0.16, 0.02, Math.sin(a) * 0.16]}
              rotation={[0, -a, 0]}
            >
              <boxGeometry args={[0.02, 0.14, 0.04]} />
              <meshStandardMaterial {...metal(GUNMETAL, 0.9, 0.3)} />
            </mesh>
          );
        })}
        {/* Dual red neon rings */}
        <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.16, 0.014, 12, 48]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={3.2}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.165, 0.012, 12, 48]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.8}
            toneMapped={false}
          />
        </mesh>
        {/* Status LED */}
        <mesh position={[0, 0.02, 0.16]}>
          <cylinderGeometry args={[0.022, 0.022, 0.02, 16]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.5}
            toneMapped={false}
          />
        </mesh>
        {/* Lower collar / gearbox */}
        <mesh position={[0, -0.12, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.09, 0.08, 24]} />
          <meshStandardMaterial {...metal("#0e1016", 0.92, 0.28)} />
        </mesh>
        <mesh position={[0, -0.18, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.05, 16]} />
          <meshStandardMaterial {...metal(CHROME, 0.95, 0.15)} />
        </mesh>
      </group>

      {/* 3 hydraulic blades */}
      <group
        position={[0, -cableLen - 0.32, 0]}
        userData={{ fingers: CLAW_BLADES, style: "hydraulic" }}
      >
        <HydraulicBlade fingerRef={f0} yaw={0} />
        <HydraulicBlade fingerRef={f1} yaw={(Math.PI * 2) / 3} />
        <HydraulicBlade fingerRef={f2} yaw={(Math.PI * 4) / 3} />
        {/* Center hydraulic probe */}
        <mesh position={[0, -0.28, 0]}>
          <cylinderGeometry args={[0.014, 0.01, 0.42, 12]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.4}
            metalness={0.8}
            roughness={0.2}
            toneMapped={false}
          />
        </mesh>
        <group ref={prize} position={[0, -0.58, 0]} visible={false}>
          <PrizeMeshByKind kind="fiatclaw_token" scale={hold ? 1.2 : 1} />
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
      pos[i * 3] = (Math.random() - 0.5) * 0.35;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.35;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((s) => {
    if (!ref.current || !active) return;
    ref.current.rotation.y = s.clock.elapsedTime * 2;
    ref.current.scale.setScalar(1.4 + Math.sin(s.clock.elapsedTime * 6) * 0.2);
  });
  if (!active) return null;
  return (
    <points ref={ref} position={[0, 1.0, 0.7]} geometry={geo}>
      <pointsMaterial size={0.035} color={RED} transparent opacity={0.8} sizeAttenuation />
    </points>
  );
}

export function ClawScene({ phase, clawX }: ClawSceneProps) {
  const shake = useRef(0);
  const root = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (!root.current) return;
    if (phase === "win") {
      shake.current = Math.min(1, shake.current + dt * 4);
      root.current.rotation.z =
        Math.sin(performance.now() * 0.04) * 0.008 * shake.current;
    } else {
      shake.current = Math.max(0, shake.current - dt * 3);
      root.current.rotation.z = THREE.MathUtils.damp(
        root.current.rotation.z,
        0,
        8,
        dt
      );
    }
  });

  return (
    <>
      <color attach="background" args={["#030406"]} />
      <fog attach="fog" args={["#030406", 9, 18]} />

      <ambientLight intensity={0.22} />
      <directionalLight
        position={[3, 6, 4]}
        intensity={0.7}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-2, 2, 2]} intensity={0.65} color={CYAN} />
      <pointLight position={[2, 1.5, 2]} intensity={0.85} color={RED} />
      <pointLight position={[0, 0.2, 1]} intensity={0.45} color={PURPLE} />
      <spotLight
        position={[0, 2.9, 0.5]}
        angle={0.48}
        penumbra={0.5}
        intensity={1.4}
        color="#e8eef8"
      />
      <pointLight position={[0, -0.5, 0.5]} intensity={0.25} color={PURPLE} />

      <group ref={root} position={[0, -0.08, 0]}>
        <CabinetShell />
        <GlassPanel />
        <PrizePile phase={phase} />
        <ClawAssembly phase={phase} clawX={clawX} />
        <WinBurst active={phase === "win"} />
      </group>

      <ContactShadows
        position={[0, -2.15, 0]}
        opacity={0.6}
        scale={10}
        blur={2.8}
        far={5}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.55}
          luminanceThreshold={0.4}
          luminanceSmoothing={0.35}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
