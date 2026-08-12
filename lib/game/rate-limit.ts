/**
 * Simple sliding-window rate limiter (process-local).
 * Used by stake API — wallet and IP keys.
 */

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number; remaining: 0 };

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  /** Injected clock for tests */
  now?: () => number;
};

/**
 * Create a pure-ish limiter. State is internal Map (not durable across restarts).
 */
export function createRateLimiter(opts: RateLimitOptions) {
  const hits = new Map<string, number[]>();
  const nowFn = opts.now ?? (() => Date.now());

  return {
    /** Record a hit and return whether under limit. */
    check(key: string): RateLimitResult {
      const t = nowFn();
      const windowStart = t - opts.windowMs;
      const prev = hits.get(key) ?? [];
      const recent = prev.filter((ts) => ts > windowStart);
      if (recent.length >= opts.max) {
        const oldest = recent[0] ?? t;
        hits.set(key, recent);
        return {
          ok: false,
          remaining: 0,
          retryAfterMs: Math.max(0, oldest + opts.windowMs - t),
        };
      }
      recent.push(t);
      hits.set(key, recent);
      return { ok: true, remaining: opts.max - recent.length };
    },
    /** Test helper */
    reset() {
      hits.clear();
    },
    size() {
      return hits.size;
    },
  };
}

/** Shared stake API limiter: 20 mutations / minute / key */
export const stakeMutationLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
});

/** Shared stake GET limiter: 60 / minute / key */
export const stakeReadLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
});
