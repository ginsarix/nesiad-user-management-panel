import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("limits after `limit` records within the window", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });

    expect(limiter.reserve("a")).toBe(true);
    expect(limiter.isLimited("a")).toBe(false);
    expect(limiter.reserve("a")).toBe(true);

    expect(limiter.isLimited("a")).toBe(true);
    expect(limiter.reserve("a")).toBe(false);
    expect(limiter.isLimited("b")).toBe(false);
  });

  it("gives an allowance back on release", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });

    limiter.reserve("a");
    limiter.release("a");

    expect(limiter.isLimited("a")).toBe(false);
    expect(limiter.reserve("a")).toBe(true);
  });

  it("frees the key after the window", () => {
    let time = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1000,
      now: () => time,
    });

    limiter.reserve("a");
    time = 999;
    expect(limiter.isLimited("a")).toBe(true);
    time = 1000;
    expect(limiter.isLimited("a")).toBe(false);
  });

  it("never limits an undefined key", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });

    expect(limiter.reserve(undefined)).toBe(true);
    expect(limiter.reserve(undefined)).toBe(true);
    limiter.release(undefined);

    expect(limiter.isLimited(undefined)).toBe(false);
  });
});
