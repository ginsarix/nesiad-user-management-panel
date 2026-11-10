import { describe, expect, it } from "vitest";
import { contentBounds, isPdf } from "./pdf-logo";

type Rgba = [number, number, number, number];
const CLEAR: Rgba = [0, 0, 0, 0];
const WHITE: Rgba = [255, 255, 255, 255];
const NAVY: Rgba = [20, 40, 90, 255];

/** A width×height image of `background` with `ink` painted in the given cells */
function image(
  width: number,
  height: number,
  background: Rgba,
  painted: { x: number; y: number; color: Rgba }[],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(background, i * 4);
  for (const { x, y, color } of painted) data.set(color, (y * width + x) * 4);
  return data;
}

describe("contentBounds", () => {
  it("trims a transparent page down to the logo", () => {
    const data = image(10, 8, CLEAR, [
      { x: 2, y: 3, color: NAVY },
      { x: 6, y: 5, color: NAVY },
    ]);
    expect(contentBounds(data, 10, 8)).toEqual({
      x: 2,
      y: 3,
      width: 5,
      height: 3,
    });
  });

  it("trims a white page the same way", () => {
    const data = image(10, 8, WHITE, [{ x: 4, y: 1, color: NAVY }]);
    expect(contentBounds(data, 10, 8)).toEqual({
      x: 4,
      y: 1,
      width: 1,
      height: 1,
    });
  });

  it("keeps a white-only logo on a transparent page", () => {
    const data = image(6, 6, CLEAR, [
      { x: 1, y: 1, color: WHITE },
      { x: 3, y: 4, color: WHITE },
    ]);
    expect(contentBounds(data, 6, 6)).toEqual({
      x: 1,
      y: 1,
      width: 3,
      height: 4,
    });
  });

  it("finds nothing on an empty page", () => {
    expect(contentBounds(image(4, 4, CLEAR, []), 4, 4)).toBeNull();
  });
});

describe("isPdf", () => {
  it("goes by type or, when the browser sends none, by name", () => {
    expect(isPdf(new File([], "logo.PDF"))).toBe(true);
    expect(isPdf(new File([], "logo", { type: "application/pdf" }))).toBe(true);
    expect(isPdf(new File([], "logo.png", { type: "image/png" }))).toBe(false);
  });
});
