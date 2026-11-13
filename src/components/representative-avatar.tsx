import Image from "next/image";
import { logoUrl } from "@/lib/fetches/member";
import { initialsTr } from "@/lib/turkish";
import { cn } from "@/lib/utils";

/**
 * A yetkili's photo, or their initials without one. Always round, so people
 * read apart from the square member logos.
 */
export function RepresentativeAvatar({
  name,
  photo,
  size = "sm",
}: {
  name: string;
  photo?: string | null;
  size?: "sm" | "lg";
}) {
  const sizeClass = size === "sm" ? "size-7 text-[11px]" : "size-16 text-lg";

  if (photo) {
    return (
      <Image
        src={logoUrl(photo)}
        alt=""
        width={size === "sm" ? 28 : 64}
        height={size === "sm" ? 28 : 64}
        // uploads are served by our API, not part of the image optimizer
        unoptimized
        className={cn("shrink-0 rounded-full border object-cover", sizeClass)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground",
        sizeClass,
      )}
    >
      {initialsTr(name)}
    </span>
  );
}
