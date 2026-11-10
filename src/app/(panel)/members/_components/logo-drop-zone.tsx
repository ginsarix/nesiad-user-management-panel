import { FileText, ImageIcon, Loader2 } from "lucide-react";
import Image from "next/image";
import { type DragEvent, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { isPdf, pdfLogoImage } from "@/lib/pdf-logo";
import { cn } from "@/lib/utils";

/**
 * Blob URL for previewing a picked file, revoked when it changes. A PDF shows
 * the image that will be uploaded for it; `drawing` is true until it's ready,
 * and the URL stays null when the PDF can't be drawn.
 */
function usePreviewUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    setUrl(null);
    setDrawing(false);
    if (!file) return;

    let objectUrl: string | null = null;
    let current = true;
    const show = (image: File) => {
      if (!current) return;
      objectUrl = URL.createObjectURL(image);
      setUrl(objectUrl);
    };

    if (isPdf(file)) {
      setDrawing(true);
      pdfLogoImage(file)
        // the form shows why a PDF can't be used
        .then(show, () => {})
        .finally(() => current && setDrawing(false));
    } else {
      show(file);
    }

    return () => {
      current = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return { url, drawing };
}

const hasFiles = (event: DragEvent) =>
  event.dataTransfer.types.includes("Files");

/**
 * Logo preview with a file button that also takes a dropped file.
 * Shows `file` when one is picked, else `currentUrl`; "Kaldır" appears
 * only with `onRemove` and a logo to remove.
 */
export function LogoDropZone({
  id,
  file,
  currentUrl,
  onPick,
  onRemove,
}: {
  id: string;
  file: File | null;
  currentUrl: string | null;
  onPick: (file: File | null) => void;
  onRemove?: () => void;
}) {
  const picked = usePreviewUrl(file);
  const previewUrl = file ? picked.url : currentUrl;
  const hasLogo = !!file || !!currentUrl;
  const [dragging, setDragging] = useState(false);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target only; the file input stays the keyboard path
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-dashed p-2 transition-colors",
        dragging && "border-primary bg-primary/5",
      )}
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        // required for the drop event to fire
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        // ignore leaving into a child element
        if (event.currentTarget.contains(event.relatedTarget as Node | null))
          return;
        setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        onPick(event.dataTransfer.files[0] ?? null);
      }}
    >
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
        {picked.drawing ? (
          <Loader2
            aria-label="PDF hazırlanıyor"
            className="size-5 animate-spin text-muted-foreground"
          />
        ) : previewUrl ? (
          <Image
            src={previewUrl}
            alt="Logo önizleme"
            width={56}
            height={56}
            unoptimized
            className="size-full object-contain"
          />
        ) : file ? (
          <FileText className="size-5 text-muted-foreground" />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex gap-1">
          <label className={buttonVariants({ variant: "outline", size: "sm" })}>
            {hasLogo ? "Değiştir" : "Logo seç"}
            <input
              id={id}
              type="file"
              accept="image/*,application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => {
                onPick(event.target.files?.[0] ?? null);
                // allow picking the same file again after removing it
                event.target.value = "";
              }}
            />
          </label>
          {hasLogo && onRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              Kaldır
            </Button>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {dragging
            ? "Bırakın"
            : "veya buraya sürükleyin · resim veya PDF, en fazla 5 MB"}
        </span>
      </div>
    </div>
  );
}
