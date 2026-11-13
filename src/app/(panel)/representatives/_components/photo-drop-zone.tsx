import { Loader2, UserRound } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { FileDropArea } from "@/components/file-drop-area";
import { Button, buttonVariants } from "@/components/ui/button";

/** Blob URL for previewing a picked photo, revoked when it changes */
function usePreviewUrl(file: File | null) {
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

/**
 * Round photo preview with a file button that also takes a dropped file.
 * Shows `file` when one is picked, else `currentUrl`; "Kaldır" appears only
 * with `onRemove` and a photo to remove. `busy` while a pick is being shrunk.
 */
export function PhotoDropZone({
  id,
  file,
  currentUrl,
  busy = false,
  onPick,
  onRemove,
}: {
  id: string;
  file: File | null;
  currentUrl: string | null;
  busy?: boolean;
  onPick: (file: File | null) => void;
  onRemove?: () => void;
}) {
  const pickedUrl = usePreviewUrl(file);
  const previewUrl = file ? pickedUrl : currentUrl;
  const hasPhoto = !!file || !!currentUrl;

  return (
    <FileDropArea onDropFile={onPick}>
      {(dragging) => (
        <>
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
            {busy ? (
              <Loader2
                aria-label="Fotoğraf hazırlanıyor"
                className="size-5 animate-spin text-muted-foreground"
              />
            ) : previewUrl ? (
              <Image
                src={previewUrl}
                alt="Fotoğraf önizleme"
                width={56}
                height={56}
                unoptimized
                className="size-full object-cover"
              />
            ) : (
              <UserRound className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex gap-1">
              <label
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {hasPhoto ? "Değiştir" : "Fotoğraf seç"}
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
              {hasPhoto && onRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onRemove}
                >
                  Kaldır
                </Button>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {dragging ? "Bırakın" : "veya buraya sürükleyin · JPG veya PNG"}
            </span>
          </div>
        </>
      )}
    </FileDropArea>
  );
}
