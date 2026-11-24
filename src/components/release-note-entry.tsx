import {
  matchRanges,
  RELEASE_NOTE_LABELS,
  type ReleaseNote,
  type ReleaseNoteType,
} from "@/lib/release-notes";
import { cn } from "@/lib/utils";

/** Muted tints that sit in the panel's palette */
export const RELEASE_NOTE_TAG_CLASSES: Record<ReleaseNoteType, string> = {
  new: "bg-[#e6f4ea] text-[#1e6b34]",
  improved: "bg-[#e8f3ff] text-[#0058ad]",
  changed: "bg-[#fdf3df] text-[#8a5a00]",
  fixed: "bg-[#efeaf8] text-[#5b3d99]",
  removed: "bg-[#fdecec] text-[#a12626]",
};

export function ReleaseNoteTag({ type }: { type: ReleaseNoteType }) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold sm:min-w-24",
        RELEASE_NOTE_TAG_CLASSES[type],
      )}
    >
      {RELEASE_NOTE_LABELS[type]}
    </span>
  );
}

/** A type tag and the sentence, with search matches highlighted */
export function ReleaseNoteEntry({
  note,
  query = "",
}: {
  note: ReleaseNote;
  query?: string;
}) {
  return (
    <li className="flex flex-col items-start gap-1 py-1 text-sm leading-relaxed sm:flex-row sm:gap-2.5">
      <span className="sm:pt-0.5">
        <ReleaseNoteTag type={note.type} />
      </span>
      <span>
        <Highlighted text={note.text} query={query} />
      </span>
    </li>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const ranges = matchRanges(text, query);
  if (ranges.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark key={start} className="rounded-sm bg-[#fff2b3] text-inherit">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}
