import Link from "next/link";
import type { ReactNode } from "react";

export type BarListItem = {
  key: string | number;
  label: ReactNode;
  /** a link to the records behind the row */
  href?: string;
  /** what the bar's length is drawn from */
  value: number;
  /** how the value is written; the plain number when absent */
  display?: ReactNode;
  /** extra text under the label, e.g. "3 tahsilat" */
  note?: ReactNode;
};

/** A ranked list with a thin bar per row, scaled to the largest value */
export function BarList({
  items,
  empty,
}: {
  items: BarListItem[];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">{empty}</p>;
  }
  const max = Math.max(...items.map((item) => item.value), 0);

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {item.href ? (
                <Link href={item.href} className="text-primary hover:underline">
                  {item.label}
                </Link>
              ) : (
                item.label
              )}
              {item.note && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {item.note}
                </span>
              )}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {item.display ?? item.value}
            </span>
          </div>
          <div className="h-2 rounded-r-full bg-muted">
            <div
              className="h-full rounded-r-full bg-primary"
              style={{
                width: max > 0 ? `${(item.value / max) * 100}%` : "0%",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
