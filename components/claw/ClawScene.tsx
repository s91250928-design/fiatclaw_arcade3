"use client";

/**
 * FIATCLAW VAULT — etalon-aligned cylindrical glass chamber.
 * Solid base + glass cylinder volume + metal crown.
 * Neon rings = decoration only. Heavy 3-blade claw sprite + dense prize billboards.
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
const GUNMETAL = "#2a303c";
const CHROME = "#b0b8c4";

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
      return -0.35;
    case "lift":
    case "hold":
    case "win":
      return 0.55;
    case "slip":
      return 0.05;
    case "return":
    case "lose":
      return 0.5;
    default:
      return 0.55;
  }
}

function metal(c: string, m = 0.92, r = 0.26) {
  return { color: c, metalness: m, roughness: r } as const;
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

      {/* Decor neon text (on vault, not instead of it) */}
      <Text
        position={[-1.05, 0.55, 0.35]}
        rotation={[0, 0.55, 0]}
        fontSize={0.11}
        color={RED}
        anchorX="center"
        maxWidth={0.9}
        textAlign="center"
        outlineWidth={0.005}
        outlineColor="#3a0810"
      >
        {`WIN\nLEGENDARY\nREWARDS`}
      </Text>
      <Text
        position={[1.05, 0.55, 0.35]}
        rotation={[0, -0.55, 0]}
        fontSize={0.1}
        color={CYAN}
        anchorX="center"
        maxWidth={0.85}
        textAlign="center"
        outlineWidth={0.004}
        outlineColor="#083040"
      >
        {`CLAW FIAT.\nWIN CRYPTO.`}
      </Text>

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
      position={[0, -1.2, 0]}
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
 * Heavy industrial 3-blade claw from public/refs/claw-industrial.png
 * (+ fallback claw-sprite). Single silhouette, not stick-mesh splay.
 */
function ClawAssembly({ phase, clawX }: { phase: ClawPhase; clawX: number }) {
  const slipped = useSlipped(phase);
  const hold = clawShouldHoldPrize(phase, slipped);
  const open = clawFingersOpen(phase, slipped);
  const group = useRef<THREE.Group>(null);
  const spriteG = useRef<THREE.Group>(null);
  const prize = useRef<THREE.Group>(null);
  const fall = useRef(0);
  const cableScale = useRef(0.5);

  // Prefer industrial metal sprite; fallback to claw-sprite
  const texA = useTexture("/refs/claw-industrial.png");
  const texB = useTexture("/refs/claw-sprite.png");
  const map = texA || texB;
  useMemo(() => {
    if (map) {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
    }
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
      phase === "drop" ? 3.4 : 5,
      dt
    );

    const targetCable =
      phase === "drop" || phase === "close"
        ? 1.0
        : phase === "slip"
          ? 0.65
          : 0.45;
    cableScale.current = THREE.MathUtils.damp(
      cableScale.current,
      targetCable,
      6,
      dt
    );

    if (spriteG.current) {
      const sx = open ? 1 : 0.9;
      spriteG.current.scale.x = THREE.MathUtils.damp(
        spriteG.current.scale.x || 1,
        sx,
        10,
        dt
      );
    }

    if (prize.current) {
      if (hold) {
        fall.current = 0;
        prize.current.visible = true;
        prize.current.position.set(0, -0.85, 0.06);
      } else if (phase === "slip" || phase === "lose") {
        prize.current.visible = true;
        fall.current += dt * 2.3;
        prize.current.position.y = -0.85 - fall.current;
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
      position={[0, 0.55, 0.25]}
      scale={1.75}
      userData={{
        clawBlades: CLAW_BLADES,
        style: "industrial-3blade-sprite",
      }}
    >
      {/* Gantry carriage */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.55, 0.2, 0.42]} />
        <meshStandardMaterial {...metal("#1a1e28", 0.94, 0.2)} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.9, 0.08, 0.12]} />
        <meshStandardMaterial {...metal(GUNMETAL, 0.93, 0.22)} />
      </mesh>
      <mesh position={[0, 0.54, 0]}>
        <boxGeometry args={[1.85, 0.014, 0.04]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>

      {/* Thick steel cable */}
      <mesh
        position={[0, 0.28 - (baseCable * cableScale.current) / 2, 0]}
        scale={[1, cableScale.current, 1]}
      >
        <cylinderGeometry args={[0.022, 0.022, baseCable, 12]} />
        <meshStandardMaterial color="#12141a" metalness={0.9} roughness={0.35} />
      </mesh>

      {/* Claw body — 3-blade industrial sprite */}
      <group
        position={[0, 0.28 - baseCable * cableScale.current - 0.1, 0]}
        userData={{ fingers: CLAW_BLADES, motor: true }}
      >
        <mesh position={[0, 0.1, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.04, 0.01, 10, 20]} />
          <meshStandardMaterial {...metal(CHROME, 0.97, 0.1)} />
        </mesh>
        {/* Small 3D motor collar for depth behind sprite */}
        <mesh position={[0, 0.02, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.13, 0.12, 28]} />
          <meshStandardMaterial {...metal("#141820", 0.95, 0.2)} />
        </mesh>
        <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.125, 0.012, 10, 32]} />
          <meshStandardMaterial
            color={RED}
            emissive={RED}
            emissiveIntensity={1.8}
            toneMapped={false}
          />
        </mesh>

        <group ref={spriteG} position={[0, -0.42, 0.1]}>
          <mesh renderOrder={2} castShadow>
            <planeGeometry args={[1.15, 1.4]} />
            <meshBasicMaterial
              map={map}
              transparent
              alphaTest={0.08}
              depthWrite={false}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>

        <group ref={prize} visible={false}>
          <PrizeMeshByKind kind="fiatclaw_token" scale={hold ? 1.3 : 1} />
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

      <ambientLight intensity={0.32} />
      <directionalLight
        position={[4, 6, 5]}
        intensity={0.95}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-2.2, 1.8, 2.5]} intensity={0.95} color={CYAN} />
      <pointLight position={[2.2, 1.5, 2.5]} intensity={1.1} color={RED} />
      <pointLight position={[0, 0.5, 2]} intensity={0.7} color="#ffffff" />
      <pointLight position={[0, -0.8, 0.5]} intensity={0.5} color={PURPLE} />
      <spotLight
        position={[0, 3.5, 2.2]}
        angle={0.48}
        penumbra={0.5}
        intensity={1.8}
        color="#f0f4ff"
      />
      <spotLight
        position={[0, 1.5, -1.5]}
        angle={0.55}
        penumbra={0.6}
        intensity={0.65}
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
