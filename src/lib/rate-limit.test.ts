import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("limits after `limit` records within the window", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });

    limiter.record("a");
    expect(limiter.isLimited("a")).toBe(false);
    limiter.record("a");

    expect(limiter.isLimited("a")).toBe(true);
    expect(limiter.isLimited("b")).toBe(false);
  });

  it("frees the key after the window", () => {
    let time = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1000,
      now: () => time,
    });

    limiter.record("a");
    time = 999;
    expect(limiter.isLimited("a")).toBe(true);
    time = 1000;
    expect(limiter.isLimited("a")).toBe(false);
  });

  it("never limits an undefined key", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });

    limiter.record(undefined);
    limiter.record(undefined);

    expect(limiter.isLimited(undefined)).toBe(false);
  });
});
