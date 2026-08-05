/**
 * Pure prize visual catalog + dense chamber layout.
 * Money-only: $FIATCLAW tokens, purple/SOL crystals, Solana discs — no toys/pills.
 */

export type MoneyPrizeKind =
  | "crystal_red"
  | "crystal_cyan"
  | "crystal_purple"
  | "crystal_gold"
  | "fiatclaw_token"
  | "sol_crystal"
  | "sol_bar"
  | "sol_token"
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
 * Mix from refs: black $FIATCLAW coins, purple crystals, Solana purple/cyan discs.
 */
export function buildPrizePileLayout(seed = 42): PrizeVisualSpec[] {
  const rnd = mulberry(seed);
  const out: PrizeVisualSpec[] = [];
  const count = 48;

  const pickKind = (): MoneyPrizeKind => {
    const r = rnd();
    // Heavy weight on reference pile: tokens + purple crystals + SOL
    if (r < 0.28) return "fiatclaw_token";
    if (r < 0.42) return "crystal_purple";
    if (r < 0.54) return "sol_token";
    if (r < 0.64) return "sol_crystal";
    if (r < 0.72) return "sol_bar";
    if (r < 0.8) return "crystal_red";
    if (r < 0.88) return "crystal_cyan";
    if (r < 0.95) return "crystal_gold";
    return "jackpot_hex";
  };

  for (let i = 0; i < count; i++) {
    const kind = pickKind();
    // Pack tightly in lower band with jitter (overlap OK)
    const col = i % 8;
    const row = Math.floor(i / 8);
    const x = -1.0 + col * 0.26 + (rnd() - 0.5) * 0.14;
    const z = -0.52 + row * 0.16 + (rnd() - 0.5) * 0.1;
    const yBase =
      0.04 +
      rnd() * 0.1 +
      (kind === "sol_bar" ? 0.03 : 0) +
      (kind === "fiatclaw_token" || kind === "sol_token" ? 0.02 : 0) +
      (row % 2) * 0.02;

    const scale =
      kind === "jackpot_hex"
        ? 0.9 + rnd() * 0.25
        : kind === "crystal_gold"
          ? 0.85 + rnd() * 0.3
          : kind === "fiatclaw_token" || kind === "sol_token"
            ? 0.88 + rnd() * 0.32
            : kind === "crystal_purple"
              ? 0.75 + rnd() * 0.45
              : 0.65 + rnd() * 0.5;

    const rewardKind =
      kind === "fiatclaw_token"
        ? "claw"
        : kind === "jackpot_hex"
          ? "jackpot"
          : "sol";

    out.push({
      kind,
      rewardKind,
      scale,
      position: [x, yBase, z],
      seed: i * 19 + seed,
      bob: rnd() > 0.25,
      spin:
        rnd() > 0.35 ||
        kind === "fiatclaw_token" ||
        kind === "sol_token" ||
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
    kind === "sol_token" ||
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
    "sol_token",
    "sol_crystal",
    "crystal_purple",
    "crystal_red",
    "crystal_cyan",
  ] as const;
  return need.every((k) => kinds.has(k));
}
