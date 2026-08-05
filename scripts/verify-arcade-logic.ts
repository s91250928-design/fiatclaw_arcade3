import {
  WIN_PROBABILITY,
  buildPrizePileLayout,
  layoutHasRequiredKinds,
  layoutFillsLowerBand,
  clawPullSequence,
} from "../lib/game/index";

const l = buildPrizePileLayout(42);
const kinds: Record<string, number> = {};
for (const p of l) kinds[p.kind] = (kinds[p.kind] || 0) + 1;

const out = {
  WIN_PROBABILITY,
  count: l.length,
  fillsLower: layoutFillsLowerBand(l),
  hasRequired: layoutHasRequiredKinds(l),
  kinds,
  win: clawPullSequence(true),
  lose: clawPullSequence(false),
};
console.log(JSON.stringify(out, null, 2));
if (WIN_PROBABILITY !== 0.2) process.exit(1);
if (!out.fillsLower || !out.hasRequired || out.count < 40) process.exit(1);
