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
  /**
   * Dense coin-first pile (premium $FIATCLAW + SOL + crates + jackpots).
   * Soft “physics” packing: spiral layers with varied rest height (no Rapier).
   * Fills lower vault — minimal empty floor space.
   */
  /** Dense multi-layer etalon mound — readable coins + boxes, not flat sheet. */
  const count = 248;

  const pickKind = (): MoneyPrizeKind => {
    const r = rnd();
    // Heavy brand coins — crates / jackpots as landmarks (match etalon mix)
    if (r < 0.44) return "fiatclaw_token";
    if (r < 0.72) return "sol_token";
    if (r < 0.78) return "crystal";
    if (r < 0.88) return "nft_capsule";
    if (r < 0.96) return "mystery_crate";
    return "jackpot_cube";
  };

  // Center jackpot cube (etalon hero prize)
  out.push({
    kind: "jackpot_cube",
    rewardKind: "jackpot",
    scale: 1.48,
    position: [0, 0.22, 0.02],
    seed: seed,
    bob: true,
    spin: false,
    texture: PRIZE_TEXTURES.jackpot_cube!,
  });
  // Secondary landmark boxes near center
  out.push({
    kind: "nft_capsule",
    rewardKind: "mystery",
    scale: 1.12,
    position: [0.28, 0.16, -0.12],
    seed: seed + 1,
    bob: true,
    spin: false,
    texture: PRIZE_TEXTURES.nft_capsule!,
  });
  out.push({
    kind: "mystery_crate",
    rewardKind: "mystery",
    scale: 1.08,
    position: [-0.26, 0.15, 0.14],
    seed: seed + 2,
    bob: true,
    spin: false,
    texture: PRIZE_TEXTURES.mystery_crate!,
  });

  // Soft settle: track occupied cells so coins stack into a multi-layer mound
  const cells = new Map<string, number>();
  const cellKey = (x: number, z: number) =>
    `${Math.round(x * 10)},${Math.round(z * 10)}`;

  for (let i = 3; i < count; i++) {
    const kind = pickKind();
    const angle = rnd() * Math.PI * 2;
    // Pack tightly on floor disc — chamber floor ~1.22
    const radius = Math.sqrt(rnd()) * 1.22;
    const x = Math.cos(angle) * radius + (rnd() - 0.5) * 0.035;
    const z = Math.sin(angle) * radius * 0.88 + (rnd() - 0.5) * 0.035;
    const key = cellKey(x, z);
    const stack = cells.get(key) ?? 0;
    cells.set(key, stack + 1);
    const coinH =
      kind === "jackpot_cube"
        ? 0.11
        : kind === "nft_capsule" || kind === "mystery_crate"
          ? 0.092
          : kind === "crystal"
            ? 0.078
            : 0.056;
    // Natural mound: higher near center, lower at edges (multi-layer)
    const centerBias = Math.max(0, 1 - radius / 1.22) * 0.09;
    const layerBoost = stack > 1 ? stack * 0.012 : 0;
    const y = 0.035 + stack * coinH + centerBias + layerBoost + rnd() * 0.016;

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
          ? 1.05 + rnd() * 0.22
          : kind === "nft_capsule" || kind === "mystery_crate"
            ? 0.95 + rnd() * 0.24
            : kind === "crystal"
              ? 0.8 + rnd() * 0.28
              : 0.86 + rnd() * 0.34,
      position: [x, y, z],
      seed: i * 19 + seed,
      bob: rnd() > 0.42,
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
