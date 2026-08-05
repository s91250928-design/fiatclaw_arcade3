"use client";

/**
 * FiatClaw R3F scene — visual ground truth = refs 1–3 (not photo-4 low-poly).
 * Machine face proportions, red-neon 3-blade claw (claw-ref texture + mesh),
 * dense prize pile (prizes-ref texture + money meshes).
 */

import { useMemo, useRef, type MutableRefObject, type Ref } from "react";
import { useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  RoundedBox,
  Text,
  useTexture,
} from "@react-three/drei";
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
import { useChromaTexture } from "./useChromaTexture";

const RED = "#FF3E5C";
const CYAN = "#22D3FF";

export interface ClawSceneProps {
  phase: ClawPhase;
  clawX: number;
}

export const CABINET_SHELL_MODE = "hollow-open-front" as const;
/** Structural marker: three blades from claw ref. */
export const CLAW_BLADES = CLAW_FINGER_COUNT;

function useSlipped(phase: ClawPhase) {
  const slipped = useRef(false);
  slipped.current = updateSlippedLatch(phase, slipped.current);
  return slipped.current;
}

function mapClawX(pct: number) {
  const t = (Math.min(88, Math.max(12, pct)) - 50) / 38;
  return t * 0.85;
}

function targetClawY(phase: ClawPhase) {
  switch (phase) {
    case "drop":
    case "close":
      return -0.05;
    case "lift":
    case "hold":
    case "win":
      return 1.15;
    case "slip":
      return 0.45;
    case "return":
    case "lose":
      return 1.1;
    default:
      return 1.15;
  }
}

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
        emissiveIntensity={2.6}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * Hollow cabinet: walls + front frame only (open window).
 * Face-forward vitrine matching machine ref:
 * marquee FIATCLAW ARCADE, wide glass, slim frame, cyan/red neon.
 */
function CabinetShell() {
  const W = 2.9;
  const H = 3.7;
  const D = 1.7;
  const wall = 0.1;
  const winW = 2.2;
  const winH = 2.25;
  const winY = 0.35;
  const frontZ = D / 2 - 0.02;
  const metal = {
    color: "#1a1e28",
    metalness: 0.9,
    roughness: 0.28,
  } as const;

  return (
    <group userData={{ shell: "face-vitrine", ref: "machine-face" }}>
      <mesh position={[0, 0.1, -D / 2 + wall / 2]} castShadow receiveShadow>
        <boxGeometry args={[W - wall * 2, H - 0.15, wall]} />
        <meshStandardMaterial {...metal} color="#0a0c12" />
      </mesh>
      <mesh position={[-W / 2 + wall / 2, 0.1, 0]} castShadow>
        <boxGeometry args={[wall, H - 0.15, D]} />
        <meshStandardMaterial {...metal} color="#12151c" />
      </mesh>
      <mesh position={[W / 2 - wall / 2, 0.1, 0]} castShadow>
        <boxGeometry args={[wall, H - 0.15, D]} />
        <meshStandardMaterial {...metal} color="#12151c" />
      </mesh>
      <mesh position={[0, H / 2 - 0.04, 0]} castShadow>
        <boxGeometry args={[W, 0.14, D]} />
        <meshStandardMaterial {...metal} color="#1c2030" />
      </mesh>
      {/* Chamber floor under prizes */}
      <mesh position={[0, -0.72, 0.08]} receiveShadow>
        <boxGeometry args={[W - 0.28, 0.1, D - 0.25]} />
        <meshStandardMaterial color="#080a0e" metalness={0.5} roughness={0.65} />
      </mesh>

      {/* Front frame bars */}
      <mesh position={[0, winY + winH / 2 + 0.22, frontZ]} castShadow>
        <boxGeometry args={[W - 0.08, 0.44, 0.12]} />
        <meshStandardMaterial {...metal} color="#161a24" />
      </mesh>
      <mesh position={[0, winY - winH / 2 - 0.16, frontZ]} castShadow>
        <boxGeometry args={[W - 0.08, 0.3, 0.12]} />
        <meshStandardMaterial {...metal} color="#161a24" />
      </mesh>
      <mesh position={[-winW / 2 - 0.15, winY, frontZ]} castShadow>
        <boxGeometry args={[0.22, winH + 0.55, 0.11]} />
        <meshStandardMaterial {...metal} color="#1e2432" />
      </mesh>
      <mesh position={[winW / 2 + 0.15, winY, frontZ]} castShadow>
        <boxGeometry args={[0.22, winH + 0.55, 0.11]} />
        <meshStandardMaterial {...metal} color="#1e2432" />
      </mesh>

      {/* Marquee plate */}
      <RoundedBox
        args={[2.45, 0.36, 0.08]}
        radius={0.02}
        position={[0, winY + winH / 2 + 0.42, frontZ + 0.04]}
      >
        <meshStandardMaterial color="#0e1016" metalness={0.75} roughness={0.32} />
      </RoundedBox>
      <Text
        position={[0, winY + winH / 2 + 0.42, frontZ + 0.1]}
        fontSize={0.145}
        letterSpacing={0.1}
        color={RED}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.007}
        outlineColor="#ff2040"
        fillOpacity={1}
      >
        FIATCLAW ARCADE
      </Text>

      {/* Neon outline like machine ref */}
      <NeonEdge
        position={[0, H / 2 - 0.02, frontZ + 0.02]}
        args={[W * 0.98, 0.03, 0.03]}
        color={RED}
      />
      <NeonEdge
        position={[0, H / 2 - 0.06, frontZ + 0.02]}
        args={[W * 0.92, 0.018, 0.018]}
        color={CYAN}
      />
      <NeonEdge
        position={[-W / 2 + 0.03, 0.05, frontZ]}
        args={[0.03, H * 0.92, 0.03]}
        color={CYAN}
      />
      <NeonEdge
        position={[W / 2 - 0.03, 0.05, frontZ]}
        args={[0.03, H * 0.92, 0.03]}
        color={RED}
      />
      <NeonEdge
        position={[0, winY - winH / 2 - 0.32, frontZ + 0.02]}
        args={[W * 0.9, 0.022, 0.022]}
        color={CYAN}
      />

      {/* Interior light bar (machine ref) */}
      <mesh position={[0, winY + winH / 2 - 0.12, 0.1]}>
        <boxGeometry args={[1.6, 0.06, 0.2]} />
        <meshStandardMaterial
          color="#e8f0ff"
          emissive="#ffffff"
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>

      {/* Red interior rails */}
      <mesh position={[0.65, -0.2, 0.15]}>
        <boxGeometry args={[0.035, 0.035, 1.0]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[-0.55, 0.55, 0.05]}>
        <boxGeometry args={[0.03, 0.03, 0.85]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={1.1}
          toneMapped={false}
        />
      </mesh>

      {/* Control deck mass (HTML controls sit over this band) */}
      <RoundedBox
        args={[2.75, 0.7, 0.5]}
        radius={0.04}
        position={[0, -1.72, 0.55]}
      >
        <meshStandardMaterial color="#12161e" metalness={0.8} roughness={0.35} />
      </RoundedBox>
    </group>
  );
}

function GlassPanel() {
  return (
    <mesh position={[0, 0.35, 0.82]} renderOrder={2}>
      <boxGeometry args={[2.15, 2.2, 0.025]} />
      <meshPhysicalMaterial
        color="#c5e4f0"
        metalness={0}
        roughness={0.05}
        transmission={0.9}
        thickness={0.3}
        transparent
        opacity={0.16}
        ior={1.4}
        clearcoat={1}
        clearcoatRoughness={0.05}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Dense money floor from prizes-ref texture + 3D money tokens. */
function PrizePile({ phase }: { phase: ClawPhase }) {
  const pileMap = useTexture("/textures/prizes-pile.jpg");
  pileMap.colorSpace = THREE.SRGBColorSpace;
  pileMap.wrapS = pileMap.wrapT = THREE.ClampToEdgeWrapping;

  const layout = useMemo(() => buildPrizePileLayout(42), []);
  const dim = phase === "win" ? 0.35 : 1;

  return (
    <group
      position={[0, -0.62, 0.28]}
      userData={{
        prizePile: "money",
        ref: "prizes-ref",
        prizeCount: layout.length,
        moneyOnly: true,
      }}
    >
      {/* Photo pile base — fills lower band like the reference */}
      <mesh rotation={[-Math.PI / 2.15, 0, 0]} position={[0, 0.02, 0.05]} receiveShadow>
        <planeGeometry args={[2.05, 1.15]} />
        <meshStandardMaterial
          map={pileMap}
          roughness={0.45}
          metalness={0.25}
          emissive="#1a0820"
          emissiveIntensity={0.35}
        />
      </mesh>
      {/* Soft shadow rim under pile */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0.05]}>
        <planeGeometry args={[2.1, 1.2]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.45} />
      </mesh>
      {/* 3D money pieces on top of photo pile for parallax / grab target */}
      {layout.map((spec, i) => (
        <AnimatedPrize
          key={i}
          spec={{
            ...spec,
            position: [
              spec.position[0] * 0.95,
              spec.position[1] + 0.08,
              spec.position[2] * 0.9,
            ],
            scale: spec.scale * 0.92,
          }}
          dim={dim}
        />
      ))}
    </group>
  );
}

/** One curved blade with red neon edge (claw ref). */
function ClawBlade({
  fingerRef,
  yaw,
}: {
  fingerRef: MutableRefObject<THREE.Group | null>;
  yaw: number;
}) {
  return (
    <group rotation={[0, yaw, 0]}>
      <group ref={fingerRef as Ref<THREE.Group>} position={[0.06, 0, 0]}>
        <mesh position={[0.03, -0.1, 0]} castShadow rotation={[0, 0, 0.2]}>
          <capsuleGeometry args={[0.022, 0.14, 4, 10]} />
          <meshStandardMaterial color="#14161c" metalness={0.92} roughness={0.28} />
        </mesh>
        <mesh position={[0.07, -0.28, 0]} castShadow rotation={[0, 0, 0.65]}>
          <capsuleGeometry args={[0.02, 0.16, 4, 10]} />
          <meshStandardMaterial color="#0e1014" metalness={0.9} roughness={0.3} />
        </mesh>
        <mesh position={[0.12, -0.4, 0]} castShadow rotation={[0.15, 0, 1.0]}>
          <capsuleGeometry args={[0.016, 0.08, 4, 8]} />
          <meshStandardMaterial color="#0a0c10" metalness={0.88} roughness={0.32} />
        </mesh>
        {/* Red neon edge strips */}
        <mesh position={[0.04, -0.12, 0.02]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[0.012, 0.15, 0.01]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0.085, -0.3, 0.02]} rotation={[0, 0, 0.65]}>
          <boxGeometry args={[0.012, 0.17, 0.01]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={3.2}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0.13, -0.41, 0.015]} rotation={[0.15, 0, 1.0]}>
          <boxGeometry args={[0.01, 0.07, 0.01]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={3.4}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * 3-blade claw: ref photo billboard (hero look) + articulated mesh blades.
 * Housing/cable match claw-ref cylindrical motor + red rings.
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
  const clawTex = useChromaTexture("/textures/claw-ref.jpg", 30);

  const x = mapClawX(clawX);
  const yTarget = targetClawY(phase);

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.position.x = THREE.MathUtils.damp(
      group.current.position.x,
      x,
      9,
      dt
    );
    group.current.position.y = THREE.MathUtils.damp(
      group.current.position.y,
      yTarget,
      phase === "drop" ? 3.8 : 5.2,
      dt
    );

    const openAng = open ? 0.78 : 0.1;
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

    if (prize.current) {
      if (hold) {
        fall.current = 0;
        prize.current.visible = true;
        prize.current.position.set(0, -0.55, 0.02);
      } else if (phase === "slip" || phase === "lose") {
        prize.current.visible = true;
        fall.current += dt * 2.4;
        prize.current.position.y = -0.55 - fall.current;
        prize.current.position.x = Math.sin(fall.current * 3) * 0.06;
        if (fall.current > 1.5) prize.current.visible = false;
      } else {
        prize.current.visible = false;
        fall.current = 0;
      }
    }
  });

  const cableLen =
    phase === "drop" || phase === "close"
      ? 0.85
      : phase === "slip"
        ? 0.55
        : 0.28;

  // Hero photo sprite fades when fingers animate (mesh takes over detail)
  const spriteOpacity =
    phase === "idle" || phase === "ready" || phase === "drop" ? 0.92 : 0.55;

  return (
    <group
      ref={group}
      position={[0, 1.15, 0.35]}
      userData={{ clawBlades: CLAW_BLADES, ref: "claw-ref" }}
    >
      {/* Gantry rail */}
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[2.1, 0.05, 0.08]} />
        <meshStandardMaterial color="#3a4458" metalness={0.92} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.31, 0]}>
        <boxGeometry args={[2.05, 0.012, 0.03]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.36, 0.12, 0.26]} />
        <meshStandardMaterial color="#1a1e28" metalness={0.9} roughness={0.3} />
      </mesh>

      {/* Black braided cable */}
      <mesh
        key={`c1-${cableLen.toFixed(2)}`}
        position={[0, -cableLen / 2 + 0.1, 0]}
      >
        <cylinderGeometry args={[0.014, 0.014, cableLen, 12]} />
        <meshStandardMaterial color="#0a0a0c" metalness={0.5} roughness={0.55} />
      </mesh>

      {/* Carabiner */}
      <mesh position={[0, -cableLen + 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.032, 0.007, 10, 24]} />
        <meshStandardMaterial color="#c8d0e0" metalness={0.95} roughness={0.14} />
      </mesh>

      {/* Motor housing — cylindrical + dual red neon rings (claw ref) */}
      <group position={[0, -cableLen - 0.08, 0]} userData={{ motor: true }}>
        <mesh castShadow>
          <cylinderGeometry args={[0.13, 0.14, 0.2, 36]} />
          <meshStandardMaterial color="#14161c" metalness={0.92} roughness={0.26} />
        </mesh>
        <mesh position={[0, 0.11, 0]}>
          <cylinderGeometry args={[0.12, 0.13, 0.035, 36]} />
          <meshStandardMaterial color="#1c2030" metalness={0.9} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.135, 0.012, 12, 48]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={3.2}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.138, 0.011, 12, 48]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.8}
            toneMapped={false}
          />
        </mesh>
        {/* Red power button */}
        <mesh position={[0, 0.01, 0.135]}>
          <cylinderGeometry args={[0.02, 0.02, 0.018, 16]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.4}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, -0.09, 0]}>
          <cylinderGeometry args={[0.09, 0.07, 0.05, 24]} />
          <meshStandardMaterial color="#0e1016" metalness={0.9} roughness={0.3} />
        </mesh>
      </group>

      {/* Ref photo claw billboard (hero product look) */}
      {clawTex && (
        <mesh
          position={[0, -cableLen - 0.42, 0.08]}
          renderOrder={1}
          scale={open ? 1 : 0.88}
        >
          <planeGeometry args={[0.72, 0.95]} />
          <meshBasicMaterial
            map={clawTex}
            transparent
            opacity={spriteOpacity}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* 3 articulated blades */}
      <group
        position={[0, -cableLen - 0.22, 0]}
        userData={{ fingers: CLAW_BLADES, style: "red-neon-metal" }}
      >
        <ClawBlade fingerRef={f0} yaw={0} />
        <ClawBlade fingerRef={f1} yaw={(Math.PI * 2) / 3} />
        <ClawBlade fingerRef={f2} yaw={(Math.PI * 4) / 3} />
        {/* Center red probe */}
        <mesh position={[0, -0.26, 0]}>
          <cylinderGeometry args={[0.011, 0.009, 0.4, 12]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={2.6}
            toneMapped={false}
          />
        </mesh>
        <group ref={prize} position={[0, -0.55, 0]} visible={false}>
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
    const n = 80;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((s) => {
    if (!ref.current || !active) return;
    ref.current.rotation.y = s.clock.elapsedTime * 2;
    ref.current.scale.setScalar(1.3 + Math.sin(s.clock.elapsedTime * 6) * 0.2);
  });
  if (!active) return null;
  return (
    <points ref={ref} position={[0, 0.9, 0.7]} geometry={geo}>
      <pointsMaterial size={0.04} color={RED} transparent opacity={0.85} sizeAttenuation />
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
        Math.sin(performance.now() * 0.04) * 0.01 * shake.current;
      root.current.position.x =
        Math.sin(performance.now() * 0.05) * 0.015 * shake.current;
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
      <color attach="background" args={["#050608"]} />
      <fog attach="fog" args={["#050608", 8, 16]} />

      <ambientLight intensity={0.28} />
      <directionalLight
        position={[2.5, 5, 4]}
        intensity={0.75}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-1.8, 1.8, 1.8]} intensity={0.7} color={CYAN} />
      <pointLight position={[1.8, 1.4, 1.8]} intensity={0.9} color={RED} />
      <spotLight
        position={[0, 2.6, 0.4]}
        angle={0.5}
        penumbra={0.45}
        intensity={1.35}
        color="#f0f4ff"
      />
      <pointLight position={[0, 0.2, 0.8]} intensity={0.4} color={RED} />

      <group ref={root} position={[0, -0.05, 0]}>
        <CabinetShell />
        <GlassPanel />
        <PrizePile phase={phase} />
        <ClawAssembly phase={phase} clawX={clawX} />
        <WinBurst active={phase === "win"} />
      </group>

      <ContactShadows
        position={[0, -2.05, 0]}
        opacity={0.5}
        scale={8}
        blur={2.4}
        far={4}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.6}
          luminanceThreshold={0.42}
          luminanceSmoothing={0.32}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
