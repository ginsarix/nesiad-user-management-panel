import Image from "next/image";
import Link from "next/link";
import { orDash, PassiveTag } from "@/components/info-fields";
import { seniorityBadge } from "@/lib/dates";
import { logoUrl, type MemberListItem } from "@/lib/fetches/member";
import { initialsTr } from "@/lib/turkish";
import { cn } from "@/lib/utils";

type MemberRepresentative = MemberListItem["representatives"][number];

/** "5 Yıl", "10 Yıl"… from Üye Giriş Tarihi; nothing under 5 years */
export function SeniorityBadge({
  memberLoginDate,
}: {
  memberLoginDate: string | null;
}) {
  const badge = seniorityBadge(memberLoginDate);
  if (!badge) return null;

  return (
    <span
      title="Kıdem, üye giriş tarihinden hesaplanır"
      // NESIAD gold; text darkened for contrast on the light badge
      className="inline-flex shrink-0 items-center rounded-full border border-sidebar-primary/50 bg-sidebar-primary/15 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-[#6f5618]"
    >
      {badge}
    </span>
  );
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
          className="flex items-center justify-between gap-6 py-1.5 first:pt-0 last:pb-0"
        >
          <span className="flex flex-wrap items-center gap-x-2">
            <Link
              href={`/representatives/${representative.id}`}
              // rows of the members list toggle on click
              onClick={(event) => event.stopPropagation()}
              className="text-primary hover:underline"
            >
              {representative.name}
            </Link>
            {representative.role && (
              <span className="text-muted-foreground">
                {representative.role}
              </span>
            )}
            {!representative.active && <PassiveTag />}
          </span>
          <span className="text-muted-foreground">
            {orDash(representative.phone)}
          </span>
        </li>
      ))}
    </ul>
  );
}
