import { FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * A file picker that keeps the chosen file in form state. A file input can't
 * show its value again after a remount, so the name and size are shown here.
 */
export function FileField({
  id,
  file,
  accept,
  onPick,
  onBlur,
  invalid,
  describedBy,
}: {
  id: string;
  file: File | null;
  accept: string;
  onPick: (file: File | null) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      {file ? (
        <span className="min-w-0 flex-1 truncate text-sm">
          {file.name}{" "}
          <span className="text-muted-foreground">
            ({formatSize(file.size)})
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 text-sm text-muted-foreground">
          Dosya seçilmedi
        </span>
      )}
      <label
        className={`${buttonVariants({ variant: "outline", size: "sm" })} focus-within:ring-3 focus-within:ring-ring/50`}
      >
        {file ? "Değiştir" : "Dosya Seç"}
        <input
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onBlur={onBlur}
          onChange={(event) => {
            const picked = event.target.files?.[0];
            // cancelling the dialog keeps the file chosen before
            if (picked) onPick(picked);
            event.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
