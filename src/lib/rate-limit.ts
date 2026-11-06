/**
 * In-memory sliding-window limiter. It lives in one process and resets on
 * restart, which fits the single standalone server. `reserve` checks and
 * counts in one synchronous step, so parallel requests can't all pass the
 * check; the caller `release`s the reservation when the attempt fails.
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
    /** Counts one use when under the limit; false (and no count) when over it */
    reserve(key: string | undefined) {
      if (key === undefined) return true;
      const kept = recent(key);
      if (kept.length >= limit) return false;
      hits.set(key, [...kept, now()]);
      return true;
    },
    /** Gives back one reservation, e.g. for a submission that wasn't saved */
    release(key: string | undefined) {
      if (key === undefined) return;
      const kept = recent(key);
      kept.pop();
      if (kept.length) hits.set(key, kept);
      else hits.delete(key);
    },
  };
}
