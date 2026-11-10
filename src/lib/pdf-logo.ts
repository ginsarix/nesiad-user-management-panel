/**
 * PDF logos, drawn in the uploader's browser. The server never parses a PDF:
 * it stores the PNG drawn here as the logo shown everywhere, and the PDF next
 * to it for anyone who needs the original. pdf.js loads only when a PDF is
 * picked.
 */

import type { PageViewport, PDFPageProxy } from "pdfjs-dist";

/** Longest side of the whole page when looking for where the logo is */
const FIND_SIZE = 1200;
/** Longest side of the PNG that is stored: the logo alone, drawn again */
const OUTPUT_SIZE = 1200;
/** Room left around the trimmed logo, as a share of its longest side */
const PADDING = 0.03;

const UNREADABLE_PDF =
  "PDF okunamadı. Başka bir dosya deneyin veya PNG/JPG yükleyin.";
const LOCKED_PDF = "Şifreli PDF'ler kabul edilmez. Şifresiz bir dosya seçin.";
const OFFLINE =
  "PDF açılamadı. Bağlantınızı kontrol edip dosyayı tekrar seçin.";
const EMPTY_PDF = "PDF'nin ilk sayfası boş. Logonun olduğu bir dosya seçin.";

/** A PDF that can't be used as a logo; the message is for the user */
export class PdfLogoError extends Error {
  name = "PdfLogoError";
}

export function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

type PdfJs = typeof import("pdfjs-dist");
let pdfjs: Promise<PdfJs> | null = null;

function loadPdfJs() {
  pdfjs ??= import("pdfjs-dist").then((lib) => {
    lib.GlobalWorkerOptions.workerPort = new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" },
    );
    return lib;
  });
  // a failed download (e.g. offline) can be retried with the next pick
  pdfjs.catch(() => {
    pdfjs = null;
  });
  return pdfjs;
}

type Box = { x: number; y: number; width: number; height: number };

/**
 * The smallest box holding the logo in RGBA pixel data: pixels that are
 * neither transparent nor near-white, so the empty page around a logo goes
 * whether it is transparent or white. A logo that is only white on
 * transparent falls back to its non-transparent pixels. Null when nothing
 * is drawn at all.
 */
export function contentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Box | null {
  const ink = scan(data, width, height, (r, g, b, a) => {
    return a > 16 && !(r > 245 && g > 245 && b > 245);
  });
  return ink ?? scan(data, width, height, (_r, _g, _b, a) => a > 16);
}

function scan(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  isContent: (r: number, g: number, b: number, a: number) => boolean,
): Box | null {
  let top = height;
  let left = width;
  let bottom = -1;
  let right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!isContent(data[i], data[i + 1], data[i + 2], data[i + 3])) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) return null;
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** `box` grown by PADDING on every side, kept inside the canvas */
function padded(box: Box, width: number, height: number): Box {
  const pad = Math.round(Math.max(box.width, box.height) * PADDING);
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  return {
    x,
    y,
    width: Math.min(width, box.x + box.width + pad) - x,
    height: Math.min(height, box.y + box.height + pad) - y,
  };
}

function toPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new PdfLogoError(UNREADABLE_PDF)),
      "image/png",
    );
  });
}

/**
 * Draws `page` on a new transparent canvas, the viewport's size unless `size`
 * crops it, and returns the canvas's context.
 */
async function drawPage(
  page: PDFPageProxy,
  viewport: PageViewport,
  size: { width: number; height: number } = viewport,
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(size.width));
  canvas.height = Math.max(1, Math.round(size.height));
  // a context of our own: given only the canvas, pdf.js draws through one
  // without alpha, which turns the transparent background black
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new PdfLogoError(UNREADABLE_PDF);
  await page.render({
    canvas: null,
    canvasContext: context,
    viewport,
    // transparent, so a logo without a background keeps having none
    background: "rgba(0,0,0,0)",
  }).promise;
  return context;
}

async function drawPdfLogo(pdf: File): Promise<File> {
  const lib = await loadPdfJs().catch(() => {
    throw new PdfLogoError(OFFLINE);
  });
  try {
    return await drawFirstPage(lib, pdf);
  } catch (error) {
    throw error instanceof PdfLogoError
      ? error
      : new PdfLogoError(UNREADABLE_PDF);
  }
}

async function drawFirstPage(lib: PdfJs, pdf: File): Promise<File> {
  const task = lib.getDocument({
    data: new Uint8Array(await pdf.arrayBuffer()),
    // the page is read back from the canvas, so it has to be drawn right here
    disableWorkerRendering: true,
  });
  try {
    const pdfDocument = await task.promise.catch((error: unknown) => {
      const locked = (error as { name?: string })?.name === "PasswordException";
      throw new PdfLogoError(locked ? LOCKED_PDF : UNREADABLE_PDF);
    });
    const page = await pdfDocument.getPage(1);

    // first the whole page, small, to find the logo on it
    const unscaled = page.getViewport({ scale: 1 });
    const findScale = FIND_SIZE / Math.max(unscaled.width, unscaled.height);
    const whole = await drawPage(page, page.getViewport({ scale: findScale }));
    const { width, height } = whole.canvas;
    const bounds = contentBounds(
      whole.getImageData(0, 0, width, height).data,
      width,
      height,
    );
    if (!bounds) throw new PdfLogoError(EMPTY_PDF);
    const box = padded(bounds, width, height);

    // then only the logo, at full size: a small logo on a big page stays sharp
    const zoom = OUTPUT_SIZE / Math.max(box.width, box.height);
    const logo = await drawPage(
      page,
      page.getViewport({
        scale: findScale * zoom,
        offsetX: -box.x * zoom,
        offsetY: -box.y * zoom,
      }),
      { width: box.width * zoom, height: box.height * zoom },
    );

    const name = pdf.name.replace(/\.pdf$/i, "") || "logo";
    return new File([await toPngBlob(logo.canvas)], `${name}.png`, {
      type: "image/png",
    });
  } finally {
    void task.destroy();
  }
}

const drawn = new WeakMap<File, Promise<File>>();

/**
 * The PNG of a PDF logo's first page, trimmed to the logo. Drawn once per
 * picked file: the preview, the check on pick and the upload share it.
 * Rejects with a message to show the user.
 */
export function pdfLogoImage(pdf: File): Promise<File> {
  let image = drawn.get(pdf);
  if (!image) {
    image = drawPdfLogo(pdf);
    drawn.set(pdf, image);
    image.catch(() => drawn.delete(pdf));
  }
  return image;
}

/** Null when `file` is fine as a logo, else the message to show */
export async function pdfLogoError(file: File | null) {
  if (!file || !isPdf(file)) return null;
  try {
    await pdfLogoImage(file);
    return null;
  } catch (error) {
    return error instanceof PdfLogoError ? error.message : UNREADABLE_PDF;
  }
}

/** A logo ready to send: a PDF logo goes as the PNG drawn from it plus the PDF */
export type LogoUpload = { logo: File; logoPdf?: File };

export async function toLogoUpload(file: File): Promise<LogoUpload> {
  if (!isPdf(file)) return { logo: file };
  return { logo: await pdfLogoImage(file), logoPdf: file };
}
