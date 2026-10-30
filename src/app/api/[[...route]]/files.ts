import { extname } from "node:path";
import { Hono } from "hono";
import { readStoredFile } from "@/lib/file-storage";

// Uploads are validated as images (by content) before they are stored
const contentTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".webp": "image/webp",
};

// TODO: require a logged-in panel user once auth is in place
export const filesRoute = new Hono().get("/:filename", async (c) => {
  const filename = c.req.param("filename");
  const file = await readStoredFile(filename);

  if (!file) return c.json({ error: "Dosya bulunamadı" }, 404);

  return c.body(new Uint8Array(file), 200, {
    "Content-Type":
      contentTypes[extname(filename).toLowerCase()] ??
      "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    // stored names are unique, so a file never changes
    "Cache-Control": "private, max-age=31536000, immutable",
  });
});
