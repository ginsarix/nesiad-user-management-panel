/**
 * In-memory sliding-window limiter. It lives in one process and resets on
 * restart, which fits the single standalone server. `record` is separate from
 * `isLimited` so the caller counts only the attempts it chooses to.
 */
export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const hits = new Map<string, number[]>();

  function recent(key: string) {
    const cutoff = now() - windowMs;
    const kept = (hits.get(key) ?? []).filter((time) => time > cutoff);
    if (kept.length) hits.set(key, kept);
    else hits.delete(key);
    return kept;
  }

  return {
    /** An undefined key (no client IP) is never limited */
    isLimited(key: string | undefined) {
      return key !== undefined && recent(key).length >= limit;
    },
    record(key: string | undefined) {
      if (key === undefined) return;
      hits.set(key, [...recent(key), now()]);
    },
  };
}
