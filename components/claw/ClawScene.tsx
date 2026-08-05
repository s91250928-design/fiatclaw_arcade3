"use client";

/**
 * Massive industrial cyberpunk Web3 claw machine — 2035 premium arcade.
 * Brushed black metal · carbon fiber · hydraulic 3-blade claw · dense prize chamber.
 */

import {
  useMemo,
  useRef,
  type MutableRefObject,
  type Ref,
} from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, RoundedBox, Text, useTexture } from "@react-three/drei";
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
const CARBON = "#0c0e14";
const CHROME = "#9aa3b0";

export interface ClawSceneProps {
  phase: ClawPhase;
  clawX: number;
}

export const CABINET_SHELL_MODE = "hollow-open-front" as const;
export const CLAW_BLADES = CLAW_FINGER_COUNT;
export const MACHINE_STYLE = "premium-industrial-cyberpunk-2035" as const;

function useSlipped(phase: ClawPhase) {
  const slipped = useRef(false);
  slipped.current = updateSlippedLatch(phase, slipped.current);
  return slipped.current;
}

function mapClawX(pct: number) {
  return ((Math.min(88, Math.max(12, pct)) - 50) / 38) * 1.05;
}

function targetClawY(phase: ClawPhase) {
  switch (phase) {
    case "drop":
    case "close":
      return 0.28;
    case "lift":
    case "hold":
    case "win":
      return 1.35;
    case "slip":
      return 0.75;
    case "return":
    case "lose":
      return 1.3;
    default:
      return 1.35;
  }
}

function Neon({
  position,
  args,
  color,
  intensity = 2.5,
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

function metal(c: string, m = 0.93, r = 0.26) {
  return { color: c, metalness: m, roughness: r } as const;
}

function CoolingFan({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 5.5;
  });
  return (
    <group position={position} scale={scale}>
      <mesh>
        <cylinderGeometry args={[0.14, 0.14, 0.05, 28]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.9, 0.35)} />
      </mesh>
      <group ref={ref}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 5]} position={[0, 0.02, 0]}>
            <boxGeometry args={[0.12, 0.012, 0.03]} />
            <meshStandardMaterial {...metal(CHROME, 0.96, 0.18)} />
          </mesh>
        ))}
      </group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <torusGeometry args={[0.135, 0.01, 8, 32]} />
        <meshStandardMaterial {...metal(CHROME, 0.95, 0.16)} />
      </mesh>
    </group>
  );
}

/**
 * Hollow cabinet — massive industrial face-forward vitrine.
 * Occupies almost the full viewport.
 */
function CabinetShell() {
  // Large machine proportions
  const W = 3.6;
  const H = 4.2;
  const D = 2.2;
  const wall = 0.16;
  const winW = 2.75;
  const winH = 2.65;
  const winY = 0.35;
  const frontZ = D / 2 - 0.04;

  return (
    <group userData={{ shell: "face-vitrine", style: MACHINE_STYLE }}>
      {/* Back wall */}
      <mesh position={[0, 0.15, -D / 2 + wall / 2]} castShadow receiveShadow>
        <boxGeometry args={[W - wall * 1.4, H - 0.2, wall]} />
        <meshStandardMaterial {...metal("#080a0e", 0.88, 0.4)} />
      </mesh>
      {/* Carbon back plate */}
      <mesh position={[0, 0.4, -D / 2 + wall + 0.015]}>
        <boxGeometry args={[W - 0.55, H * 0.58, 0.025]} />
        <meshStandardMaterial
          color={CARBON}
          metalness={0.5}
          roughness={0.55}
          emissive={PURPLE}
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* Side walls */}
      <mesh position={[-W / 2 + wall / 2, 0.15, 0]} castShadow>
        <boxGeometry args={[wall, H - 0.2, D]} />
        <meshStandardMaterial {...metal("#10141c", 0.91, 0.3)} />
      </mesh>
      <mesh position={[W / 2 - wall / 2, 0.15, 0]} castShadow>
        <boxGeometry args={[wall, H - 0.2, D]} />
        <meshStandardMaterial {...metal("#10141c", 0.91, 0.3)} />
      </mesh>

      {/* Carbon side panels */}
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[s * (W / 2 - wall - 0.03), 0.35, 0.15]}>
          <boxGeometry args={[0.035, 2.2, 1.4]} />
          <meshStandardMaterial color={CARBON} metalness={0.48} roughness={0.52} />
        </mesh>
      ))}

      {/* Top crown */}
      <mesh position={[0, H / 2 - 0.07, 0]} castShadow>
        <boxGeometry args={[W, 0.2, D]} />
        <meshStandardMaterial {...metal("#161a24", 0.93, 0.24)} />
      </mesh>
      <mesh position={[0, H / 2 - 0.18, frontZ - 0.12]}>
        <boxGeometry args={[W - 0.12, 0.07, 0.25]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.94, 0.2)} />
      </mesh>

      {/* Floor plate */}
      <mesh position={[0, -0.95, 0.12]} receiveShadow>
        <boxGeometry args={[W - 0.45, 0.14, D - 0.4]} />
        <meshStandardMaterial {...metal("#06080c", 0.72, 0.55)} />
      </mesh>

      {/* Heavy front frame */}
      <mesh position={[0, winY + winH / 2 + 0.26, frontZ]} castShadow>
        <boxGeometry args={[W - 0.12, 0.52, 0.18]} />
        <meshStandardMaterial {...metal("#12161e", 0.93, 0.26)} />
      </mesh>
      <mesh position={[0, winY - winH / 2 - 0.2, frontZ]} castShadow>
        <boxGeometry args={[W - 0.12, 0.38, 0.18]} />
        <meshStandardMaterial {...metal("#12161e", 0.93, 0.26)} />
      </mesh>
      <mesh position={[-winW / 2 - 0.2, winY, frontZ]} castShadow>
        <boxGeometry args={[0.32, winH + 0.7, 0.17]} />
        <meshStandardMaterial {...metal("#181e28", 0.94, 0.24)} />
      </mesh>
      <mesh position={[winW / 2 + 0.2, winY, frontZ]} castShadow>
        <boxGeometry args={[0.32, winH + 0.7, 0.17]} />
        <meshStandardMaterial {...metal("#181e28", 0.94, 0.24)} />
      </mesh>

      {/* Chrome bevel */}
      <mesh position={[0, winY + winH / 2 - 0.02, frontZ + 0.04]}>
        <boxGeometry args={[winW + 0.12, 0.045, 0.06]} />
        <meshStandardMaterial {...metal(CHROME, 0.97, 0.12)} />
      </mesh>
      <mesh position={[0, winY - winH / 2 + 0.02, frontZ + 0.04]}>
        <boxGeometry args={[winW + 0.12, 0.045, 0.06]} />
        <meshStandardMaterial {...metal(CHROME, 0.97, 0.12)} />
      </mesh>

      {/* Marquee */}
      <RoundedBox
        args={[2.9, 0.42, 0.12]}
        radius={0.012}
        position={[0, winY + winH / 2 + 0.48, frontZ + 0.06]}
      >
        <meshStandardMaterial {...metal("#080a10", 0.9, 0.28)} />
      </RoundedBox>
      <Text
        position={[0, winY + winH / 2 + 0.48, frontZ + 0.14]}
        fontSize={0.155}
        letterSpacing={0.14}
        color={RED}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.007}
        outlineColor="#6a0818"
      >
        FIATCLAW ARCADE
      </Text>

      {/* Neon outline */}
      <Neon position={[0, H / 2 - 0.02, frontZ + 0.03]} args={[W * 0.98, 0.028, 0.028]} color={RED} intensity={3} />
      <Neon position={[0, H / 2 - 0.06, frontZ + 0.03]} args={[W * 0.9, 0.014, 0.014]} color={CYAN} intensity={2.2} />
      <Neon position={[-W / 2 + 0.05, 0.12, frontZ]} args={[0.03, H * 0.92, 0.03]} color={CYAN} intensity={2.4} />
      <Neon position={[W / 2 - 0.05, 0.12, frontZ]} args={[0.03, H * 0.92, 0.03]} color={RED} intensity={2.4} />
      <Neon position={[0, winY - winH / 2 - 0.4, frontZ + 0.03]} args={[W * 0.9, 0.022, 0.022]} color={CYAN} intensity={2} />

      {/* Interior light bar */}
      <mesh position={[0, winY + winH / 2 - 0.16, 0.2]}>
        <boxGeometry args={[2.2, 0.06, 0.22]} />
        <meshStandardMaterial color="#e0e8f4" emissive="#ffffff" emissiveIntensity={2.8} toneMapped={false} />
      </mesh>
      <Neon position={[0, winY + winH / 2 - 0.22, 0.2]} args={[2.0, 0.012, 0.1]} color={CYAN} intensity={1.4} />

      {/* Vents */}
      {([-1.4, 1.4] as const).map((sx) => (
        <group key={sx} position={[sx, -1.05, frontZ + 0.03]}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} position={[0, i * 0.048, 0]}>
              <boxGeometry args={[0.32, 0.014, 0.045]} />
              <meshStandardMaterial {...metal(GUNMETAL, 0.85, 0.4)} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Speakers */}
      {([-1.35, 1.35] as const).map((sx) => (
        <group key={`sp${sx}`} position={[sx, 1.7, frontZ + 0.05]}>
          <mesh>
            <circleGeometry args={[0.12, 28]} />
            <meshStandardMaterial {...metal("#080a0e", 0.7, 0.5)} />
          </mesh>
          {[0.035, 0.065, 0.095].map((r, i) => (
            <mesh key={i} position={[0, 0, 0.006]}>
              <ringGeometry args={[r - 0.007, r, 28]} />
              <meshStandardMaterial {...metal(CHROME, 0.92, 0.28)} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      ))}

      <CoolingFan position={[-1.35, -1.45, frontZ + 0.07]} scale={0.85} />
      <CoolingFan position={[1.35, -1.45, frontZ + 0.07]} scale={0.85} />

      {/* Control console mass */}
      <RoundedBox args={[3.4, 0.95, 0.8]} radius={0.03} position={[0, -1.95, 0.72]}>
        <meshStandardMaterial {...metal("#0c1018", 0.91, 0.3)} />
      </RoundedBox>
      <mesh position={[0, -1.5, 0.85]} rotation={[-0.18, 0, 0]}>
        <boxGeometry args={[3.2, 0.045, 0.6]} />
        <meshStandardMaterial color={CARBON} metalness={0.55} roughness={0.48} />
      </mesh>
      <Neon position={[0, -1.48, 1.05]} args={[2.9, 0.012, 0.012]} color={RED} intensity={1.8} />
    </group>
  );
}

function GlassPanel() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.MeshPhysicalMaterial;
    m.opacity = 0.14 + Math.sin(s.clock.elapsedTime * 0.4) * 0.02;
  });
  return (
    <mesh ref={ref} position={[0, 0.35, 1.02]} renderOrder={2}>
      <boxGeometry args={[2.7, 2.6, 0.035]} />
      <meshPhysicalMaterial
        color="#b0c8d8"
        metalness={0}
        roughness={0.02}
        transmission={0.9}
        thickness={0.45}
        transparent
        opacity={0.15}
        ior={1.52}
        clearcoat={1}
        clearcoatRoughness={0.03}
        envMapIntensity={1.4}
        depthWrite={false}
      />
    </mesh>
  );
}

function ChamberFogParticles() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 120;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2.4;
      pos[i * 3 + 1] = Math.random() * 1.8 - 0.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((s) => {
    if (!ref.current) return;
    ref.current.rotation.y = s.clock.elapsedTime * 0.03;
    const arr = (ref.current.geometry.attributes.position as THREE.BufferAttribute)
      .array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1]! += 0.002;
      if (arr[i + 1]! > 1.4) arr[i + 1] = -0.5;
    }
    ref.current.geometry.attributes.position!.needsUpdate = true;
  });
  return (
    <points ref={ref} position={[0, 0, 0.3]} geometry={geo}>
      <pointsMaterial
        size={0.025}
        color={PURPLE}
        transparent
        opacity={0.25}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function PrizePile({ phase }: { phase: ClawPhase }) {
  const layout = useMemo(() => buildPrizePileLayout(42), []);
  const dim = phase === "win" ? 0.3 : 1;
  return (
    <group
      position={[0, -0.85, 0.35]}
      userData={{
        prizePile: "premium-crypto-dense",
        prizeCount: layout.length,
        moneyOnly: true,
      }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[2.6, 1.6]} />
        <meshStandardMaterial {...metal("#07090e", 0.65, 0.62)} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[2.4, 1.4]} />
        <meshStandardMaterial
          color="#080610"
          emissive={PURPLE}
          emissiveIntensity={0.18}
          transparent
          opacity={0.55}
        />
      </mesh>
      {layout.map((spec, i) => (
        <AnimatedPrize key={i} spec={spec} dim={dim} />
      ))}
    </group>
  );
}

/**
 * Single product claw billboard — 3 blades painted in public/refs/claw-sprite.png.
 * Mesh fingers removed (they double-drew and looked broken under bloom).
 * Open/close scales the sprite; refs still count CLAW_BLADES = 3.
 */
function ClawBladeBillboard({
  open,
  fingerRefs,
}: {
  open: boolean;
  /** keep refs for open animation damping API compatibility */
  fingerRefs: MutableRefObject<THREE.Group | null>[];
}) {
  const map = useTexture("/refs/claw-sprite.png");
  const group = useRef<THREE.Group>(null);
  const scaleX = useRef(open ? 1 : 0.88);

  useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
  }, [map]);

  useFrame((_, dt) => {
    const target = open ? 1 : 0.86;
    scaleX.current = THREE.MathUtils.damp(scaleX.current, target, 10, dt);
    if (group.current) {
      group.current.scale.set(scaleX.current, 1, 1);
    }
    // Keep finger refs non-null for phase helpers / tests that probe userData
    for (const r of fingerRefs) {
      if (r.current) r.current.rotation.z = open ? 0.35 : 0.05;
    }
  });

  return (
    <group
      ref={group}
      position={[0, -0.38, 0.08]}
      userData={{ fingers: CLAW_BLADES, style: "sprite-3blade" }}
    >
      {/* Invisible hinge anchors for ref API */}
      <group ref={fingerRefs[0] as Ref<THREE.Group>} />
      <group ref={fingerRefs[1] as Ref<THREE.Group>} />
      <group ref={fingerRefs[2] as Ref<THREE.Group>} />
      <mesh renderOrder={2} castShadow>
        <planeGeometry args={[0.95, 1.2]} />
        <meshBasicMaterial
          map={map}
          transparent
          alphaTest={0.12}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Single heavy claw assembly: gantry → cable → motor → 3 blades.
 * Open angle modest so blades read as a claw, not flying sticks.
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
  const gear = useRef<THREE.Mesh>(null);
  const cableGroup = useRef<THREE.Group>(null);

  const x = mapClawX(clawX);
  const yTarget = targetClawY(phase);

  // Smooth cable scale without remounting geometry
  const cableScale = useRef(1);

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

    if (gear.current) {
      gear.current.rotation.y +=
        dt * (phase === "drop" || phase === "lift" ? 5 : 0.8);
    }

    // Cable length via Y-scale on a unit cylinder
    const targetCable =
      phase === "drop" || phase === "close"
        ? 1.0
        : phase === "slip"
          ? 0.62
          : 0.38;
    cableScale.current = THREE.MathUtils.damp(
      cableScale.current,
      targetCable,
      6,
      dt
    );
    if (cableGroup.current) {
      cableGroup.current.scale.y = cableScale.current;
      // Keep bottom attached to motor: motor sits at -baseLen * scale
      cableGroup.current.position.y = 0.08;
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
        prize.current.position.x = Math.sin(fall.current * 3) * 0.04;
        if (fall.current > 1.5) prize.current.visible = false;
      } else {
        prize.current.visible = false;
        fall.current = 0;
      }
    }
  });

  // Base cable length unit (scale.y multiplies)
  const baseCable = 0.85;
  const motorY = -0.08 - baseCable * 0.55; // approximate mid — motor tracks via group below

  return (
    <group
      ref={group}
      position={[0, 1.35, 0.48]}
      userData={{ clawBlades: CLAW_BLADES, style: "hydraulic-front-readable" }}
    >
      {/* Gantry rail */}
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[2.5, 0.09, 0.12]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.95, 0.2)} />
      </mesh>
      <mesh position={[0, 0.375, 0]}>
        <boxGeometry args={[2.45, 0.014, 0.04]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>

      {/* Carriage + gears */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.5, 0.16, 0.34]} />
        <meshStandardMaterial {...metal("#161a24", 0.94, 0.22)} />
      </mesh>
      <mesh ref={gear} position={[0.24, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.04, 14]} />
        <meshStandardMaterial {...metal(CHROME, 0.96, 0.14)} />
      </mesh>
      <mesh position={[-0.24, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.04, 14]} />
        <meshStandardMaterial {...metal(CHROME, 0.96, 0.14)} />
      </mesh>

      {/* Cable (scaled) */}
      <group ref={cableGroup} position={[0, 0.08, 0]}>
        <mesh position={[0, -baseCable / 2, 0]}>
          <cylinderGeometry args={[0.022, 0.022, baseCable, 14]} />
          <meshStandardMaterial color="#12141a" metalness={0.88} roughness={0.4} />
        </mesh>
        <mesh position={[0.01, -baseCable / 2, 0.006]}>
          <cylinderGeometry args={[0.012, 0.012, baseCable * 0.98, 10]} />
          <meshStandardMaterial color="#2a2e36" metalness={0.9} roughness={0.35} />
        </mesh>
      </group>

      {/* Motor + fingers — Y follows cableScale */}
      <MotorAndFingers
        cableScaleRef={cableScale}
        baseCable={baseCable}
        f0={f0}
        f1={f1}
        f2={f2}
        prize={prize}
        hold={hold}
        open={open}
      />
    </group>
  );
}

function MotorAndFingers({
  cableScaleRef,
  baseCable,
  f0,
  f1,
  f2,
  prize,
  hold,
  open,
}: {
  cableScaleRef: MutableRefObject<number>;
  baseCable: number;
  f0: MutableRefObject<THREE.Group | null>;
  f1: MutableRefObject<THREE.Group | null>;
  f2: MutableRefObject<THREE.Group | null>;
  prize: MutableRefObject<THREE.Group | null>;
  hold: boolean;
  open: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!root.current) return;
    root.current.position.y = 0.08 - baseCable * cableScaleRef.current - 0.02;
  });

  return (
    <group ref={root} userData={{ motor: true, fingers: CLAW_BLADES }}>
      {/* Carabiner ring (3D depth above sprite) */}
      <mesh position={[0, 0.05, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.038, 0.009, 10, 24]} />
        <meshStandardMaterial {...metal(CHROME, 0.97, 0.1)} />
      </mesh>

      {/* Compact motor collar above sprite for depth */}
      <mesh position={[0, -0.02, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.13, 0.1, 32]} />
        <meshStandardMaterial {...metal("#12151c", 0.95, 0.22)} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.125, 0.012, 12, 40]} />
        <meshStandardMaterial
          color={RED}
          emissive={RED}
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>

      {/* Clean 3-blade product sprite (single claw, three blades in art) */}
      <ClawBladeBillboard open={open} fingerRefs={[f0, f1, f2]} />

      <group ref={prize} position={[0, -0.72, 0.05]} visible={false}>
        <PrizeMeshByKind kind="fiatclaw_token" scale={hold ? 1.25 : 1} />
      </group>
    </group>
  );
}

function WinBurst({ active }: { active: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 140;
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
    ref.current.rotation.y = s.clock.elapsedTime * 2.2;
    ref.current.scale.setScalar(1.5 + Math.sin(s.clock.elapsedTime * 6) * 0.25);
  });
  if (!active) return null;
  return (
    <points ref={ref} position={[0, 1.1, 0.8]} geometry={geo}>
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
    } else {
      shake.current = Math.max(0, shake.current - dt * 3);
      root.current.rotation.z = THREE.MathUtils.damp(root.current.rotation.z, 0, 8, dt);
    }
  });

  return (
    <>
      <color attach="background" args={["#020304"]} />
      <fog attach="fog" args={["#020304", 8, 18]} />

      <ambientLight intensity={0.18} />
      <directionalLight position={[3.5, 7, 4]} intensity={0.75} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-2.2, 2.2, 2]} intensity={0.7} color={CYAN} />
      <pointLight position={[2.2, 1.6, 2]} intensity={0.95} color={RED} />
      <pointLight position={[0, 0.1, 1.1]} intensity={0.5} color={PURPLE} />
      <spotLight position={[0, 3.2, 0.6]} angle={0.5} penumbra={0.45} intensity={1.6} color="#eef2ff" />
      <spotLight position={[-0.8, 2.2, 1.2]} angle={0.35} penumbra={0.6} intensity={0.5} color={CYAN} />
      <spotLight position={[0.8, 2.2, 1.2]} angle={0.35} penumbra={0.6} intensity={0.45} color={RED} />

      <group ref={root} position={[0, -0.05, 0]}>
        <CabinetShell />
        <GlassPanel />
        <ChamberFogParticles />
        <PrizePile phase={phase} />
        <ClawAssembly phase={phase} clawX={clawX} />
        <WinBurst active={phase === "win"} />
      </group>

      <ContactShadows position={[0, -2.35, 0]} opacity={0.65} scale={12} blur={2.8} far={6} />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.38}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
