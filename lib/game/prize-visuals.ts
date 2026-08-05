/**
 * Dense vault floor layout — billboard sprites from public/refs.
 */

export type MoneyPrizeKind =
  | "fiatclaw_token"
  | "crystal"
  | "sol_token"
  | "jackpot_cube"
  | "nft_capsule"
  | "mystery_crate"
  | "sol_bar"
  | "sol_crystal"
  | "crystal_purple"
  | "crystal_red"
  | "crystal_cyan"
  | "crystal_gold"
  | "jackpot_hex"
  | "vault_box"
  | "treasure_chest"
  | "metal_collectible";

export interface PrizeVisualSpec {
  kind: MoneyPrizeKind;
  rewardKind: "sol" | "claw" | "jackpot" | "mystery";
  scale: number;
  position: [number, number, number];
  seed: number;
  bob: boolean;
  spin: boolean;
  texture: string;
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

export const PRIZE_TEXTURES: Record<string, string> = {
  fiatclaw_token: "/refs/fiatclaw-token.png",
  crystal: "/refs/crystal.png",
  crystal_purple: "/refs/crystal.png",
  crystal_red: "/refs/crystal.png",
  crystal_cyan: "/refs/crystal.png",
  crystal_gold: "/refs/crystal.png",
  sol_token: "/refs/sol-token.png",
  sol_bar: "/refs/sol-token.png",
  sol_crystal: "/refs/sol-token.png",
  jackpot_cube: "/refs/jackpot-cube.png",
  jackpot_hex: "/refs/jackpot-cube.png",
  nft_capsule: "/refs/nft-box.png",
  mystery_crate: "/refs/mystery-box.png",
  vault_box: "/refs/mystery-box.png",
  treasure_chest: "/refs/jackpot-cube.png",
  metal_collectible: "/refs/fiatclaw-token.png",
};

/** Dense circular vault floor — many overlapping billboards. */
export function buildPrizePileLayout(seed = 42): PrizeVisualSpec[] {
  const rnd = mulberry(seed);
  const out: PrizeVisualSpec[] = [];
  // Dense neat lower pile inside floor disc (radius < glass R)
  const count = 150;

  const pickKind = (): MoneyPrizeKind => {
    const r = rnd();
    // Prefer branded coins (etalon pile language)
    if (r < 0.42) return "fiatclaw_token";
    if (r < 0.68) return "sol_token";
    if (r < 0.78) return "crystal";
    if (r < 0.88) return "nft_capsule";
    if (r < 0.95) return "mystery_crate";
    return "jackpot_cube";
  };

  // center jackpot cube
  out.push({
    kind: "jackpot_cube",
    rewardKind: "jackpot",
    scale: 1.3,
    position: [0, 0.14, 0.04],
    seed: seed,
    bob: true,
    spin: false,
    texture: PRIZE_TEXTURES.jackpot_cube!,
  });

  for (let i = 1; i < count; i++) {
    const kind = pickKind();
    const angle = rnd() * Math.PI * 2;
    // Pack tightly on floor disc — stay inside chamber floor (~1.25)
    const radius = Math.sqrt(rnd()) * 1.05;
    const layer = Math.floor(i / 36);
    const x = Math.cos(angle) * radius + (rnd() - 0.5) * 0.04;
    const z = Math.sin(angle) * radius * 0.9 + (rnd() - 0.5) * 0.04;
    const y = 0.03 + layer * 0.055 + rnd() * 0.03;

    out.push({
      kind,
      rewardKind:
        kind === "fiatclaw_token"
          ? "claw"
          : kind === "jackpot_cube"
            ? "jackpot"
            : kind === "nft_capsule" || kind === "mystery_crate"
              ? "mystery"
              : "sol",
      scale:
        kind === "jackpot_cube"
          ? 0.95 + rnd() * 0.18
          : kind === "crystal"
            ? 0.7 + rnd() * 0.35
            : 0.78 + rnd() * 0.32,
      position: [x, y, z],
      seed: i * 19 + seed,
      bob: rnd() > 0.45,
      spin: false,
      texture: PRIZE_TEXTURES[kind] ?? PRIZE_TEXTURES.fiatclaw_token!,
    });
  }
  return out;
}

export function isMoneyPrizeKind(kind: MoneyPrizeKind): boolean {
  return Boolean(PRIZE_TEXTURES[kind]);
}

export function layoutFillsLowerBand(layout: PrizeVisualSpec[]): boolean {
  if (layout.length < 50) return false;
  const low = layout.filter((p) => p.position[1] < 0.5).length;
  return low / layout.length > 0.7;
}

export function layoutHasRequiredKinds(layout: PrizeVisualSpec[]): boolean {
  const kinds = new Set(layout.map((p) => p.kind));
  return (
    kinds.has("fiatclaw_token") &&
    (kinds.has("crystal") || kinds.has("crystal_purple")) &&
    kinds.has("sol_token")
  );
}

export function layoutIsDense(layout: PrizeVisualSpec[]): boolean {
  return layout.length >= 80;
}

export function textureForKind(kind: MoneyPrizeKind): string {
  return PRIZE_TEXTURES[kind] ?? "/refs/fiatclaw-token.png";
}
