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
