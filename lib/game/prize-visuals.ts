/**
 * Pure prize visual catalog + dense chamber layout.
 * All types are money-equivalent (SOL / $CLAW / jackpot) — no empty toys.
 */

export type MoneyPrizeKind =
  | "crystal_red"
  | "crystal_cyan"
  | "crystal_purple"
  | "crystal_gold"
  | "fiatclaw_token"
  | "sol_crystal"
  | "sol_bar"
  | "neon_capsule"
  | "jackpot_hex";

export interface PrizeVisualSpec {
  kind: MoneyPrizeKind;
  rewardKind: "sol" | "claw" | "jackpot" | "mystery";
  scale: number;
  position: [number, number, number];
  seed: number;
  bob: boolean;
  spin: boolean;
}

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
 * Dense pile ~ lower fifth of chamber.
 * Mix: FIATCLAW tokens + SOL forms + multi-color gems + rare jackpot hex.
 */
export function buildPrizePileLayout(seed = 42): PrizeVisualSpec[] {
  const rnd = mulberry(seed);
  const out: PrizeVisualSpec[] = [];
  const count = 40;

  const pickKind = (): MoneyPrizeKind => {
    const r = rnd();
    if (r < 0.18) return "fiatclaw_token";
    if (r < 0.32) return "sol_crystal";
    if (r < 0.44) return "sol_bar";
    if (r < 0.54) return "neon_capsule";
    if (r < 0.66) return "crystal_red";
    if (r < 0.76) return "crystal_cyan";
    if (r < 0.86) return "crystal_purple";
    if (r < 0.94) return "crystal_gold";
    return "jackpot_hex";
  };

  for (let i = 0; i < count; i++) {
    const kind = pickKind();
    // Pack tightly in lower band with jitter (overlap OK)
    const col = i % 7;
    const row = Math.floor(i / 7);
    const x = -0.92 + col * 0.28 + (rnd() - 0.5) * 0.16;
    const z = -0.48 + row * 0.18 + (rnd() - 0.5) * 0.1;
    const yBase =
      0.05 +
      rnd() * 0.09 +
      (kind === "sol_bar" ? 0.03 : 0) +
      (kind === "fiatclaw_token" ? 0.02 : 0) +
      (row % 2) * 0.02;

    const scale =
      kind === "jackpot_hex"
        ? 0.9 + rnd() * 0.25
        : kind === "crystal_gold"
          ? 0.85 + rnd() * 0.3
          : kind === "fiatclaw_token"
            ? 0.85 + rnd() * 0.35
            : 0.65 + rnd() * 0.5;

    const rewardKind =
      kind === "fiatclaw_token"
        ? "claw"
        : kind === "jackpot_hex"
          ? "jackpot"
          : kind === "neon_capsule"
            ? "mystery"
            : "sol";

    out.push({
      kind,
      rewardKind,
      scale,
      position: [x, yBase, z],
      seed: i * 19 + seed,
      bob: rnd() > 0.3,
      spin:
        rnd() > 0.4 ||
        kind === "fiatclaw_token" ||
        kind.startsWith("crystal") ||
        kind === "sol_crystal",
    });
  }
  return out;
}

export function isMoneyPrizeKind(kind: MoneyPrizeKind): boolean {
  return (
    kind === "crystal_red" ||
    kind === "crystal_cyan" ||
    kind === "crystal_purple" ||
    kind === "crystal_gold" ||
    kind === "fiatclaw_token" ||
    kind === "sol_crystal" ||
    kind === "sol_bar" ||
    kind === "neon_capsule" ||
    kind === "jackpot_hex"
  );
}

export function layoutFillsLowerBand(layout: PrizeVisualSpec[]): boolean {
  if (layout.length < 28) return false;
  const maxY = Math.max(...layout.map((p) => p.position[1]));
  return maxY < 0.35;
}

export function layoutHasRequiredKinds(layout: PrizeVisualSpec[]): boolean {
  const kinds = new Set(layout.map((p) => p.kind));
  const need = [
    "fiatclaw_token",
    "sol_crystal",
    "sol_bar",
    "crystal_red",
    "crystal_cyan",
    "crystal_purple",
    "crystal_gold",
    "neon_capsule",
    "jackpot_hex",
  ] as const;
  return need.every((k) => kinds.has(k));
}
