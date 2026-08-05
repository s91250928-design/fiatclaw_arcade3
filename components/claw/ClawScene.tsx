"use client";

/**
 * React Three Fiber WebGL claw arcade — unified FiatClaw cyber-neon style.
 * Face cabinet + 3-finger red-neon claw (refs) + money prize pile.
 * Driven by parent phase + clawX (0–100). No client outcome RNG.
 */

import { useMemo, useRef, type MutableRefObject, type Ref } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, RoundedBox, Text } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import {
  clawFingersOpen,
  clawShouldHoldPrize,
  updateSlippedLatch,
  type ClawPhase,
} from "@/lib/game/claw-phases";
import { buildPrizePileLayout } from "@/lib/game/prize-visuals";
import { AnimatedPrize, PrizeMeshByKind } from "./PrizeMeshes";

const RED = "#FF3E5C";
const CYAN = "#22D3FF";

export interface ClawSceneProps {
  phase: ClawPhase;
  clawX: number;
}

function useSlipped(phase: ClawPhase) {
  const slipped = useRef(false);
  slipped.current = updateSlippedLatch(phase, slipped.current);
  return slipped.current;
}

function mapClawX(pct: number) {
  const t = (Math.min(88, Math.max(12, pct)) - 50) / 38;
  return t * 0.95;
}

function targetClawY(phase: ClawPhase) {
  switch (phase) {
    case "drop":
    case "close":
      return 0.32;
    case "lift":
    case "hold":
    case "win":
      return 1.55;
    case "slip":
      return 0.85;
    case "return":
    case "lose":
      return 1.5;
    default:
      return 1.55;
  }
}

/** Neon edge strip */
function NeonEdge({
  position,
  args,
  color,
}: {
  position: [number, number, number];
  args: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={2.4}
        toneMapped={false}
      />
    </mesh>
  );
}

const metal = {
  color: "#1a1e28",
  metalness: 0.88,
  roughness: 0.32,
} as const;

/** Marker for structural tests — shell must not be a solid blocking box. */
export const CABINET_SHELL_MODE = "hollow-open-front" as const;

/**
 * Hollow cabinet: face-forward vitrine (ref machine).
 * Interior playfield visible through wide glass — no solid fill plate.
 */
function CabinetShell() {
  const W = 3.05;
  const H = 3.55;
  const D = 1.85;
  const wall = 0.1;
  const winW = 2.35;
  const winH = 2.15;
  const winY = 0.48;
  const frontZ = D / 2 - 0.02;

  return (
    <group userData={{ shell: "face-vitrine" }}>
      {/* Back wall */}
      <mesh position={[0, 0.15, -D / 2 + wall / 2]} castShadow receiveShadow>
        <boxGeometry args={[W - wall * 2, H - 0.2, wall]} />
        <meshStandardMaterial {...metal} color="#0e1016" />
      </mesh>

      {/* Side walls — slim so face dominates (no bulk body) */}
      <mesh position={[-W / 2 + wall / 2, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[wall, H - 0.2, D]} />
        <meshStandardMaterial {...metal} color="#151922" />
      </mesh>
      <mesh position={[W / 2 - wall / 2, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[wall, H - 0.2, D]} />
        <meshStandardMaterial {...metal} color="#151922" />
      </mesh>

      {/* Top cap */}
      <mesh position={[0, H / 2 - 0.05, 0]} castShadow>
        <boxGeometry args={[W, wall * 1.4, D]} />
        <meshStandardMaterial {...metal} color="#1c2030" />
      </mesh>
      <mesh position={[0, -0.55, 0.05]} receiveShadow>
        <boxGeometry args={[W - wall * 2.2, wall, D - wall * 1.5]} />
        <meshStandardMaterial {...metal} color="#0a0c10" roughness={0.55} />
      </mesh>

      {/* Front frame — top bar (marquee seat) */}
      <mesh position={[0, winY + winH / 2 + 0.2, frontZ]} castShadow>
        <boxGeometry args={[W - wall, 0.4, 0.14]} />
        <meshStandardMaterial {...metal} color="#1a1e28" />
      </mesh>
      {/* Front frame — bottom bar */}
      <mesh position={[0, winY - winH / 2 - 0.14, frontZ]} castShadow>
        <boxGeometry args={[W - wall, 0.28, 0.14]} />
        <meshStandardMaterial {...metal} color="#1a1e28" />
      </mesh>
      {/* Front stiles — thin face frame only */}
      <mesh position={[-winW / 2 - 0.16, winY, frontZ]} castShadow>
        <boxGeometry args={[0.24, winH + 0.55, 0.12]} />
        <meshStandardMaterial {...metal} color="#222836" />
      </mesh>
      <mesh position={[winW / 2 + 0.16, winY, frontZ]} castShadow>
        <boxGeometry args={[0.24, winH + 0.55, 0.12]} />
        <meshStandardMaterial {...metal} color="#222836" />
      </mesh>

      {/* Inner bevel */}
      <mesh position={[0, winY + winH / 2 - 0.02, frontZ + 0.02]}>
        <boxGeometry args={[winW + 0.08, 0.05, 0.06]} />
        <meshStandardMaterial color="#2a3040" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0, winY - winH / 2 + 0.02, frontZ + 0.02]}>
        <boxGeometry args={[winW + 0.08, 0.05, 0.06]} />
        <meshStandardMaterial color="#2a3040" metalness={0.9} roughness={0.25} />
      </mesh>

      {/* Slim face pillars (not full side body) */}
      <mesh position={[-W / 2 + 0.1, 0.2, frontZ - 0.08]} castShadow>
        <boxGeometry args={[0.14, H - 0.55, 0.28]} />
        <meshStandardMaterial color="#2a3040" metalness={0.92} roughness={0.26} />
      </mesh>
      <mesh position={[W / 2 - 0.1, 0.2, frontZ - 0.08]} castShadow>
        <boxGeometry args={[0.14, H - 0.55, 0.28]} />
        <meshStandardMaterial color="#2a3040" metalness={0.92} roughness={0.26} />
      </mesh>

      {/* Header marquee plate */}
      <RoundedBox
        args={[2.6, 0.38, 0.1]}
        radius={0.02}
        position={[0, winY + winH / 2 + 0.4, frontZ + 0.04]}
      >
        <meshStandardMaterial color="#12151c" metalness={0.7} roughness={0.35} />
      </RoundedBox>

      {/* FIATCLAW ARCADE neon text */}
      <Text
        position={[0, winY + winH / 2 + 0.4, frontZ + 0.1]}
        fontSize={0.155}
        letterSpacing={0.1}
        color={RED}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.006}
        outlineColor="#ff1a3c"
        fillOpacity={1}
      >
        FIATCLAW ARCADE
      </Text>

      {/* Neon edges — red top, cyan/red sides (machine ref) */}
      <NeonEdge
        position={[0, winY + winH / 2 + 0.62, frontZ + 0.05]}
        args={[2.55, 0.028, 0.028]}
        color={RED}
      />
      <NeonEdge
        position={[0, winY + winH / 2 + 0.18, frontZ + 0.06]}
        args={[2.4, 0.018, 0.018]}
        color={CYAN}
      />
      <NeonEdge
        position={[-W / 2 + 0.04, 0.25, frontZ]}
        args={[0.028, 2.7, 0.028]}
        color={CYAN}
      />
      <NeonEdge
        position={[W / 2 - 0.04, 0.25, frontZ]}
        args={[0.028, 2.7, 0.028]}
        color={RED}
      />
      <NeonEdge
        position={[0, winY - winH / 2 - 0.28, frontZ + 0.02]}
        args={[2.6, 0.022, 0.022]}
        color={CYAN}
      />

      {/* Control deck mass (HTML controls overlay the bottom) */}
      <RoundedBox
        args={[2.95, 0.75, 0.55]}
        radius={0.04}
        position={[0, -1.62, 0.72]}
      >
        <meshStandardMaterial color="#141820" metalness={0.78} roughness={0.38} />
      </RoundedBox>

      {/* Interior red rail accents (machine ref) */}
      <mesh position={[0.7, -0.05, 0.15]}>
        <boxGeometry args={[0.04, 0.04, 1.1]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[-0.7, 0.9, 0.1]}>
        <boxGeometry args={[0.035, 0.035, 0.9]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={0.9}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Transparent glass only — no opaque plate behind it. */
function GlassPanel() {
  return (
    <mesh position={[0, 0.48, 0.9]} renderOrder={2}>
      <boxGeometry args={[2.3, 2.1, 0.03]} />
      <meshPhysicalMaterial
        color="#b8dce8"
        metalness={0}
        roughness={0.04}
        transmission={0.92}
        thickness={0.35}
        transparent
        opacity={0.2}
        ior={1.4}
        envMapIntensity={0.8}
        clearcoat={1}
        clearcoatRoughness={0.06}
        depthWrite={false}
      />
    </mesh>
  );
}

function ChamberFloor() {
  const grid = useMemo(() => {
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.32,
    });
    const matR = new THREE.LineBasicMaterial({
      color: RED,
      transparent: true,
      opacity: 0.16,
    });
    const w = 2.15;
    const d = 1.55;
    const step = 0.18;
    for (let x = -w / 2; x <= w / 2 + 0.001; x += step) {
      const pts = [
        new THREE.Vector3(x, 0.012, -d / 2),
        new THREE.Vector3(x, 0.012, d / 2),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      g.add(new THREE.Line(geo, Math.abs(x) < 0.01 ? matR : mat));
    }
    for (let z = -d / 2; z <= d / 2 + 0.001; z += step) {
      const pts = [
        new THREE.Vector3(-w / 2, 0.012, z),
        new THREE.Vector3(w / 2, 0.012, z),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      g.add(new THREE.Line(geo, mat));
    }
    return g;
  }, []);

  return (
    <group position={[0, -0.35, 0.32]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.15, 1.55]} />
        <meshStandardMaterial color="#0c0e14" metalness={0.45} roughness={0.7} />
      </mesh>
      <primitive object={grid} />
    </group>
  );
}

function Prizes({ phase }: { phase: ClawPhase }) {
  const layout = useMemo(() => buildPrizePileLayout(42), []);
  const dim = phase === "win" ? 0.4 : 1;
  return (
    <group
      position={[0, -0.35, 0.32]}
      userData={{
        prizePile: "money",
        prizeCount: layout.length,
        moneyOnly: true,
        kinds: "fiatclaw_token+crystal_purple+sol_token",
      }}
    >
      {layout.map((spec, i) => (
        <AnimatedPrize key={i} spec={spec} dim={dim} />
      ))}
    </group>
  );
}

/**
 * Single finger matching claw ref: curved black metal + red neon edge strip.
 * Rotation around local Z opens/closes.
 */
function ClawFinger({
  fingerRef,
  yaw,
}: {
  fingerRef: MutableRefObject<THREE.Group | null>;
  yaw: number;
}) {
  const blackMetal = {
    color: "#1a1c22",
    metalness: 0.9,
    roughness: 0.28,
  } as const;

  return (
    <group rotation={[0, yaw, 0]}>
      <group ref={fingerRef as Ref<THREE.Group>} position={[0.07, -0.02, 0]}>
        {/* Upper arm link */}
        <mesh position={[0.02, -0.1, 0]} castShadow rotation={[0, 0, 0.15]}>
          <boxGeometry args={[0.055, 0.2, 0.045]} />
          <meshStandardMaterial {...blackMetal} />
        </mesh>
        {/* Joint ball */}
        <mesh position={[0.04, -0.2, 0]} castShadow>
          <sphereGeometry args={[0.028, 12, 12]} />
          <meshStandardMaterial color="#2a2e38" metalness={0.85} roughness={0.3} />
        </mesh>
        {/* Lower curved finger body */}
        <mesh position={[0.08, -0.32, 0]} castShadow rotation={[0, 0, 0.55]}>
          <boxGeometry args={[0.048, 0.22, 0.04]} />
          <meshStandardMaterial {...blackMetal} color="#12141a" />
        </mesh>
        {/* Tip hook */}
        <mesh position={[0.14, -0.42, 0]} castShadow rotation={[0.2, 0, 0.9]}>
          <boxGeometry args={[0.038, 0.1, 0.032]} />
          <meshStandardMaterial {...blackMetal} color="#0e1016" />
        </mesh>
        {/* Red neon edge strip along outer curve */}
        <mesh position={[0.05, -0.18, 0.022]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[0.014, 0.16, 0.012]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.6}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0.1, -0.34, 0.022]} rotation={[0, 0, 0.55]}>
          <boxGeometry args={[0.014, 0.18, 0.012]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.8}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0.15, -0.43, 0.018]} rotation={[0.2, 0, 0.9]}>
          <boxGeometry args={[0.012, 0.08, 0.01]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * 3-finger red-neon claw from claw-ref.jpg:
 * black cylindrical motor housing + dual red rings + cable + carabiner + center probe.
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
  const cableMesh = useRef<THREE.Mesh>(null);

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
      phase === "drop" ? 4 : 5.5,
      dt
    );

    // Finger open angle around local Z (hinge)
    const openAng = open ? 0.72 : 0.12;
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

    if (prize.current) {
      if (hold) {
        fall.current = 0;
        prize.current.visible = true;
        prize.current.position.set(0, -0.48, 0);
      } else if (phase === "slip" || phase === "lose") {
        prize.current.visible = true;
        fall.current += dt * 2.2;
        prize.current.position.y = -0.48 - fall.current;
        prize.current.position.x = Math.sin(fall.current * 3) * 0.05;
        if (fall.current > 1.4) prize.current.visible = false;
      } else {
        prize.current.visible = false;
        fall.current = 0;
      }
    }
  });

  // Dynamic cable length from gantry to housing
  const cableLen =
    phase === "drop" || phase === "close"
      ? 0.95
      : phase === "slip"
        ? 0.65
        : 0.32;

  const blackMetal = {
    color: "#1a1c22",
    metalness: 0.92,
    roughness: 0.26,
  } as const;

  return (
    <group ref={group} position={[0, 1.55, 0.52]} castShadow>
      {/* Gantry rail */}
      <mesh position={[0, 0.26, 0]} castShadow>
        <boxGeometry args={[2.3, 0.055, 0.09]} />
        <meshStandardMaterial color="#3a4458" metalness={0.9} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.29, 0]}>
        <boxGeometry args={[2.25, 0.012, 0.035]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.3}
          toneMapped={false}
        />
      </mesh>

      {/* Carriage block */}
      <mesh position={[0, 0.16, 0]} castShadow>
        <boxGeometry args={[0.4, 0.13, 0.3]} />
        <meshStandardMaterial {...blackMetal} color="#222632" />
      </mesh>

      {/* Braided black cable (ref) — key remounts geometry when length changes */}
      <mesh
        key={`cable-${cableLen.toFixed(2)}`}
        ref={cableMesh}
        position={[0, -cableLen / 2 + 0.08, 0]}
      >
        <cylinderGeometry args={[0.016, 0.016, cableLen, 12]} />
        <meshStandardMaterial color="#0a0a0c" metalness={0.55} roughness={0.55} />
      </mesh>
      <mesh
        key={`cable2-${cableLen.toFixed(2)}`}
        position={[0.006, -cableLen / 2 + 0.08, 0.005]}
      >
        <cylinderGeometry args={[0.009, 0.009, cableLen * 0.98, 8]} />
        <meshStandardMaterial color="#1a1a20" metalness={0.6} roughness={0.5} />
      </mesh>

      {/* Silver carabiner ring */}
      <mesh
        position={[0, -cableLen + 0.02, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <torusGeometry args={[0.035, 0.008, 10, 24]} />
        <meshStandardMaterial color="#c8d0e0" metalness={0.95} roughness={0.15} />
      </mesh>

      {/* Motor housing — cylindrical black + dual red neon rings (claw ref) */}
      <group position={[0, -cableLen - 0.12, 0]} userData={{ motor: true }}>
        {/* Main cylinder body */}
        <mesh castShadow>
          <cylinderGeometry args={[0.14, 0.15, 0.22, 32]} />
          <meshStandardMaterial {...blackMetal} color="#14161c" />
        </mesh>
        {/* Top cap disc */}
        <mesh position={[0, 0.12, 0]} castShadow>
          <cylinderGeometry args={[0.13, 0.14, 0.04, 32]} />
          <meshStandardMaterial {...blackMetal} color="#1c2030" />
        </mesh>
        {/* Dual red neon rings */}
        <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.145, 0.012, 10, 40]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.148, 0.011, 10, 40]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.6}
            toneMapped={false}
          />
        </mesh>
        {/* Front red power button */}
        <mesh position={[0, 0.02, 0.145]}>
          <cylinderGeometry args={[0.022, 0.022, 0.02, 16]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.2}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0.02, 0.152]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.016, 16]} />
          <meshStandardMaterial
            color="#ff6a7e"
            emissive={RED}
            emissiveIntensity={1.5}
            toneMapped={false}
          />
        </mesh>
        {/* Lower collar */}
        <mesh position={[0, -0.1, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.08, 0.06, 24]} />
          <meshStandardMaterial {...blackMetal} color="#0e1016" />
        </mesh>
        {/* Pivot hub */}
        <mesh position={[0, -0.16, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.06, 16]} />
          <meshStandardMaterial color="#2a3040" metalness={0.9} roughness={0.25} />
        </mesh>
      </group>

      {/* Three fingers @ 120° + center red probe */}
      <group
        position={[0, -cableLen - 0.3, 0]}
        userData={{ fingers: 3, style: "red-neon-metal" }}
      >
        <ClawFinger fingerRef={f0} yaw={0} />
        <ClawFinger fingerRef={f1} yaw={(Math.PI * 2) / 3} />
        <ClawFinger fingerRef={f2} yaw={(Math.PI * 4) / 3} />

        {/* Center red neon probe/rod (ref) */}
        <mesh position={[0, -0.28, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.01, 0.42, 12]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.4}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, -0.48, 0]}>
          <sphereGeometry args={[0.018, 12, 12]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>

        {/* Held / falling money prize */}
        <group ref={prize} position={[0, -0.52, 0]} visible={false}>
          <PrizeMeshByKind kind="fiatclaw_token" scale={hold ? 1.15 : 1} />
        </group>
      </group>
    </group>
  );
}

function WinBurst({ active }: { active: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 90;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.25;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.25;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((s) => {
    if (!ref.current || !active) return;
    ref.current.rotation.y = s.clock.elapsedTime * 2;
    const sc = 1 + Math.sin(s.clock.elapsedTime * 6) * 0.15;
    ref.current.scale.setScalar(sc * 1.5);
  });
  if (!active) return null;
  return (
    <points ref={ref} position={[0, 1.2, 0.8]} geometry={geo}>
      <pointsMaterial
        size={0.04}
        color={RED}
        transparent
        opacity={0.85}
        sizeAttenuation
      />
    </points>
  );
}

function OverlayBillboard({ color }: { color: string }) {
  return (
    <group position={[0, 0.7, 1.2]}>
      <mesh>
        <planeGeometry args={[1.6, 0.45]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.45} />
      </mesh>
      <NeonEdge position={[0, 0, 0.01]} args={[1.55, 0.02, 0.01]} color={color} />
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[1.4, 0.22]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.6}
          toneMapped={false}
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
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
        Math.sin(performance.now() * 0.04) * 0.012 * shake.current;
      root.current.position.x =
        Math.sin(performance.now() * 0.05) * 0.02 * shake.current;
    } else {
      shake.current = Math.max(0, shake.current - dt * 3);
      root.current.rotation.z = THREE.MathUtils.damp(
        root.current.rotation.z,
        0,
        8,
        dt
      );
      root.current.position.x = THREE.MathUtils.damp(
        root.current.position.x,
        0,
        8,
        dt
      );
    }
  });

  return (
    <>
      <color attach="background" args={["#0a0b10"]} />
      <fog attach="fog" args={["#0a0b10", 6, 14]} />

      <ambientLight intensity={0.32} />
      <directionalLight
        position={[3, 6, 4]}
        intensity={0.85}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-2, 2, 2]} intensity={0.75} color={CYAN} />
      <pointLight position={[2, 1.5, 2]} intensity={0.85} color={RED} />
      <pointLight position={[0, 1.2, 1.2]} intensity={0.5} color="#ffffff" />
      {/* Chamber top light bar (machine ref) */}
      <spotLight
        position={[0, 2.8, 0.6]}
        angle={0.55}
        penumbra={0.5}
        intensity={1.1}
        color="#e8f0ff"
      />
      <pointLight position={[0, 1.8, 0.5]} intensity={0.6} color={RED} />

      <group ref={root} position={[0, -0.12, 0]}>
        <CabinetShell />
        <GlassPanel />
        <ChamberFloor />
        <Prizes phase={phase} />
        <ClawAssembly phase={phase} clawX={clawX} />
        <WinBurst active={phase === "win"} />
        {phase === "win" && <OverlayBillboard color={RED} />}
        {phase === "lose" && <OverlayBillboard color="#9BA1AE" />}
      </group>

      <ContactShadows
        position={[0, -1.95, 0]}
        opacity={0.55}
        scale={8}
        blur={2.5}
        far={4}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.55}
          luminanceThreshold={0.48}
          luminanceSmoothing={0.35}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
