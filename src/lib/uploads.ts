import { fileTypeFromBuffer } from "file-type";
import { createFile } from "./file-storage";

export const LOGO_MIME_TYPES = ["image/png", "image/jpeg"] as const;
export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

/**
 * Stores an upload after checking its actual contents (not its name or
 * declared type) are one of `allowed`. The stored name starts with `baseName`
 * and never contains the uploader's filename. Resolves to null when the
 * content isn't an allowed type.
 */
export async function storeUpload(
  file: File,
  allowed: readonly string[],
  baseName: "logo" | "document",
): Promise<string | null> {
  const buffer = await file.arrayBuffer();
  const fileType = await fileTypeFromBuffer(buffer);
  if (!fileType || !allowed.includes(fileType.mime)) return null;

  return await createFile({
    buffer: Buffer.from(buffer),
    filename: baseName,
    ext: fileType.ext,
  });
}

/**
 * True when `buffer` reads as an SVG document: after an optional XML
 * declaration, comments and doctype, its first tag is <svg>. Only a sniff of
 * the start: the server never parses or renders an SVG.
 */
export function looksLikeSvg(buffer: ArrayBuffer) {
  const start = new TextDecoder()
    .decode(buffer.slice(0, 16 * 1024))
    .replace(/^\uFEFF/, "");
  return /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*|<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>\s*)*<svg[\s>/]/i.test(
    start,
  );
}

/** Extension of a stored logo original by its contents; null for anything else */
async function logoOriginalExt(buffer: ArrayBuffer) {
  const fileType = await fileTypeFromBuffer(buffer);
  if (fileType?.mime === "application/pdf") return "pdf";
  // file-type knows SVG only as XML, when it starts with an XML declaration
  const textLike = !fileType || fileType.mime === "application/xml";
  return textLike && looksLikeSvg(buffer) ? "svg" : null;
}

/**
 * Stores the file a PDF or SVG logo was drawn from, after checking its
 * contents are one. Resolves to null when they aren't.
 */
export async function storeLogoOriginal(file: File): Promise<string | null> {
  const buffer = await file.arrayBuffer();
  const ext = await logoOriginalExt(buffer);
  if (!ext) return null;

  return await createFile({
    buffer: Buffer.from(buffer),
    filename: "logo",
    ext,
  });
}
