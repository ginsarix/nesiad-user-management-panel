import Image from "next/image";
import { seniorityBadge } from "@/lib/dates";
import { logoUrl } from "@/lib/fetches/member";
import { initialsTr } from "@/lib/turkish";
import { cn } from "@/lib/utils";

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

/** A company's square logo, or its initials when there is none */
export function CompanyLogo({
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
