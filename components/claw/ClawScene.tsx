"use client";

/**
 * React Three Fiber WebGL claw arcade cabinet scene.
 * Driven by parent phase + clawX (0–100). No client outcome RNG.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, RoundedBox } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import {
  clawFingersOpen,
  clawShouldHoldPrize,
  updateSlippedLatch,
  type ClawPhase,
} from "@/lib/game/claw-phases";

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
  // map 12–88 UI range-ish into chamber X
  const t = (Math.min(88, Math.max(12, pct)) - 50) / 38;
  return t * 0.95;
}

function targetClawY(phase: ClawPhase) {
  switch (phase) {
    case "drop":
    case "close":
      return 0.35;
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
        emissiveIntensity={2.2}
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
 * Hollow cabinet: walls + front frame only (open window).
 * Interior playfield (claw/prizes/floor) is visible through the glass.
 * Camera looks through front window — no solid fill plate.
 */
function CabinetShell() {
  // Outer dims
  const W = 3.2;
  const H = 3.6;
  const D = 2.0;
  const wall = 0.12;
  // Window opening in front face
  const winW = 2.25;
  const winH = 2.05;
  const winY = 0.45; // center of glass window
  const frontZ = D / 2 - 0.02;

  return (
    <group>
      {/* Back wall */}
      <mesh position={[0, 0.15, -D / 2 + wall / 2]} castShadow receiveShadow>
        <boxGeometry args={[W - wall * 2, H - 0.2, wall]} />
        <meshStandardMaterial {...metal} color="#0e1016" />
      </mesh>

      {/* Left outer wall */}
      <mesh position={[-W / 2 + wall / 2, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[wall, H - 0.2, D]} />
        <meshStandardMaterial {...metal} color="#151922" />
      </mesh>
      {/* Right outer wall */}
      <mesh position={[W / 2 - wall / 2, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[wall, H - 0.2, D]} />
        <meshStandardMaterial {...metal} color="#151922" />
      </mesh>

      {/* Top cap */}
      <mesh position={[0, H / 2 - 0.05, 0]} castShadow>
        <boxGeometry args={[W, wall * 1.4, D]} />
        <meshStandardMaterial {...metal} color="#1c2030" />
      </mesh>
      {/* Chamber floor plate (solid base under prizes) */}
      <mesh position={[0, -0.55, 0.05]} receiveShadow>
        <boxGeometry args={[W - wall * 2.2, wall, D - wall * 1.5]} />
        <meshStandardMaterial {...metal} color="#0a0c10" roughness={0.55} />
      </mesh>

      {/* Front frame — top bar (above window) */}
      <mesh position={[0, winY + winH / 2 + 0.18, frontZ]} castShadow>
        <boxGeometry args={[W - wall, 0.36, 0.14]} />
        <meshStandardMaterial {...metal} color="#1a1e28" />
      </mesh>
      {/* Front frame — bottom bar (below window, above control deck) */}
      <mesh position={[0, winY - winH / 2 - 0.14, frontZ]} castShadow>
        <boxGeometry args={[W - wall, 0.28, 0.14]} />
        <meshStandardMaterial {...metal} color="#1a1e28" />
      </mesh>
      {/* Front frame — left stile */}
      <mesh position={[-winW / 2 - 0.18, winY, frontZ]} castShadow>
        <boxGeometry args={[0.28, winH + 0.5, 0.14]} />
        <meshStandardMaterial {...metal} color="#222836" />
      </mesh>
      {/* Front frame — right stile */}
      <mesh position={[winW / 2 + 0.18, winY, frontZ]} castShadow>
        <boxGeometry args={[0.28, winH + 0.5, 0.14]} />
        <meshStandardMaterial {...metal} color="#222836" />
      </mesh>

      {/* Inner bevel around window (chamfer look) */}
      <mesh position={[0, winY + winH / 2 - 0.02, frontZ + 0.02]}>
        <boxGeometry args={[winW + 0.08, 0.05, 0.06]} />
        <meshStandardMaterial color="#2a3040" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0, winY - winH / 2 + 0.02, frontZ + 0.02]}>
        <boxGeometry args={[winW + 0.08, 0.05, 0.06]} />
        <meshStandardMaterial color="#2a3040" metalness={0.9} roughness={0.25} />
      </mesh>

      {/* Side pillars (front-facing thickness) */}
      <mesh position={[-W / 2 + 0.14, 0.2, frontZ - 0.15]} castShadow>
        <boxGeometry args={[0.2, H - 0.5, 0.45]} />
        <meshStandardMaterial color="#2a3040" metalness={0.92} roughness={0.26} />
      </mesh>
      <mesh position={[W / 2 - 0.14, 0.2, frontZ - 0.15]} castShadow>
        <boxGeometry args={[0.2, H - 0.5, 0.45]} />
        <meshStandardMaterial color="#2a3040" metalness={0.92} roughness={0.26} />
      </mesh>

      {/* Header marquee */}
      <RoundedBox
        args={[2.55, 0.36, 0.1]}
        radius={0.02}
        position={[0, winY + winH / 2 + 0.38, frontZ + 0.04]}
      >
        <meshStandardMaterial color="#1a1e28" metalness={0.65} roughness={0.38} />
      </RoundedBox>

      {/* Neon edges */}
      <NeonEdge
        position={[0, winY + winH / 2 + 0.58, frontZ + 0.05]}
        args={[2.5, 0.03, 0.03]}
        color={RED}
      />
      <NeonEdge
        position={[-W / 2 + 0.05, 0.25, frontZ]}
        args={[0.03, 2.6, 0.03]}
        color={CYAN}
      />
      <NeonEdge
        position={[W / 2 - 0.05, 0.25, frontZ]}
        args={[0.03, 2.6, 0.03]}
        color={RED}
      />
      <NeonEdge
        position={[0, winY - winH / 2 - 0.28, frontZ + 0.02]}
        args={[2.55, 0.025, 0.025]}
        color={CYAN}
      />

      {/* Control deck (below window — solid, not blocking glass) */}
      <RoundedBox
        args={[3.0, 0.85, 0.65]}
        radius={0.04}
        position={[0, -1.65, 0.75]}
      >
        <meshStandardMaterial color="#141820" metalness={0.78} roughness={0.38} />
      </RoundedBox>
    </group>
  );
}

/** Transparent glass only — no opaque plate behind it. */
function GlassPanel() {
  return (
    <mesh position={[0, 0.45, 0.98]} renderOrder={2}>
      <boxGeometry args={[2.2, 2.0, 0.03]} />
      <meshPhysicalMaterial
        color="#b8dce8"
        metalness={0}
        roughness={0.04}
        transmission={0.92}
        thickness={0.35}
        transparent
        opacity={0.22}
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
      opacity: 0.35,
    });
    const matR = new THREE.LineBasicMaterial({
      color: RED,
      transparent: true,
      opacity: 0.18,
    });
    const w = 2.1;
    const d = 1.6;
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
    <group position={[0, -0.35, 0.35]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.1, 1.6]} />
        <meshStandardMaterial color="#0c0e14" metalness={0.45} roughness={0.7} />
      </mesh>
      <primitive object={grid} />
    </group>
  );
}

function Prizes({ phase }: { phase: ClawPhase }) {
  const items = useMemo(
    () =>
      [
        { p: [-0.55, 0.12, 0.2] as const, c: RED, r: 0.12 },
        { p: [-0.25, 0.1, 0.45] as const, c: CYAN, r: 0.1 },
        { p: [0.05, 0.14, 0.15] as const, c: "#c9a032", r: 0.13 },
        { p: [0.35, 0.11, 0.4] as const, c: "#9945FF", r: 0.11 },
        { p: [0.6, 0.13, 0.18] as const, c: RED, r: 0.1 },
        { p: [-0.1, 0.1, 0.55] as const, c: CYAN, r: 0.09 },
        { p: [0.2, 0.12, 0.55] as const, c: "#14F195", r: 0.1 },
        { p: [-0.4, 0.11, 0.55] as const, c: "#ff8a98", r: 0.095 },
      ] as const,
    []
  );
  const dim = phase === "win" ? 0.35 : 1;
  const g = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!g.current) return;
    g.current.children.forEach((ch, i) => {
      ch.position.y = items[i]!.p[1] + Math.sin(s.clock.elapsedTime * 1.6 + i) * 0.02;
      ch.rotation.y = s.clock.elapsedTime * 0.4 + i;
    });
  });
  return (
    <group ref={g} position={[0, -0.35, 0.35]} scale={[1, 1, 1]}>
      {items.map((it, i) => (
        <mesh
          key={i}
          position={[it.p[0], it.p[1], it.p[2]]}
          castShadow
          scale={dim}
        >
          <sphereGeometry args={[it.r, 32, 32]} />
          <meshStandardMaterial
            color={it.c}
            metalness={0.55}
            roughness={0.25}
            emissive={it.c}
            emissiveIntensity={0.12}
          />
        </mesh>
      ))}
    </group>
  );
}

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
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const prize = useRef<THREE.Mesh>(null);
  const fall = useRef(0);

  const x = mapClawX(clawX);
  const yTarget = targetClawY(phase);

  useFrame((_, dt) => {
    if (!group.current) return;
    // smooth X / Y
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

    const openAng = open ? 0.55 : 0.08;
    if (left.current) {
      left.current.rotation.z = THREE.MathUtils.damp(
        left.current.rotation.z,
        openAng,
        10,
        dt
      );
    }
    if (right.current) {
      right.current.rotation.z = THREE.MathUtils.damp(
        right.current.rotation.z,
        -openAng,
        10,
        dt
      );
    }

    if (prize.current) {
      if (hold) {
        fall.current = 0;
        prize.current.visible = true;
        prize.current.position.set(0, -0.42, 0);
      } else if (phase === "slip" || phase === "lose") {
        prize.current.visible = true;
        fall.current += dt * 2.2;
        prize.current.position.y = -0.42 - fall.current;
        prize.current.position.x = Math.sin(fall.current * 3) * 0.05;
        if (fall.current > 1.4) prize.current.visible = false;
      } else {
        prize.current.visible = false;
        fall.current = 0;
      }
    }
  });

  // cable length visual
  const cableLen = phase === "drop" || phase === "close" ? 0.95 : 0.35;

  return (
    <group ref={group} position={[0, 1.55, 0.55]} castShadow>
      {/* Gantry carriage */}
      <mesh position={[0, 0.15, 0]} castShadow>
        <boxGeometry args={[0.35, 0.12, 0.28]} />
        <meshStandardMaterial color="#3a4254" metalness={0.85} roughness={0.3} />
      </mesh>
      {/* Cable */}
      <mesh position={[0, -cableLen / 2, 0]}>
        <cylinderGeometry args={[0.015, 0.015, cableLen, 8]} />
        <meshStandardMaterial color="#9aa3b5" metalness={0.9} roughness={0.25} />
      </mesh>
      {/* Motor housing */}
      <mesh position={[0, -cableLen - 0.08, 0]} castShadow>
        <boxGeometry args={[0.28, 0.16, 0.22]} />
        <meshStandardMaterial
          color="#1a2030"
          metalness={0.8}
          roughness={0.3}
          emissive={CYAN}
          emissiveIntensity={0.25}
        />
      </mesh>
      {/* Neon strip on motor */}
      <mesh position={[0, -cableLen - 0.08, 0.12]}>
        <boxGeometry args={[0.18, 0.03, 0.02]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>

      {/* Fingers pivot */}
      <group position={[0, -cableLen - 0.2, 0]}>
        <mesh>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial color="#5a6578" metalness={0.85} roughness={0.3} />
        </mesh>
        {/* Left finger */}
        <group ref={left} position={[-0.04, 0, 0]} rotation={[0, 0, 0.5]}>
          <mesh position={[0, -0.14, 0]} castShadow>
            <boxGeometry args={[0.06, 0.28, 0.06]} />
            <meshStandardMaterial color="#c8d0e0" metalness={0.75} roughness={0.25} />
          </mesh>
          <mesh position={[0, -0.3, 0.01]} castShadow>
            <boxGeometry args={[0.05, 0.12, 0.05]} />
            <meshStandardMaterial color="#8a93a8" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
        {/* Right finger */}
        <group ref={right} position={[0.04, 0, 0]} rotation={[0, 0, -0.5]}>
          <mesh position={[0, -0.14, 0]} castShadow>
            <boxGeometry args={[0.06, 0.28, 0.06]} />
            <meshStandardMaterial color="#c8d0e0" metalness={0.75} roughness={0.25} />
          </mesh>
          <mesh position={[0, -0.3, 0.01]} castShadow>
            <boxGeometry args={[0.05, 0.12, 0.05]} />
            <meshStandardMaterial color="#8a93a8" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>

        {/* Held / falling prize */}
        <mesh ref={prize} position={[0, -0.42, 0]} castShadow visible={false}>
          <sphereGeometry args={[0.1, 28, 28]} />
          <meshStandardMaterial
            color={RED}
            metalness={0.5}
            roughness={0.22}
            emissive={RED}
            emissiveIntensity={hold ? 0.55 : 0.15}
          />
        </mesh>
      </group>

      {/* Top rail */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[2.2, 0.04, 0.08]} />
        <meshStandardMaterial color="#3a4458" metalness={0.9} roughness={0.25} />
      </mesh>
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
      pos[i * 3] = (Math.random() - 0.5) * 0.2;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((s) => {
    if (!ref.current || !active) return;
    ref.current.rotation.y = s.clock.elapsedTime * 2;
    const sc = 1 + Math.sin(s.clock.elapsedTime * 6) * 0.15;
    ref.current.scale.setScalar(sc * 1.4);
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

function OverlayBillboard({
  text,
  color,
}: {
  text: string;
  color: string;
}) {
  // Simple glowing plane as billboard substitute without font texture complexity
  return (
    <group position={[0, 0.7, 1.25]}>
      <mesh>
        <planeGeometry args={[1.6, 0.45]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.45} />
      </mesh>
      <NeonEdge position={[0, 0, 0.01]} args={[1.55, 0.02, 0.01]} color={color} />
      {/* Use simple boxes as letter-block "SECURED"/"MISS" stand-in glow bar */}
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
      root.current.rotation.z = Math.sin(performance.now() * 0.04) * 0.012 * shake.current;
      root.current.position.x = Math.sin(performance.now() * 0.05) * 0.02 * shake.current;
    } else {
      shake.current = Math.max(0, shake.current - dt * 3);
      root.current.rotation.z = THREE.MathUtils.damp(root.current.rotation.z, 0, 8, dt);
      root.current.position.x = THREE.MathUtils.damp(root.current.position.x, 0, 8, dt);
    }
  });

  return (
    <>
      <color attach="background" args={["#0a0b10"]} />
      <fog attach="fog" args={["#0a0b10", 6, 14]} />

      <ambientLight intensity={0.35} />
      <directionalLight
        position={[3, 6, 4]}
        intensity={0.9}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-2, 2, 2]} intensity={0.8} color={CYAN} />
      <pointLight position={[2, 1.5, 2]} intensity={0.7} color={RED} />
      <pointLight position={[0, 1.2, 1.2]} intensity={0.55} color="#ffffff" />
      <spotLight
        position={[0, 3.5, 2]}
        angle={0.4}
        penumbra={0.6}
        intensity={0.6}
        color={CYAN}
      />

      <group ref={root} position={[0, -0.15, 0]}>
        <CabinetShell />
        <GlassPanel />
        <ChamberFloor />
        <Prizes phase={phase} />
        <ClawAssembly phase={phase} clawX={clawX} />
        <WinBurst active={phase === "win"} />
        {phase === "win" && <OverlayBillboard text="SECURED" color={RED} />}
        {phase === "lose" && <OverlayBillboard text="MISS" color="#9BA1AE" />}
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
          intensity={0.45}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
