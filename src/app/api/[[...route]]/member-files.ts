import { fileTypeFromBuffer } from "file-type";
import { createMiddleware } from "hono/factory";
import { createFile, deleteFiles } from "@/lib/file-storage";
import { logoOriginalKind } from "@/lib/logo-original";
import {
  DOCUMENT_MIME_TYPES,
  PHOTO_MIME_TYPES,
  storeLogoOriginal,
  storeUpload,
} from "@/lib/uploads";
import type { AppEnv } from "./env";

/**
 * Files on the member form: the member's photo and Kimlik Belgesi, and their
 * company's logo and Faaliyet Belgesi. Each is stored before the database
 * change and deleted again when that fails; replaced files are deleted only
 * after it commits.
 */

export const NOT_A_PHOTO_ERROR = "Sadece JPG veya PNG fotoğraflar kabul edilir";
export const NOT_A_LOGO_ERROR =
  "Sadece resim, PDF veya SVG dosyaları kabul edilir";
// the panel always sends the PNG drawn from a PDF or SVG with it
export const LOGO_ORIGINAL_ALONE_ERROR =
  "Logonun asıl dosyası, ondan çizilen resimle gönderilmeli";
export const NOT_A_DOCUMENT_ERROR =
  "Sadece PDF, PNG veya JPG dosyaları kabul edilir";

/**
 * The form validator reads a non-multipart body as `{}`, which an update
 * accepts: a page loaded before a switch from JSON would see its save
 * succeed with nothing changed. Refuse it so the user reloads instead.
 */
export const requireMultipart = createMiddleware<AppEnv>(async (c, next) => {
  const type = c.req.header("Content-Type") ?? "";
  if (!type.startsWith("multipart/form-data")) {
    return c.json(
      { error: "Panel güncellendi. Sayfayı yenileyip tekrar deneyin." },
      415,
    );
  }
  await next();
});

/** Stores an uploaded photo; null when its contents aren't JPEG or PNG */
export function storePhoto(photo: File) {
  return storeUpload(photo, PHOTO_MIME_TYPES, "photo");
}

/** How a photo shows in create and delete entries; never the filename */
export const photoAuditValue = (photo: string | null) => (photo ? "Var" : "—");

/** A replaced or removed photo as an audit change's two sides */
export const photoChangeSides = (before: string | null, after: string | null) =>
  [before && "Eski fotoğraf", after && "Yeni fotoğraf"] as const;

/**
 * Stores a staff-uploaded logo after checking its actual contents are an
 * image. Resolves to null when the file is not an image.
 */
async function saveLogo(logo: File) {
  const buffer = await logo.arrayBuffer();
  const fileType = await fileTypeFromBuffer(buffer);
  if (!fileType?.mime.startsWith("image/")) return null;

  return await createFile({
    buffer: Buffer.from(buffer),
    filename: logo.name,
    ext: fileType.ext,
  });
}

export type StoredLogo = { logo: string; logoOriginal: string | null };

/**
 * Stores a new logo and, for a PDF or SVG logo, the file it was drawn from. Resolves
 * to null, with nothing left stored, when either isn't what it should be.
 */
export async function saveLogoFiles(
  logo: File,
  logoOriginal: File | undefined,
): Promise<StoredLogo | null> {
  const image = await saveLogo(logo);
  if (!image) return null;
  if (!logoOriginal) return { logo: image, logoOriginal: null };

  const original = await storeLogoOriginal(logoOriginal);
  if (!original) {
    await deleteFiles([image]);
    return null;
  }
  return { logo: image, logoOriginal: original };
}

/** A logo as one side of an audit change: "Eski logo (PDF)", "Yeni logo" */
export function logoChangeSide(
  side: "Eski" | "Yeni",
  logo: { logo: string | null; logoOriginal: string | null } | null,
) {
  if (!logo?.logo) return null;
  return logo.logoOriginal
    ? `${side} logo (${logoOriginalKind(logo.logoOriginal)})`
    : `${side} logo`;
}

export type DocumentField = "identityDocument" | "activityDocument";
export const DOCUMENT_FIELDS: DocumentField[] = [
  "identityDocument",
  "activityDocument",
];

/**
 * Stores the uploaded documents. When one isn't a PDF/PNG/JPG, the ones
 * already stored are deleted again and `rejected` is true.
 */
export async function storeDocuments(
  files: Partial<Record<DocumentField, File>>,
) {
  const stored: Partial<Record<DocumentField, string>> = {};
  for (const field of DOCUMENT_FIELDS) {
    const file = files[field];
    if (!file) continue;
    const name = await storeUpload(file, DOCUMENT_MIME_TYPES, "document");
    if (!name) {
      await deleteFiles(Object.values(stored));
      return { stored: {}, rejected: true };
    }
    stored[field] = name;
  }
  return { stored, rejected: false };
}

/** What the member form uploaded, once stored */
export type StoredFormFiles = {
  photo?: string;
  logo?: StoredLogo;
  identityDocument?: string;
  activityDocument?: string;
};

export function storedFileNames(files: StoredFormFiles) {
  return [
    files.photo,
    files.logo?.logo,
    files.logo?.logoOriginal,
    files.identityDocument,
    files.activityDocument,
  ];
}

/**
 * Stores every file the member form sent after checking its contents. On
 * the first one that isn't what it should be, the ones already stored are
 * deleted again and the refusal (415) comes back instead.
 */
export async function storeFormFiles(files: {
  photo?: File;
  logo?: File;
  logoOriginal?: File;
  identityDocument?: File;
  activityDocument?: File;
}): Promise<{ stored: StoredFormFiles } | { error: string }> {
  const stored: StoredFormFiles = {};
  if (files.photo) {
    const photo = await storePhoto(files.photo);
    if (!photo) return { error: NOT_A_PHOTO_ERROR };
    stored.photo = photo;
  }
  if (files.logo) {
    const logo = await saveLogoFiles(files.logo, files.logoOriginal);
    if (!logo) {
      await deleteFiles(storedFileNames(stored));
      return { error: NOT_A_LOGO_ERROR };
    }
    stored.logo = logo;
  }
  const documents = await storeDocuments({
    identityDocument: files.identityDocument,
    activityDocument: files.activityDocument,
  });
  if (documents.rejected) {
    await deleteFiles(storedFileNames(stored));
    return { error: NOT_A_DOCUMENT_ERROR };
  }
  return { stored: { ...stored, ...documents.stored } };
}
