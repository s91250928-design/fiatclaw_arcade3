"use client";

/**
 * FIATCLAW VAULT — etalon-aligned cylindrical glass chamber.
 * Solid base + glass cylinder volume + metal crown.
 * Neon rings = decoration only. Heavy 3-blade claw sprite + dense prize billboards.
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
const PURPLE = "#7B3FE4";
const GOLD = "#F5C542";
const GUNMETAL = "#2a303c";
/**
 * Mid-tone industrial metal — readable form under red/cyan neon.
 * Never pure white (#fff) — avoids white bloom wash.
 */
const CHROME = "#b4bcc8";
const STEEL = "#9aa4b2";
const STEEL_DARK = "#6a7484";

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

/** Max X travel so claw stays inside glass radius (~1.45). */
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

function metal(c: string, m = 0.88, r = 0.22) {
  return { color: c, metalness: m, roughness: r } as const;
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

/** Metal structural ring (solid) + thin neon trim on it */
function VaultRing({
  y,
  radius,
  tube = 0.04,
  neon,
}: {
  y: number;
  radius: number;
  tube?: number;
  neon?: string;
}) {
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[radius, tube, 12, 64]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.94, 0.22)} />
      </mesh>
      {neon && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, tube * 0.35, 10, 64]} />
          <meshStandardMaterial
            color={neon}
            emissive={neon}
            emissiveIntensity={1.5}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

function CoolingFan({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 5.5;
  });
  return (
    <group position={position} scale={0.5}>
      <mesh>
        <cylinderGeometry args={[0.13, 0.13, 0.035, 20]} />
        <meshStandardMaterial {...metal(GUNMETAL)} />
      </mesh>
      <group ref={ref}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]} position={[0, 0.02, 0]}>
            <boxGeometry args={[0.1, 0.01, 0.025]} />
            <meshStandardMaterial {...metal(CHROME, 0.95, 0.18)} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Real vault volume: thick metal base + glass cylinder body + metal crown.
 * Neon rings decorate the structure — they are not the machine itself.
 */
function VaultShell() {
  const R = 1.45;
  const H = 2.9;

  return (
    <group userData={{ shell: "glass-cylinder-vault", style: MACHINE_STYLE }}>
      {/* === SOLID BASE (heavy platform) === */}
      <mesh position={[0, -1.55, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.75, 1.95, 0.35, 48]} />
        <meshStandardMaterial {...metal("#0c1018", 0.92, 0.3)} />
      </mesh>
      <mesh position={[0, -1.35, 0]} castShadow>
        <cylinderGeometry args={[1.55, 1.6, 0.12, 48]} />
        <meshStandardMaterial {...metal("#141a24", 0.93, 0.25)} />
      </mesh>
      <VaultRing y={-1.32} radius={1.65} tube={0.035} neon={CYAN} />
      <VaultRing y={-1.7} radius={1.85} tube={0.03} neon={RED} />

      {/* Inner floor disc */}
      <mesh position={[0, -1.28, 0]} receiveShadow>
        <cylinderGeometry args={[1.32, 1.32, 0.06, 48]} />
        <meshStandardMaterial {...metal("#080a0e", 0.65, 0.55)} />
      </mesh>
      <mesh position={[0, -1.24, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.25, 48]} />
        <meshStandardMaterial
          color="#0c0818"
          emissive={PURPLE}
          emissiveIntensity={0.25}
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* === GLASS CYLINDER BODY (readable volume) === */}
      {/* Outer slightly thicker rim glass */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[R + 0.02, R + 0.02, H, 64, 1, true]} />
        <meshPhysicalMaterial
          color="#9ec4dc"
          metalness={0.08}
          roughness={0.1}
          transmission={0.72}
          thickness={0.6}
          transparent
          opacity={0.35}
          ior={1.48}
          side={THREE.DoubleSide}
          depthWrite={false}
          clearcoat={1}
          clearcoatRoughness={0.1}
          envMapIntensity={1.3}
        />
      </mesh>
      {/* Inner glass skin for double-wall feel */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[R - 0.04, R - 0.04, H * 0.98, 48, 1, true]} />
        <meshPhysicalMaterial
          color="#c8e0f0"
          metalness={0}
          roughness={0.04}
          transmission={0.9}
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Vertical metal struts (4) — give cylinder solid skeleton */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * R, 0.15, Math.sin(a) * R]}
            castShadow
          >
            <boxGeometry args={[0.08, H, 0.08]} />
            <meshStandardMaterial {...metal("#1a1e28", 0.93, 0.28)} />
          </mesh>
        );
      })}

      {/* Structural metal rings (not bare neon) + neon trim */}
      <VaultRing y={1.45} radius={R + 0.02} tube={0.045} neon={RED} />
      <VaultRing y={0.75} radius={R + 0.02} tube={0.038} neon={CYAN} />
      <VaultRing y={0.05} radius={R + 0.02} tube={0.038} neon={RED} />
      <VaultRing y={-0.65} radius={R + 0.02} tube={0.04} neon={CYAN} />
      <VaultRing y={-1.15} radius={R + 0.02} tube={0.042} neon={RED} />

      {/* === CROWN / GANTRY HOUSING === */}
      <mesh position={[0, 1.7, 0]} castShadow>
        <cylinderGeometry args={[1.55, 1.5, 0.28, 48]} />
        <meshStandardMaterial {...metal("#12161e", 0.94, 0.22)} />
      </mesh>
      <mesh position={[0, 1.9, 0]} castShadow>
        <cylinderGeometry args={[1.35, 1.5, 0.18, 48]} />
        <meshStandardMaterial {...metal("#1a2030", 0.93, 0.24)} />
      </mesh>
      <VaultRing y={1.82} radius={1.4} tube={0.03} neon={CYAN} />
      <VaultRing y={1.58} radius={1.48} tube={0.028} neon={RED} />

      {/* Ceiling neon ring — cyan only (no white projector arc) */}
      <mesh position={[0, 1.52, 0]}>
        <torusGeometry args={[0.85, 0.032, 10, 48]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 1.48, 0]}>
        <torusGeometry args={[0.55, 0.02, 8, 40]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.1}
          toneMapped={false}
        />
      </mesh>

      {/* Back metal panel for depth/silhouette */}
      <mesh position={[0, 0.2, -R * 0.15]} castShadow>
        <cylinderGeometry
          args={[R - 0.08, R - 0.08, H * 0.92, 32, 1, true, Math.PI * 0.55, Math.PI * 0.9]}
        />
        <meshStandardMaterial
          {...metal("#0a0c12", 0.88, 0.38)}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Neon signs ON outer glass (outside transmission volume) */}
      <VaultSign
        url="/refs/sign-win.png"
        position={[-1.52, 0.55, 0.55]}
        rotation={[0, 0.7, 0]}
        width={1.05}
        height={0.55}
      />
      <VaultSign
        url="/refs/sign-claw.png"
        position={[1.52, 0.55, 0.55]}
        rotation={[0, -0.7, 0]}
        width={1.05}
        height={0.45}
      />

      <CoolingFan position={[-1.7, -1.25, 0.4]} />
      <CoolingFan position={[1.7, -1.25, 0.4]} />

      <InteriorFog />
    </group>
  );
}

function InteriorFog() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 140;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.3 + Math.random() * 1.05;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -1.1 + Math.random() * 2.0;
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
      arr[i + 1]! += 0.0025;
      if (arr[i + 1]! > 1.2) arr[i + 1] = -1.15;
    }
    ref.current.geometry.attributes.position!.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.05}
        color="#c4b5fd"
        transparent
        opacity={0.28}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function PrizePile({ phase }: { phase: ClawPhase }) {
  const layout = useMemo(() => buildPrizePileLayout(42), []);
  const dim = phase === "win" ? 0.35 : 1;
  return (
    <group
      position={[0, -1.28, 0]}
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
 * Thin elegant industrial 3-blade finger (etalon proportions).
 * Slim capsules — never fat weight / stick-neon.
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
    metalness: 0.72,
    roughness: 0.28,
  } as const;
  return (
    <group rotation={[0, yaw, 0]}>
      <group ref={fingerRef as React.Ref<THREE.Group>} position={[0.04, 0, 0]}>
        {/* Slim shoulder */}
        <mesh position={[0.015, 0, 0]} castShadow>
          <boxGeometry args={[0.045, 0.04, 0.038]} />
          <meshStandardMaterial color={STEEL_DARK} metalness={0.7} roughness={0.35} />
        </mesh>
        {/* Thin hydraulic rod */}
        <mesh position={[0.04, -0.03, 0.02]} rotation={[0, 0, 0.42]} castShadow>
          <cylinderGeometry args={[0.008, 0.008, 0.08, 8]} />
          <meshStandardMaterial color={STEEL} metalness={0.75} roughness={0.3} />
        </mesh>
        {/* Upper arm — thin elegant */}
        <mesh position={[0.055, -0.06, 0]} rotation={[0, 0, 0.48]} castShadow>
          <capsuleGeometry args={[0.022, 0.1, 6, 14]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        {/* Knuckle */}
        <mesh position={[0.09, -0.145, 0]} castShadow>
          <sphereGeometry args={[0.024, 14, 14]} />
          <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.32} />
        </mesh>
        <mesh position={[0.09, -0.145, 0]} rotation={[Math.PI / 2, 0, 0.25]}>
          <torusGeometry args={[0.028, 0.005, 8, 16]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.4}
            toneMapped={false}
          />
        </mesh>
        {/* Mid C-curve — thin */}
        <mesh position={[0.115, -0.24, 0]} rotation={[0, 0, 0.95]} castShadow>
          <capsuleGeometry args={[0.02, 0.1, 6, 14]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        {/* Tip hook */}
        <mesh position={[0.1, -0.33, 0.01]} rotation={[0.2, 0, 1.35]} castShadow>
          <capsuleGeometry args={[0.016, 0.07, 5, 12]} />
          <meshStandardMaterial color={STEEL_DARK} metalness={0.68} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Slim 3-blade claw — strictly inside glass cylinder (R≈1.45).
 * Compact gantry under ceiling; thin fingers; red/cyan fill only.
 */
function ClawAssembly({ phase, clawX }: { phase: ClawPhase; clawX: number }) {
  const slipped = useSlipped(phase);
  const hold = clawShouldHoldPrize(phase, slipped);
  const open = clawFingersOpen(phase, slipped);
  const group = useRef<THREE.Group>(null);
  const f0 = useRef<THREE.Group>(null);
  const f1 = useRef<THREE.Group>(null);
  const f2 = useRef<THREE.Group>(null);
  const prize = useRef<THREE.Group>(null);
  const fall = useRef(0);
  const cableScale = useRef(0.45);

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
      phase === "drop" ? 3.4 : 5,
      dt
    );

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
        prize.current.position.set(0, -0.38, 0.02);
      } else if (phase === "slip" || phase === "lose") {
        prize.current.visible = true;
        fall.current += dt * 2.3;
        prize.current.position.y = -0.38 - fall.current;
        if (fall.current > 1.5) prize.current.visible = false;
      } else {
        prize.current.visible = false;
        fall.current = 0;
      }
    }
  });

  const baseCable = 0.7;

  return (
    <group
      ref={group}
      position={[0, 0.85, 0.05]}
      scale={1.15}
      userData={{
        clawBlades: CLAW_BLADES,
        style: "solid-metal-3blade",
        containment: "inside-glass-cylinder",
        maxTravelX: 0.48,
      }}
    >
      {/* Compact ceiling carriage — stays under crown, inside R */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.42, 0.14, 0.28]} />
        <meshStandardMaterial {...metal("#12161e", 0.92, 0.25)} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.95, 0.06, 0.1]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.9, 0.28)} />
      </mesh>
      <mesh position={[0, 0.54, 0]}>
        <boxGeometry args={[0.9, 0.012, 0.035]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.3}
          toneMapped={false}
        />
      </mesh>
      {/* Slim hydraulic tubes */}
      {[-0.14, 0.14].map((sx) => (
        <mesh
          key={sx}
          position={[sx, 0.32, 0.06]}
          rotation={[0.15, 0, 0]}
          castShadow
        >
          <cylinderGeometry args={[0.016, 0.018, 0.22, 10]} />
          <meshStandardMaterial {...metal("#1a2030", 0.88, 0.32)} />
        </mesh>
      ))}
      {/* Cable reel */}
      <mesh position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.08, 16]} />
        <meshStandardMaterial {...metal("#2a303c", 0.9, 0.28)} />
      </mesh>

      {/* Steel cable */}
      <mesh
        position={[0, 0.22 - (baseCable * cableScale.current) / 2, 0]}
        scale={[1, cableScale.current, 1]}
      >
        <cylinderGeometry args={[0.016, 0.014, baseCable, 12]} />
        <meshStandardMaterial color="#1a1c20" metalness={0.92} roughness={0.3} />
      </mesh>

      {/* Slim motor + 3 thin blades */}
      <group
        position={[0, 0.22 - baseCable * cableScale.current - 0.06, 0]}
        userData={{ fingers: CLAW_BLADES, motor: true }}
      >
        <mesh position={[0, 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.04, 0.06, 14]} />
          <meshStandardMaterial {...metal("#1a1e28", 0.9, 0.28)} />
        </mesh>
        {/* Compact motor — not fat weight */}
        <mesh castShadow>
          <cylinderGeometry args={[0.1, 0.11, 0.18, 28]} />
          <meshStandardMaterial color="#2a323e" metalness={0.72} roughness={0.32} />
        </mesh>
        <mesh position={[0, 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.1, 0.04, 24]} />
          <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Red neon collars */}
        <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.112, 0.01, 10, 32]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.4}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, -0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.114, 0.008, 10, 32]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.2}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, -0.12, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.055, 0.06, 20]} />
          <meshStandardMaterial color={STEEL_DARK} metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.18, 0]} castShadow>
          <sphereGeometry args={[0.045, 18, 18]} />
          <meshStandardMaterial color={CHROME} metalness={0.75} roughness={0.28} />
        </mesh>

        {/* Exactly 3 thin metal blades */}
        <group position={[0, -0.18, 0]}>
          <MetalBlade fingerRef={f0} yaw={-0.95} />
          <MetalBlade fingerRef={f1} yaw={0.95} />
          <MetalBlade fingerRef={f2} yaw={Math.PI} />
          {/* Soft red/cyan fill — no white */}
          <pointLight
            position={[0.1, -0.1, 0.2]}
            intensity={1.4}
            color={CYAN}
            distance={1.4}
          />
          <pointLight
            position={[-0.1, -0.12, 0.18]}
            intensity={1.3}
            color={RED}
            distance={1.3}
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
    const n = 100;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.5;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
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
      <pointsMaterial size={0.04} color={GOLD} transparent opacity={0.9} sizeAttenuation />
    </points>
  );
}

export function ClawScene({ phase, clawX }: ClawSceneProps) {
  const root = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((state, dt) => {
    t.current += dt;
    // Exterior front-hero framing
    state.camera.lookAt(0, 0.05, 0);
    if (root.current && (phase === "idle" || phase === "ready")) {
      root.current.rotation.y = Math.sin(t.current * 0.12) * 0.05;
    }
    if (phase === "win" && root.current) {
      root.current.position.x = Math.sin(performance.now() * 0.04) * 0.02;
    }
  });

  return (
    <>
      <color attach="background" args={["#04060a"]} />
      <fog attach="fog" args={["#04060a", 9, 20]} />

      {/* Dark-neon lighting — red/cyan only, enough ambient for metal form */}
      <ambientLight intensity={0.28} />
      <directionalLight
        position={[3.5, 5, 4]}
        intensity={0.55}
        color="#90a0b8"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-2.2, 1.8, 2.5]} intensity={1.5} color={CYAN} />
      <pointLight position={[2.2, 1.5, 2.5]} intensity={1.65} color={RED} />
      <pointLight position={[0, 1.2, 1.5]} intensity={0.85} color={CYAN} />
      <pointLight position={[0, 0.3, 1.4]} intensity={1.0} color={RED} />
      <pointLight position={[0, -0.9, 0.4]} intensity={0.5} color={PURPLE} />
      <spotLight
        position={[0, 3.2, 1.8]}
        angle={0.5}
        penumbra={0.65}
        intensity={1.1}
        color={CYAN}
      />
      <spotLight
        position={[0, 1.4, -1.5]}
        angle={0.55}
        penumbra={0.7}
        intensity={0.65}
        color={RED}
      />

      <group ref={root}>
        <VaultShell />
        <PrizePile phase={phase} />
        <ClawAssembly phase={phase} clawX={clawX} />
        <WinBurst active={phase === "win"} />
      </group>

      <ContactShadows
        position={[0, -1.78, 0]}
        opacity={0.75}
        scale={12}
        blur={2.8}
        far={6}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.55}
          luminanceThreshold={0.72}
          luminanceSmoothing={0.35}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
