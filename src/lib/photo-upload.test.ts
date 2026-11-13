import { describe, expect, it } from "vitest";
import { fitWithin } from "./photo-upload";

describe("fitWithin", () => {
  it("shrinks a landscape photo to 800px wide", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 800, height: 600 });
  });

  it("shrinks a portrait photo to 800px tall", () => {
    expect(fitWithin(3000, 4000)).toEqual({ width: 600, height: 800 });
  });

  it("never enlarges a small photo", () => {
    expect(fitWithin(500, 300)).toEqual({ width: 500, height: 300 });
  });

  it("keeps at least one pixel on the short side", () => {
    expect(fitWithin(5000, 2)).toEqual({ width: 800, height: 1 });
  });
});
