"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  ORGANIZATION_INFO,
  organizationFromSlug,
  organizationHref,
} from "@/lib/organizations";

/** A missing group, or a page slug that isn't one of the four */
export default function OrganizationNotFound() {
  // /organization/<slug>/…: not-found pages get no params
  const organization = organizationFromSlug(usePathname().split("/")[2] ?? "");

  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-card p-10 text-center">
      <p className="font-medium">Kayıt bulunamadı</p>
      <p className="text-sm text-muted-foreground">
        Bu kayıt silinmiş ya da bağlantı hatalı olabilir.
      </p>
      <Link
        href={organization ? organizationHref(organization) : "/"}
        className={buttonVariants({ variant: "outline", className: "mt-4" })}
      >
        {organization
          ? ORGANIZATION_INFO[organization].backLabel
          : "Genel Bakış'a dön"}
      </Link>
    </div>
  );
}
