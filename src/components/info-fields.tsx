import { isoToDisplay } from "@/lib/dates";
import { MEMBER_STATUS_LABELS, type MemberStatus } from "@/lib/member-status";

/** Free-text fields can be null or blank; show a dash instead */
export function orDash(value: string | null | undefined) {
  return value?.trim() ? value : "—";
}

/** yyyy-aa-gg from the API shown as gg.aa.yyyy, or a dash */
export function formatDate(iso: string | null | undefined) {
  return orDash(isoToDisplay(iso));
}

export function PassiveTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Pasif
    </span>
  );
}

const STATUS_TAG_CLASSES: Record<MemberStatus, string | null> = {
  active: null,
  passive: "text-muted-foreground",
  candidate:
    "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  rejected: "border-destructive/50 bg-destructive/10 text-destructive",
};

/** A member's status next to their name; aktif is the norm, so it shows nothing */
export function StatusTag({ status }: { status: MemberStatus }) {
  const classes = STATUS_TAG_CLASSES[status];
  if (!classes) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      {MEMBER_STATUS_LABELS[status]}
    </span>
  );
}

/** Label/value rows of a details section; empty values show a dash */
export function InfoFields({
  fields,
}: {
  fields: { label: string; value: string | null }[];
}) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {fields.map((field) => (
        <div key={field.label} className="contents">
          <dt className="text-muted-foreground">{field.label}</dt>
          <dd className="whitespace-pre-line">{orDash(field.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
