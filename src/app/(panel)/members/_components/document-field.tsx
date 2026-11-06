import { FileText } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { logoUrl } from "@/lib/fetches/member";

/**
 * A document upload: shows the stored file with Görüntüle and takes a
 * replacement. Leaving it untouched keeps the stored file.
 */
export function DocumentField({
  id,
  file,
  currentFilename,
  onPick,
}: {
  id: string;
  file: File | null;
  currentFilename: string | null;
  onPick: (file: File | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        {file ? (
          <span className="min-w-0 truncate">{file.name}</span>
        ) : currentFilename ? (
          <a
            href={logoUrl(currentFilename)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Görüntüle
          </a>
        ) : (
          <span className="text-muted-foreground">Belge yok</span>
        )}
      </div>
      <div className="flex gap-1">
        <label className={buttonVariants({ variant: "outline", size: "sm" })}>
          {file || currentFilename ? "Değiştir" : "Dosya seç"}
          <input
            id={id}
            type="file"
            accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
            className="sr-only"
            onChange={(event) => {
              onPick(event.target.files?.[0] ?? null);
              // allow picking the same file again after clearing it
              event.target.value = "";
            }}
          />
        </label>
        {file && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onPick(null)}
          >
            Vazgeç
          </Button>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        PDF, PNG veya JPG, en fazla 5 MB
      </span>
    </div>
  );
}
