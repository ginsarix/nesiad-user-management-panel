/**
 * PDF and SVG logos, drawn in the uploader's browser. The server never parses
 * either: it stores the PNG drawn here as the logo shown everywhere, and the
 * uploaded file next to it for anyone who needs the original. pdf.js loads
 * only when a PDF is picked; an SVG is drawn by the browser through an <img>,
 * where its scripts never run and it loads nothing from outside.
 */

import type { PDFPageProxy } from "pdfjs-dist";

/** Longest side of the whole drawing when looking for where the logo is */
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
const UNREADABLE_SVG =
  "SVG okunamadı. Başka bir dosya deneyin veya PNG/JPG yükleyin.";
const SVG_WITHOUT_SIZE =
  "SVG'nin boyutu yok (viewBox veya genişlik/yükseklik). Başka bir dosya deneyin veya PNG/JPG yükleyin.";
const EMPTY_SVG = "SVG boş görünüyor. Logonun olduğu bir dosya seçin.";

const SVG_NS = "http://www.w3.org/2000/svg";

/** A PDF or SVG that can't be used as a logo; the message is for the user */
export class LogoFileError extends Error {
  name = "LogoFileError";
}

export function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function isSvg(file: File) {
  return file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
}

/** A file that is drawn to PNG before upload instead of sent as it is */
export function isDrawnLogo(file: File) {
  return isPdf(file) || isSvg(file);
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

const CSS_PX: Record<string, number> = {
  "": 1,
  px: 1,
  pt: 4 / 3,
  pc: 16,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
};

/** An absolute SVG length in px; null for percentages, em and the like */
function svgLength(value: string | null) {
  const match = value
    ?.trim()
    .match(/^(\d*\.?\d+(?:e[+-]?\d+)?)(px|pt|pc|mm|cm|in)?$/i);
  if (!match) return null;
  const px = Number(match[1]) * CSS_PX[(match[2] ?? "").toLowerCase()];
  return px > 0 ? px : null;
}

/**
 * The area an SVG draws, in its own units: its viewBox, or else its width and
 * height (in px, as an SVG without a viewBox draws in px). Null when it has
 * neither, as nothing then says how big it is.
 */
export function svgDrawingBox(attributes: {
  viewBox: string | null;
  width: string | null;
  height: string | null;
}): Box | null {
  const viewBox = attributes.viewBox
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    viewBox?.length === 4 &&
    viewBox.every(Number.isFinite) &&
    viewBox[2] > 0 &&
    viewBox[3] > 0
  ) {
    const [x, y, width, height] = viewBox;
    return { x, y, width, height };
  }
  const width = svgLength(attributes.width);
  const height = svgLength(attributes.height);
  return width && height ? { x: 0, y: 0, width, height } : null;
}

/**
 * Something to draw: its size in its own units, and how to draw it on a
 * canvas at `scale` pixels per unit, moved by `offsetX`/`offsetY` pixels.
 */
type Drawing = {
  width: number;
  height: number;
  draw(
    context: CanvasRenderingContext2D,
    scale: number,
    offsetX: number,
    offsetY: number,
  ): Promise<void>;
};

function pdfDrawing(page: PDFPageProxy): Drawing {
  const { width, height } = page.getViewport({ scale: 1 });
  return {
    width,
    height,
    async draw(context, scale, offsetX, offsetY) {
      await page.render({
        // our own context: given only the canvas, pdf.js draws through one
        // without alpha, which turns the transparent background black
        canvas: null,
        canvasContext: context,
        viewport: page.getViewport({ scale, offsetX, offsetY }),
        // transparent, so a logo without a background keeps having none
        background: "rgba(0,0,0,0)",
      }).promise;
    },
  };
}

async function svgDrawing(file: File): Promise<Drawing> {
  // parsing doesn't run anything: scripts in an SVG run only when it's shown
  const svg = new DOMParser().parseFromString(
    await file.text(),
    "image/svg+xml",
  );
  const root = svg.documentElement;
  if (
    svg.getElementsByTagName("parsererror").length > 0 ||
    root.localName !== "svg" ||
    root.namespaceURI !== SVG_NS
  ) {
    throw new LogoFileError(UNREADABLE_SVG);
  }
  const area = svgDrawingBox({
    viewBox: root.getAttribute("viewBox"),
    width: root.getAttribute("width"),
    height: root.getAttribute("height"),
  });
  if (!area) throw new LogoFileError(SVG_WITHOUT_SIZE);

  return {
    width: area.width,
    height: area.height,
    async draw(context, scale, offsetX, offsetY) {
      const { width, height } = context.canvas;
      // show exactly the part of the drawing that falls on the canvas, at the
      // canvas's size, so the browser draws it sharp at that size
      root.setAttribute(
        "viewBox",
        [
          area.x - offsetX / scale,
          area.y - offsetY / scale,
          width / scale,
          height / scale,
        ].join(" "),
      );
      root.setAttribute("width", String(width));
      root.setAttribute("height", String(height));
      root.setAttribute("preserveAspectRatio", "none");

      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(svg)], {
          type: "image/svg+xml",
        }),
      );
      try {
        // as an image, the SVG runs no scripts and loads nothing from outside
        const image = new Image(width, height);
        image.src = url;
        await image.decode();
        context.drawImage(image, 0, 0, width, height);
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  };
}

/** A transparent canvas of the given size, ready to be read back */
function newCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No 2D canvas");
  return context;
}

function toPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}

/**
 * The logo in `drawing` as a PNG: first the whole drawing, small, to find
 * where the logo is; then only the logo, at full size, so a small logo on a
 * big page stays sharp.
 */
async function drawLogo(drawing: Drawing, emptyMessage: string) {
  const findScale = FIND_SIZE / Math.max(drawing.width, drawing.height);
  const whole = newCanvas(
    drawing.width * findScale,
    drawing.height * findScale,
  );
  await drawing.draw(whole, findScale, 0, 0);
  const { width, height } = whole.canvas;
  const bounds = contentBounds(
    whole.getImageData(0, 0, width, height).data,
    width,
    height,
  );
  if (!bounds) throw new LogoFileError(emptyMessage);
  const box = padded(bounds, width, height);

  const zoom = OUTPUT_SIZE / Math.max(box.width, box.height);
  const logo = newCanvas(box.width * zoom, box.height * zoom);
  await drawing.draw(logo, findScale * zoom, -box.x * zoom, -box.y * zoom);
  return await toPngBlob(logo.canvas);
}

async function drawPdfLogo(pdf: File) {
  const lib = await loadPdfJs().catch(() => {
    throw new LogoFileError(OFFLINE);
  });
  const task = lib.getDocument({
    data: new Uint8Array(await pdf.arrayBuffer()),
    // the page is read back from the canvas, so it has to be drawn right here
    disableWorkerRendering: true,
  });
  try {
    const pdfDocument = await task.promise.catch((error: unknown) => {
      const locked = (error as { name?: string })?.name === "PasswordException";
      throw new LogoFileError(locked ? LOCKED_PDF : UNREADABLE_PDF);
    });
    return await drawLogo(pdfDrawing(await pdfDocument.getPage(1)), EMPTY_PDF);
  } finally {
    void task.destroy();
  }
}

async function drawSvgLogo(svg: File) {
  return await drawLogo(await svgDrawing(svg), EMPTY_SVG);
}

/** The picked PDF or SVG drawn as a PNG named after it */
async function drawLogoFile(file: File): Promise<File> {
  const svg = isSvg(file);
  try {
    const png = await (svg ? drawSvgLogo(file) : drawPdfLogo(file));
    const name = file.name.replace(/\.(pdf|svg)$/i, "") || "logo";
    return new File([png], `${name}.png`, { type: "image/png" });
  } catch (error) {
    if (error instanceof LogoFileError) throw error;
    throw new LogoFileError(svg ? UNREADABLE_SVG : UNREADABLE_PDF);
  }
}

const drawn = new WeakMap<File, Promise<File>>();

/**
 * The PNG of a PDF (first page) or SVG logo, trimmed to the logo. Drawn once
 * per picked file: the preview, the check on pick and the upload share it.
 * Rejects with a LogoFileError whose message is for the user.
 */
export function drawnLogoImage(file: File): Promise<File> {
  let image = drawn.get(file);
  if (!image) {
    image = drawLogoFile(file);
    drawn.set(file, image);
    image.catch(() => drawn.delete(file));
  }
  return image;
}

/** Null when `file` is fine as a logo, else the message to show */
export async function drawnLogoError(file: File | null) {
  if (!file || !isDrawnLogo(file)) return null;
  try {
    await drawnLogoImage(file);
    return null;
  } catch (error) {
    return error instanceof LogoFileError ? error.message : UNREADABLE_PDF;
  }
}

/** A logo ready to send: a PDF or SVG goes as the PNG drawn from it, plus itself */
export type LogoUpload = { logo: File; logoOriginal?: File };

export async function toLogoUpload(file: File): Promise<LogoUpload> {
  if (!isDrawnLogo(file)) return { logo: file };
  return { logo: await drawnLogoImage(file), logoOriginal: file };
}
