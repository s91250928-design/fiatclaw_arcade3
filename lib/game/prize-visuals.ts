/**
 * Premium Web3 collectible pile layout — adult crypto arcade, not toys.
 * $FIATCLAW coins, SOL, NFT capsules, mystery crates, vaults, jackpot cube.
 */

export type MoneyPrizeKind =
  | "fiatclaw_token"
  | "sol_token"
  | "nft_capsule"
  | "mystery_crate"
  | "vault_box"
  | "metal_collectible"
  | "jackpot_cube"
  // legacy aliases kept for held-prize / mesh fallbacks
  | "sol_bar"
  | "sol_crystal"
  | "jackpot_hex"
  | "crystal_purple"
  | "crystal_red"
  | "crystal_cyan"
  | "crystal_gold";

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
 * Dense lower-band pile of premium metallic crypto prizes.
 * Palette: black / gunmetal / dark chrome + red / cyan / purple accents only.
 */
export function buildPrizePileLayout(seed = 42): PrizeVisualSpec[] {
  const rnd = mulberry(seed);
  const out: PrizeVisualSpec[] = [];
  const count = 44;

  const pickKind = (): MoneyPrizeKind => {
    const r = rnd();
    if (r < 0.26) return "fiatclaw_token";
    if (r < 0.44) return "sol_token";
    if (r < 0.56) return "vault_box";
    if (r < 0.66) return "mystery_crate";
    if (r < 0.76) return "nft_capsule";
    if (r < 0.88) return "metal_collectible";
    if (r < 0.96) return "sol_bar";
    return "jackpot_cube";
  };

  for (let i = 0; i < count; i++) {
    const kind = pickKind();
    const col = i % 7;
    const row = Math.floor(i / 7);
    const x = -0.95 + col * 0.3 + (rnd() - 0.5) * 0.12;
    const z = -0.5 + row * 0.17 + (rnd() - 0.5) * 0.09;
    const yBase =
      0.05 +
      rnd() * 0.08 +
      (kind === "vault_box" || kind === "mystery_crate" ? 0.04 : 0) +
      (kind === "jackpot_cube" ? 0.06 : 0) +
      (row % 2) * 0.015;

    const scale =
      kind === "jackpot_cube"
        ? 0.95 + rnd() * 0.2
        : kind === "vault_box" || kind === "mystery_crate"
          ? 0.8 + rnd() * 0.25
          : kind === "fiatclaw_token" || kind === "sol_token"
            ? 0.9 + rnd() * 0.28
            : 0.7 + rnd() * 0.4;

    const rewardKind =
      kind === "fiatclaw_token"
        ? "claw"
        : kind === "jackpot_cube" || kind === "jackpot_hex"
          ? "jackpot"
          : kind === "mystery_crate" || kind === "nft_capsule"
            ? "mystery"
            : "sol";

    out.push({
      kind,
      rewardKind,
      scale,
      position: [x, yBase, z],
      seed: i * 19 + seed,
      bob: rnd() > 0.35,
      spin:
        kind === "fiatclaw_token" ||
        kind === "sol_token" ||
        kind === "metal_collectible" ||
        rnd() > 0.5,
    });
  }
  return out;
}

export function isMoneyPrizeKind(kind: MoneyPrizeKind): boolean {
  const all: MoneyPrizeKind[] = [
    "fiatclaw_token",
    "sol_token",
    "nft_capsule",
    "mystery_crate",
    "vault_box",
    "metal_collectible",
    "jackpot_cube",
    "sol_bar",
    "sol_crystal",
    "jackpot_hex",
    "crystal_purple",
    "crystal_red",
    "crystal_cyan",
    "crystal_gold",
  ];
  return all.includes(kind);
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
    "vault_box",
    "mystery_crate",
    "nft_capsule",
  ] as const;
  return need.every((k) => kinds.has(k));
}
