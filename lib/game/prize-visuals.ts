/**
 * Pure prize visual catalog + dense chamber layout.
 * All types are money-equivalent (SOL / $CLAW / jackpot) — no empty toys.
 * Used by R3F scene and unit tests (no WebGL).
 */

export type MoneyPrizeKind =
  | "crystal"
  | "fiatclaw_token"
  | "sol_crystal"
  | "sol_bar"
  | "neon_capsule"
  | "gold_crystal"
  | "jackpot_hex";

export interface PrizeVisualSpec {
  kind: MoneyPrizeKind;
  /** Maps to server reward kind for value narrative */
  rewardKind: "sol" | "claw" | "jackpot" | "mystery";
  /** Base scale multiplier */
  scale: number;
  /** Local position in chamber floor space (x, y base, z) */
  position: [number, number, number];
  /** Idle animation seed */
  seed: number;
  bob: boolean;
  spin: boolean;
}

/** Stable PRNG for layout (deterministic density). */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Dense pile filling roughly the lower fifth of the chamber view.
 * ~28–36 pieces, varied size/height, light overlap, not a single row.
 */
export function buildPrizePileLayout(seed = 42): PrizeVisualSpec[] {
  const rnd = mulberry(seed);
  const kinds: MoneyPrizeKind[] = [
    "crystal",
    "crystal",
    "crystal",
    "fiatclaw_token",
    "fiatclaw_token",
    "fiatclaw_token",
    "sol_crystal",
    "sol_crystal",
    "sol_bar",
    "sol_bar",
    "neon_capsule",
    "neon_capsule",
    "gold_crystal",
    "jackpot_hex",
  ];

  const out: PrizeVisualSpec[] = [];
  // Grid-ish scatter in chamber floor: x ∈ [-0.9, 0.9], z ∈ [-0.55, 0.55]
  const count = 32;
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length]!;
    // More rare types at higher indices occasionally
    let k: MoneyPrizeKind = kind;
    const r = rnd();
    if (r > 0.92) k = "jackpot_hex";
    else if (r > 0.84) k = "gold_crystal";
    else if (r > 0.7) k = "fiatclaw_token";
    else if (r > 0.55) k = "sol_bar";
    else if (r > 0.4) k = "sol_crystal";
    else if (r > 0.25) k = "neon_capsule";
    else k = "crystal";

    const col = i % 6;
    const row = Math.floor(i / 6);
    const x = -0.85 + col * 0.32 + (rnd() - 0.5) * 0.14;
    const z = -0.45 + row * 0.22 + (rnd() - 0.5) * 0.12;
    const y = 0.06 + rnd() * 0.1 + (k === "sol_bar" ? 0.04 : 0);
    const scale =
      k === "jackpot_hex"
        ? 0.85 + rnd() * 0.2
        : k === "gold_crystal"
          ? 0.9 + rnd() * 0.25
          : 0.7 + rnd() * 0.45;

    const rewardKind =
      k === "fiatclaw_token"
        ? "claw"
        : k === "jackpot_hex"
          ? "jackpot"
          : k === "neon_capsule"
            ? "mystery"
            : "sol";

    out.push({
      kind: k,
      rewardKind,
      scale,
      position: [x, y, z],
      seed: i * 17 + seed,
      bob: rnd() > 0.35,
      spin: rnd() > 0.45 || k === "fiatclaw_token" || k === "crystal",
    });
  }
  return out;
}

/** Every layout entry is money-valued (no toy-only). */
export function isMoneyPrizeKind(kind: MoneyPrizeKind): boolean {
  return (
    kind === "crystal" ||
    kind === "fiatclaw_token" ||
    kind === "sol_crystal" ||
    kind === "sol_bar" ||
    kind === "neon_capsule" ||
    kind === "gold_crystal" ||
    kind === "jackpot_hex"
  );
}

export function layoutFillsLowerBand(layout: PrizeVisualSpec[]): boolean {
  if (layout.length < 20) return false;
  // All y bases sit low; max |x|,|z| within chamber floor
  const ys = layout.map((p) => p.position[1]);
  const maxY = Math.max(...ys);
  return maxY < 0.35 && layout.length >= 28;
}
