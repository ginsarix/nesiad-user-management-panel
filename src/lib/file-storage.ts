import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import {
  join as pathJoin,
  parse as pathParse,
  resolve as pathResolve,
} from "node:path";
import { nanoid } from "nanoid";
import { env } from "@/lib/env";

// A relative path resolves against the working directory, which for the
// standalone production server is the deploy folder: production sets an
// absolute UPLOAD_DIR outside it. Unset (e.g. during a CI build) = "uploads".
// turbopackIgnore: a path from env would make the build trace (and copy into
// .next/standalone) the whole project
const uploadDir = pathResolve(
  /*turbopackIgnore: true*/ env.UPLOAD_DIR ?? "uploads",
);

export function getFilePath(filename: string): string {
  return pathJoin(uploadDir, filename);
}

interface CreateFileParams {
  file?: File;
  filename?: string;

  ext: string;

  buffer?: Buffer;
}

export async function createFile({
  file,
  filename,
  ext,
  buffer,
}: CreateFileParams) {
  await mkdir(uploadDir, { recursive: true });

  const fileAndFilenameFalsy = !file && !filename;
  const fileAndBufferFalsy = !file && !buffer;
  const filenameAndBufferFalsy = !filename && !buffer;

  if (fileAndFilenameFalsy || fileAndBufferFalsy || filenameAndBufferFalsy)
    throw new Error("Insufficient params to createFile");

  // biome-ignore lint/style/noNonNullAssertion: the check forces either of these defined at runtime
  const _filename = (file?.name ?? filename)!;

  const baseName = pathParse(_filename).name; // remove ext
  const safeName =
    baseName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "") || "file";

  const uniqueName = `${safeName}_${nanoid(8)}.${ext}`;

  const filePath = getFilePath(uniqueName);

  // biome-ignore lint/style/noNonNullAssertion: the check forces either of these defined at runtime
  const _buffer = (file ? Buffer.from(await file.arrayBuffer()) : buffer)!;

  await writeFile(filePath, _buffer);

  return uniqueName;
}

/** Names createFile can produce: no path separators, no leading dot */
export function isSafeFilename(filename: string) {
  return /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(filename);
}

function isNotFound(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Resolves to null when the file does not exist */
export async function readStoredFile(filename: string) {
  if (!isSafeFilename(filename)) return null;

  try {
    return await readFile(getFilePath(filename));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Deleting a file that is already gone is not an error */
export async function deleteFile(filename: string) {
  if (!isSafeFilename(filename)) return;

  try {
    await unlink(getFilePath(filename));
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}
