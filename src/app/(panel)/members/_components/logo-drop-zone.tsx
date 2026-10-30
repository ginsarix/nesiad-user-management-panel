import { ImageIcon } from "lucide-react";
import Image from "next/image";
import { type DragEvent, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Blob URL for previewing a picked file; revoked when it changes */
function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return url;
}

const hasFiles = (event: DragEvent) =>
  event.dataTransfer.types.includes("Files");

/**
 * Logo preview with a file button that also takes a dropped file.
 * Shows `file` when one is picked, else `currentUrl`; "Kaldır" appears
 * only with `onRemove` and something to preview.
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
  const pickedUrl = useObjectUrl(file);
  const previewUrl = pickedUrl ?? currentUrl;
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
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="Logo önizleme"
            width={56}
            height={56}
            unoptimized
            className="size-full object-contain"
          />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex gap-1">
          <label className={buttonVariants({ variant: "outline", size: "sm" })}>
            {previewUrl ? "Değiştir" : "Logo seç"}
            <input
              id={id}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                onPick(event.target.files?.[0] ?? null);
                // allow picking the same file again after removing it
                event.target.value = "";
              }}
            />
          </label>
          {previewUrl && onRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              Kaldır
            </Button>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {dragging
            ? "Bırakın"
            : "veya buraya sürükleyin · resim, en fazla 5 MB"}
        </span>
      </div>
    </div>
  );
}
