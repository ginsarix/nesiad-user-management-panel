import Image from "next/image";
import { logoUrl, type MemberListItem } from "@/lib/fetches/member";
import { initialsTr } from "@/lib/turkish";
import { cn } from "@/lib/utils";

type MemberRepresentative = MemberListItem["representatives"][number];

/** Free-text fields can be null or blank; show a dash instead */
export function orDash(value: string | null | undefined) {
  return value?.trim() ? value : "—";
}

/** The member's logo, or their initials when there is none */
export function MemberAvatar({
  title,
  logo,
  size = "sm",
}: {
  title: string;
  logo?: string | null;
  size?: "sm" | "lg";
}) {
  const sizeClass = size === "sm" ? "size-6 text-[10px]" : "size-12 text-base";

  if (logo) {
    return (
      <Image
        src={logoUrl(logo)}
        alt=""
        width={size === "sm" ? 24 : 48}
        height={size === "sm" ? 24 : 48}
        // uploads are served by our API, not part of the image optimizer
        unoptimized
        className={cn(
          "shrink-0 rounded-md border bg-white object-contain",
          sizeClass,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-secondary font-bold text-secondary-foreground",
        sizeClass,
      )}
    >
      {initialsTr(title)}
    </span>
  );
}

export function MemberFields({
  fields,
}: {
  fields: { label: string; value: string | null }[];
}) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {fields.map((field) => (
        <div key={field.label} className="contents">
          <dt className="text-muted-foreground">{field.label}</dt>
          <dd>{orDash(field.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RepresentativeList({
  representatives,
}: {
  representatives: MemberRepresentative[];
}) {
  if (representatives.length === 0) {
    return <p className="text-sm text-muted-foreground">Yetkili eklenmemiş.</p>;
  }

  return (
    <ul className="divide-y text-sm">
      {representatives.map((representative) => (
        <li
          key={representative.id}
          className="flex justify-between gap-6 py-1.5 first:pt-0 last:pb-0"
        >
          <span>{representative.name}</span>
          <span className="text-muted-foreground">
            {orDash(representative.dateOfBirth)}
          </span>
        </li>
      ))}
    </ul>
  );
}
