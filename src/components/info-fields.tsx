import { isoToDisplay } from "@/lib/dates";

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
