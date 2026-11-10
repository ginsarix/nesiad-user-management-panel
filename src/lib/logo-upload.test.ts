import { describe, expect, it } from "vitest";
import {
  contentBounds,
  isDrawnLogo,
  isPdf,
  isSvg,
  svgDrawingBox,
} from "./logo-upload";

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

describe("isSvg / isDrawnLogo", () => {
  it("draws PDFs and SVGs, sends other images as they are", () => {
    expect(isSvg(new File([], "logo.SVG"))).toBe(true);
    expect(isSvg(new File([], "x", { type: "image/svg+xml" }))).toBe(true);
    expect(isDrawnLogo(new File([], "logo.pdf"))).toBe(true);
    expect(isDrawnLogo(new File([], "logo.svg"))).toBe(true);
    expect(isDrawnLogo(new File([], "logo.png", { type: "image/png" }))).toBe(
      false,
    );
  });
});

describe("svgDrawingBox", () => {
  it("uses the viewBox, whatever the width and height say", () => {
    expect(
      svgDrawingBox({ viewBox: "-5 10 200,100", width: "50%", height: null }),
    ).toEqual({ x: -5, y: 10, width: 200, height: 100 });
  });

  it("falls back to width and height in px", () => {
    expect(
      svgDrawingBox({ viewBox: null, width: "120", height: "1in" }),
    ).toEqual({ x: 0, y: 0, width: 120, height: 96 });
    expect(
      svgDrawingBox({ viewBox: "0 0 0 10", width: "25.4mm", height: "12pt" }),
    ).toEqual({ x: 0, y: 0, width: 96, height: 16 });
  });

  it("has no box without a usable viewBox or absolute size", () => {
    expect(
      svgDrawingBox({ viewBox: null, width: "100%", height: "100%" }),
    ).toBeNull();
    expect(
      svgDrawingBox({ viewBox: "0 0 a b", width: "10", height: null }),
    ).toBeNull();
  });
});
