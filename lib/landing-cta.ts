/**
 * Pure helpers for landing → live lobby navigation.
 * Landing is static HTML; CTAs must open Next routes that host SolanaProvider.
 */

export type LandingCtaTarget = "connect" | "stake" | "play";

export const LANDING_CTA_URLS: Record<LandingCtaTarget, string> = {
  connect: "/play?connect=1",
  stake: "/stake",
  play: "/play",
};

/** Map CTA kind to live Next route (unit-tested). */
export function landingCtaHref(kind: LandingCtaTarget): string {
  return LANDING_CTA_URLS[kind];
}

/**
 * Parse /play arrival flags from landing.
 * connect=1 or #connect → open wallet modal
 * #stake → scroll to stake chrome
 */
export function parseLobbyEntryFlags(input: {
  search?: string;
  hash?: string;
}): { openConnect: boolean; scrollStake: boolean } {
  const search = input.search ?? "";
  const hash = (input.hash ?? "").replace(/^#/, "").toLowerCase();
  const q = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(q);
  const openConnect =
    params.get("connect") === "1" ||
    params.get("connect") === "true" ||
    hash === "connect";
  const scrollStake = hash === "stake" || params.get("stake") === "1";
  return { openConnect, scrollStake };
}
