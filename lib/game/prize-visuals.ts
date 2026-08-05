/**
 * Dense premium Web3 prize chamber layout.
 * Hundreds of stacked crypto collectibles — adult industrial palette only.
 */

export type MoneyPrizeKind =
  | "fiatclaw_token"
  | "sol_token"
  | "nft_capsule"
  | "mystery_crate"
  | "vault_box"
  | "treasure_chest"
  | "metal_collectible"
  | "jackpot_cube"
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
 * Fill the chamber floor densely — ~120+ items, multi-layer stack, no empty voids.
 */
export function buildPrizePileLayout(seed = 42): PrizeVisualSpec[] {
  const rnd = mulberry(seed);
  const out: PrizeVisualSpec[] = [];
  const count = 128;

  const pickKind = (): MoneyPrizeKind => {
    const r = rnd();
    if (r < 0.38) return "fiatclaw_token";
    if (r < 0.58) return "sol_token";
    if (r < 0.68) return "nft_capsule";
    if (r < 0.76) return "mystery_crate";
    if (r < 0.84) return "vault_box";
    if (r < 0.9) return "treasure_chest";
    if (r < 0.96) return "metal_collectible";
    if (r < 0.99) return "sol_bar";
    return "jackpot_cube";
  };

  // Layered grid with jitter — fills floor + mid height of lower chamber third
  const cols = 12;
  const depthRows = 8;
  for (let i = 0; i < count; i++) {
    const kind = i === 0 ? "jackpot_cube" : pickKind(); // legendary center bias later
    const col = i % cols;
    const row = Math.floor(i / cols) % depthRows;
    const layer = Math.floor(i / (cols * depthRows));

    const x = -1.15 + (col / (cols - 1)) * 2.3 + (rnd() - 0.5) * 0.1;
    const z = -0.65 + (row / (depthRows - 1)) * 1.25 + (rnd() - 0.5) * 0.08;
    const yBase =
      0.04 +
      layer * 0.09 +
      rnd() * 0.06 +
      (kind === "vault_box" || kind === "mystery_crate" || kind === "treasure_chest"
        ? 0.04
        : 0) +
      (kind === "jackpot_cube" ? 0.08 : 0);

    // Push jackpot near center on first special slot
    const position: [number, number, number] =
      kind === "jackpot_cube" && i === 0
        ? [0, 0.22, 0.05]
        : [x, yBase, z];

    const scale =
      kind === "jackpot_cube"
        ? 1.15
        : kind === "treasure_chest" || kind === "vault_box"
          ? 0.75 + rnd() * 0.3
          : kind === "mystery_crate"
            ? 0.7 + rnd() * 0.28
            : kind === "fiatclaw_token" || kind === "sol_token"
              ? 0.7 + rnd() * 0.45
              : 0.65 + rnd() * 0.4;

    const rewardKind =
      kind === "fiatclaw_token"
        ? "claw"
        : kind === "jackpot_cube" || kind === "jackpot_hex"
          ? "jackpot"
          : kind === "mystery_crate" || kind === "nft_capsule" || kind === "treasure_chest"
            ? "mystery"
            : "sol";

    out.push({
      kind,
      rewardKind,
      scale,
      position,
      seed: i * 19 + seed,
      bob: rnd() > 0.4 || kind === "jackpot_cube",
      spin:
        kind === "fiatclaw_token" ||
        kind === "sol_token" ||
        kind === "metal_collectible" ||
        kind === "jackpot_cube" ||
        rnd() > 0.55,
    });
  }
  return out;
}

export function isMoneyPrizeKind(kind: MoneyPrizeKind): boolean {
  return (
    kind === "fiatclaw_token" ||
    kind === "sol_token" ||
    kind === "nft_capsule" ||
    kind === "mystery_crate" ||
    kind === "vault_box" ||
    kind === "treasure_chest" ||
    kind === "metal_collectible" ||
    kind === "jackpot_cube" ||
    kind === "sol_bar" ||
    kind === "sol_crystal" ||
    kind === "jackpot_hex" ||
    kind.startsWith("crystal_")
  );
}

export function layoutFillsLowerBand(layout: PrizeVisualSpec[]): boolean {
  if (layout.length < 60) return false;
  // Dense fill: most mass in lower third of chamber (y < 0.55)
  const low = layout.filter((p) => p.position[1] < 0.55).length;
  return low / layout.length > 0.7;
}

export function layoutHasRequiredKinds(layout: PrizeVisualSpec[]): boolean {
  const kinds = new Set(layout.map((p) => p.kind));
  return (
    kinds.has("fiatclaw_token") &&
    kinds.has("sol_token") &&
    kinds.has("vault_box") &&
    kinds.has("mystery_crate") &&
    kinds.has("nft_capsule") &&
    kinds.has("jackpot_cube") &&
    kinds.has("treasure_chest")
  );
}

export function layoutIsDense(layout: PrizeVisualSpec[]): boolean {
  return layout.length >= 100;
}
