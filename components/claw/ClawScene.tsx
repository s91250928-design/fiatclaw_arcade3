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
const CHROME = "#e4e8f0";

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

function mapClawX(pct: number) {
  return ((Math.min(88, Math.max(12, pct)) - 50) / 38) * 0.75;
}

function targetClawY(phase: ClawPhase) {
  switch (phase) {
    case "drop":
    case "close":
      return 0.05;
    case "lift":
    case "hold":
    case "win":
      return 0.62;
    case "slip":
      return 0.25;
    case "return":
    case "lose":
      return 0.58;
    default:
      return 0.62;
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
            emissiveIntensity={2.2}
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

      {/* Ceiling light ring */}
      <mesh position={[0, 1.52, 0]}>
        <torusGeometry args={[0.85, 0.045, 10, 48]} />
        <meshStandardMaterial
          color="#e8f0ff"
          emissive="#ffffff"
          emissiveIntensity={2.4}
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
 * SOLID metal 3-blade claw (etalon chrome industrial C-fingers).
 * Short thick lobes hang ABOVE the prize pile — never neon sticks.
 */
function MetalBlade({
  fingerRef,
  yaw,
}: {
  fingerRef: React.MutableRefObject<THREE.Group | null>;
  yaw: number;
}) {
  const chrome = {
    color: "#f2f4f8",
    metalness: 0.88,
    roughness: 0.14,
    envMapIntensity: 1.6,
  } as const;
  return (
    <group rotation={[0, yaw, 0]}>
      <group ref={fingerRef as React.Ref<THREE.Group>} position={[0.07, 0, 0]}>
        <mesh position={[0.025, 0, 0]} castShadow>
          <boxGeometry args={[0.09, 0.07, 0.08]} />
          <meshStandardMaterial {...metal("#4a5260", 0.88, 0.24)} />
        </mesh>
        {/* Upper arm */}
        <mesh position={[0.09, -0.08, 0]} rotation={[0, 0, 0.48]} castShadow>
          <capsuleGeometry args={[0.05, 0.11, 8, 20]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        {/* Knuckle + red ring */}
        <mesh position={[0.14, -0.18, 0]} castShadow>
          <sphereGeometry args={[0.048, 18, 18]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        <mesh position={[0.14, -0.18, 0]} rotation={[Math.PI / 2, 0, 0.3]}>
          <torusGeometry args={[0.052, 0.01, 8, 24]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2}
            toneMapped={false}
          />
        </mesh>
        {/* Mid curve */}
        <mesh position={[0.17, -0.3, 0]} rotation={[0, 0, 0.95]} castShadow>
          <capsuleGeometry args={[0.046, 0.12, 8, 20]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        {/* Tip */}
        <mesh position={[0.14, -0.4, 0.01]} rotation={[0.2, 0, 1.35]} castShadow>
          <capsuleGeometry args={[0.034, 0.08, 6, 14]} />
          <meshStandardMaterial
            color="#c8d0dc"
            metalness={0.85}
            roughness={0.18}
          />
        </mesh>
      </group>
    </group>
  );
}

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
  const cableScale = useRef(0.5);

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

    // Cohesive 3-lobe open — hang above pile (don't stab floor)
    const openAng = open ? 0.28 : 0.05;
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
        ? 0.88
        : phase === "slip"
          ? 0.55
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
        prize.current.position.set(0, -0.52, 0.04);
      } else if (phase === "slip" || phase === "lose") {
        prize.current.visible = true;
        fall.current += dt * 2.3;
        prize.current.position.y = -0.52 - fall.current;
        if (fall.current > 1.5) prize.current.visible = false;
      } else {
        prize.current.visible = false;
        fall.current = 0;
      }
    }
  });

  const baseCable = 0.85;

  return (
    <group
      ref={group}
      position={[0, 0.95, 0.38]}
      scale={1.75}
      userData={{
        clawBlades: CLAW_BLADES,
        style: "solid-metal-3blade",
      }}
    >
      {/* Heavy multi-rail gantry (etalon ceiling mech) */}
      <mesh position={[0, 0.52, 0]} castShadow>
        <boxGeometry args={[0.9, 0.28, 0.55]} />
        <meshStandardMaterial {...metal("#12161e", 0.94, 0.2)} />
      </mesh>
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[2.1, 0.1, 0.16]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.93, 0.22)} />
      </mesh>
      <mesh position={[0, 0.66, 0]}>
        <boxGeometry args={[2.05, 0.016, 0.05]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
      {/* Hydraulic tubes left/right */}
      {[-0.28, 0.28].map((sx) => (
        <group key={sx}>
          <mesh position={[sx, 0.4, 0.12]} rotation={[0.2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.04, 0.35, 12]} />
            <meshStandardMaterial {...metal("#1a2030", 0.9, 0.3)} />
          </mesh>
          <mesh position={[sx, 0.22, 0.16]} castShadow>
            <sphereGeometry args={[0.04, 12, 12]} />
            <meshStandardMaterial {...metal(CHROME, 0.96, 0.12)} />
          </mesh>
        </group>
      ))}
      {/* Cable reel */}
      <mesh position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.14, 20]} />
        <meshStandardMaterial {...metal("#2a303c", 0.92, 0.24)} />
      </mesh>

      {/* Thick braided steel cable */}
      <mesh
        position={[0, 0.28 - (baseCable * cableScale.current) / 2, 0]}
        scale={[1, cableScale.current, 1]}
      >
        <cylinderGeometry args={[0.038, 0.034, baseCable, 16]} />
        <meshStandardMaterial color="#14161a" metalness={0.94} roughness={0.28} />
      </mesh>
      {/* Cable guide rings */}
      <mesh
        position={[0, 0.28 - baseCable * cableScale.current * 0.35, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <torusGeometry args={[0.05, 0.012, 8, 16]} />
        <meshStandardMaterial {...metal(CHROME, 0.96, 0.12)} />
      </mesh>

      {/* Motor housing + 3 solid metal blades */}
      <group
        position={[0, 0.28 - baseCable * cableScale.current - 0.1, 0]}
        userData={{ fingers: CLAW_BLADES, motor: true }}
      >
        {/* Cable clamp */}
        <mesh position={[0, 0.14, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.08, 0.1, 16]} />
          <meshStandardMaterial {...metal("#1a1e28", 0.93, 0.22)} />
        </mesh>
        {/* Motor body — heavy dark cylinder with chrome top cap */}
        <mesh castShadow>
          <cylinderGeometry args={[0.2, 0.22, 0.32, 36]} />
          <meshStandardMaterial {...metal("#1c222c", 0.92, 0.18)} />
        </mesh>
        <mesh position={[0, 0.14, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.2, 0.06, 32]} />
          <meshStandardMaterial
            color={CHROME}
            metalness={0.95}
            roughness={0.1}
          />
        </mesh>
        {/* Red neon collar rings */}
        <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.215, 0.016, 12, 48]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, -0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.218, 0.014, 12, 48]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.3}
            toneMapped={false}
          />
        </mesh>
        {/* Gold badge band */}
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.205, 0.01, 10, 40]} />
          <meshStandardMaterial
            color={GOLD}
            emissive={GOLD}
            emissiveIntensity={0.5}
            metalness={0.9}
            roughness={0.18}
            toneMapped={false}
          />
        </mesh>
        {/* Collar + pivot */}
        <mesh position={[0, -0.2, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.11, 0.1, 28]} />
          <meshStandardMaterial {...metal("#0e1218", 0.94, 0.2)} />
        </mesh>
        <mesh position={[0, -0.3, 0]} castShadow>
          <sphereGeometry args={[0.085, 24, 24]} />
          <meshStandardMaterial {...metal(CHROME, 0.97, 0.1)} />
        </mesh>

        {/* Exactly 3 thick chrome C-blades — front L/R + rear */}
        <group position={[0, -0.28, 0]}>
          <MetalBlade fingerRef={f0} yaw={-0.95} />
          <MetalBlade fingerRef={f1} yaw={0.95} />
          <MetalBlade fingerRef={f2} yaw={Math.PI} />
          {/* Local key light so chrome reads */}
          <pointLight
            position={[0, -0.15, 0.25]}
            intensity={1.6}
            color="#fff0f4"
            distance={1.8}
          />
          <group ref={prize} visible={false}>
            <PrizeMeshByKind kind="fiatclaw_token" scale={hold ? 1.35 : 1} />
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
      <color attach="background" args={["#06080e"]} />
      <fog attach="fog" args={["#06080e", 10, 22]} />

      <ambientLight intensity={0.48} />
      <directionalLight
        position={[4, 6, 5]}
        intensity={1.25}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-2.2, 1.8, 2.5]} intensity={1.15} color={CYAN} />
      <pointLight position={[2.2, 1.5, 2.5]} intensity={1.35} color={RED} />
      <pointLight position={[0, 0.9, 2.2]} intensity={1.1} color="#ffffff" />
      <pointLight position={[0, 0.4, 0.8]} intensity={1.4} color="#ffe8f0" />
      <pointLight position={[0, -0.8, 0.5]} intensity={0.55} color={PURPLE} />
      <spotLight
        position={[0, 3.5, 2.2]}
        angle={0.48}
        penumbra={0.5}
        intensity={2.2}
        color="#f0f4ff"
      />
      <spotLight
        position={[0, 1.5, -1.5]}
        angle={0.55}
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
        position={[0, -1.78, 0]}
        opacity={0.6}
        scale={12}
        blur={2.6}
        far={6}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.4}
          luminanceThreshold={0.52}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
