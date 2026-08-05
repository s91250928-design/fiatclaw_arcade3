/**
 * Dense prize layout for billboard sprites (public/refs).
 * Kinds: $FIATCLAW tokens, crystals, SOL — no toy sphere piles.
 */

export type MoneyPrizeKind =
  | "fiatclaw_token"
  | "crystal"
  | "sol_token"
  | "jackpot_cube"
  // aliases for held-prize / older tests
  | "sol_bar"
  | "sol_crystal"
  | "crystal_purple"
  | "crystal_red"
  | "crystal_cyan"
  | "crystal_gold"
  | "jackpot_hex"
  | "nft_capsule"
  | "mystery_crate"
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
  /** Path under public/ for billboard texture */
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
  nft_capsule: "/refs/sol-token.png",
  mystery_crate: "/refs/jackpot-cube.png",
  vault_box: "/refs/jackpot-cube.png",
  treasure_chest: "/refs/jackpot-cube.png",
  metal_collectible: "/refs/fiatclaw-token.png",
};

/**
 * Dense lower-band pile — FIATCLAW / crystal / SOL sprites.
 */
export function buildPrizePileLayout(seed = 42): PrizeVisualSpec[] {
  const rnd = mulberry(seed);
  const out: PrizeVisualSpec[] = [];
  const count = 96;

  const pickKind = (): MoneyPrizeKind => {
    const r = rnd();
    if (r < 0.42) return "fiatclaw_token";
    if (r < 0.68) return "crystal";
    if (r < 0.94) return "sol_token";
    return "jackpot_cube";
  };

  const cols = 10;
  const depthRows = 7;
  for (let i = 0; i < count; i++) {
    const kind = i === 0 ? "jackpot_cube" : pickKind();
    const col = i % cols;
    const row = Math.floor(i / cols) % depthRows;
    const layer = Math.floor(i / (cols * depthRows));

    const x = -1.1 + (col / Math.max(1, cols - 1)) * 2.2 + (rnd() - 0.5) * 0.12;
    const z = -0.6 + (row / Math.max(1, depthRows - 1)) * 1.15 + (rnd() - 0.5) * 0.1;
    let yBase = 0.06 + layer * 0.08 + rnd() * 0.05;
    if (kind === "jackpot_cube") yBase += 0.06;

    const position: [number, number, number] =
      kind === "jackpot_cube" && i === 0 ? [0, 0.18, 0.05] : [x, yBase, z];

    const scale =
      kind === "jackpot_cube"
        ? 0.95 + rnd() * 0.2
        : kind === "crystal"
          ? 0.55 + rnd() * 0.45
          : 0.5 + rnd() * 0.5;

    const rewardKind =
      kind === "fiatclaw_token"
        ? "claw"
        : kind === "jackpot_cube" || kind === "jackpot_hex"
          ? "jackpot"
          : "sol";

    out.push({
      kind,
      rewardKind,
      scale,
      position,
      seed: i * 19 + seed,
      bob: rnd() > 0.35,
      spin: kind === "fiatclaw_token" || kind === "sol_token" || rnd() > 0.5,
      texture: PRIZE_TEXTURES[kind] ?? PRIZE_TEXTURES.fiatclaw_token!,
    });
  }
  return out;
}

export function isMoneyPrizeKind(kind: MoneyPrizeKind): boolean {
  return Boolean(PRIZE_TEXTURES[kind] || kind.startsWith("crystal") || kind.startsWith("sol"));
}

export function layoutFillsLowerBand(layout: PrizeVisualSpec[]): boolean {
  if (layout.length < 40) return false;
  const low = layout.filter((p) => p.position[1] < 0.45).length;
  return low / layout.length > 0.65;
}

export function layoutHasRequiredKinds(layout: PrizeVisualSpec[]): boolean {
  const kinds = new Set(layout.map((p) => p.kind));
  const hasCrystal =
    kinds.has("crystal") ||
    kinds.has("crystal_purple") ||
    kinds.has("crystal_red") ||
    kinds.has("crystal_cyan");
  const hasSol =
    kinds.has("sol_token") || kinds.has("sol_bar") || kinds.has("sol_crystal");
  return kinds.has("fiatclaw_token") && hasCrystal && hasSol;
}

export function layoutIsDense(layout: PrizeVisualSpec[]): boolean {
  return layout.length >= 60;
}

/** Texture path for a kind (tests + runtime). */
export function textureForKind(kind: MoneyPrizeKind): string {
  return PRIZE_TEXTURES[kind] ?? "/refs/fiatclaw-token.png";
}
