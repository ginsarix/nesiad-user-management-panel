/**
 * Yetkili photos, shrunk in the uploader's browser before they go anywhere:
 * at most 800px on the longest side, as a JPEG on white. Drawing it again
 * applies the camera's rotation and leaves the photo's metadata (including
 * GPS location) behind.
 */

/** Longest side of a stored photo */
const MAX_SIDE = 800;
const JPEG_QUALITY = 0.85;

const UNREADABLE_PHOTO = "Fotoğraf açılamadı. JPG veya PNG seçin.";

/** A picked file the browser can't use as a photo; the message is for the user */
export class PhotoFileError extends Error {
  name = "PhotoFileError";
}

/** Size that fits within `max` on both sides, keeping the shape; never larger */
export function fitWithin(width: number, height: number, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The picked image as the JPEG that is uploaded; throws PhotoFileError */
export async function resizePhoto(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoFileError(UNREADABLE_PHOTO);
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoFileError(UNREADABLE_PHOTO);

    // JPEG has no transparency: a transparent PNG would turn black
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new PhotoFileError(UNREADABLE_PHOTO);
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
