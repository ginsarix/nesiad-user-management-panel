import { afterAll, describe, expect, it } from "vitest";
import { deleteFile } from "./file-storage";
import {
  DOCUMENT_MIME_TYPES,
  LOGO_MIME_TYPES,
  looksLikeSvg,
  storeUpload,
} from "./uploads";

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

const stored: string[] = [];
afterAll(async () => {
  await Promise.all(stored.map(deleteFile));
});

async function store(...args: Parameters<typeof storeUpload>) {
  const name = await storeUpload(...args);
  if (name) stored.push(name);
  return name;
}

describe("storeUpload", () => {
  it("stores a PNG named .JPG by content", async () => {
    const name = await store(
      new File([PNG], "x.JPG", { type: "" }),
      DOCUMENT_MIME_TYPES,
      "document",
    );
    expect(name).toMatch(/^document_.*\.png$/);
  });

  it("stores a PDF as a document", async () => {
    const name = await store(
      new File([PDF], "a.pdf"),
      DOCUMENT_MIME_TYPES,
      "document",
    );
    expect(name).toMatch(/^document_.*\.pdf$/);
  });

  it("refuses text renamed to .pdf", async () => {
    const name = await store(
      new File(["just text"], "a.pdf", { type: "application/pdf" }),
      DOCUMENT_MIME_TYPES,
      "document",
    );
    expect(name).toBeNull();
  });

  it("refuses a PDF as a logo", async () => {
    const name = await store(new File([PDF], "a.pdf"), LOGO_MIME_TYPES, "logo");
    expect(name).toBeNull();
  });

  it("doesn't keep the original filename", async () => {
    const name = await store(
      new File([PNG], "ayse-kimlik.png"),
      DOCUMENT_MIME_TYPES,
      "document",
    );
    expect(name).not.toContain("ayse");
  });
});

describe("looksLikeSvg", () => {
  const bytes = (text: string) => new TextEncoder().encode(text).buffer;

  it.each([
    ["a bare <svg>", '<svg xmlns="http://www.w3.org/2000/svg"/>'],
    ["an XML declaration", '<?xml version="1.0"?>\n<svg viewBox="0 0 1 1">'],
    [
      "an Illustrator header with comment, doctype and entities",
      '\uFEFF<?xml version="1.0" encoding="utf-8"?>\n<!-- Generator: Adobe Illustrator 24 -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [\n<!ENTITY ns_flows "http://ns.adobe.com/Flows/1.0/">\n]>\n<svg version="1.1">',
    ],
  ])("accepts %s", (_, text) => {
    expect(looksLikeSvg(bytes(text))).toBe(true);
  });

  it.each([
    ["HTML", "<html><svg></svg></html>"],
    ["an <svg> after other content", "hello <svg>"],
    ["a tag that only starts with svg", "<svgfoo>"],
    ["empty text", ""],
  ])("refuses %s", (_, text) => {
    expect(looksLikeSvg(bytes(text))).toBe(false);
  });
});
