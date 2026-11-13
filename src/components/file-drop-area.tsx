import { type DragEvent, type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

const hasFiles = (event: DragEvent) =>
  event.dataTransfer.types.includes("Files");

/**
 * A dashed box that takes a dropped file. `children` gets whether a file is
 * being dragged over it; the file input inside stays the keyboard path.
 */
export function FileDropArea({
  onDropFile,
  className,
  children,
}: {
  onDropFile: (file: File | null) => void;
  className?: string;
  children: (dragging: boolean) => ReactNode;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target only; the file input stays the keyboard path
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-dashed p-2 transition-colors",
        dragging && "border-primary bg-primary/5",
        className,
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
        onDropFile(event.dataTransfer.files[0] ?? null);
      }}
    >
      {children(dragging)}
    </div>
  );
}
