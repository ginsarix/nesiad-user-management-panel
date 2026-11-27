"use client";

import { FileText } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  logoUrl,
  type MemberCompany,
  type MemberDetails,
} from "@/lib/fetches/member";
import { logoOriginalKind } from "@/lib/logo-original";
import { cn } from "@/lib/utils";
import { CompanyLogo } from "../_components/member-info";
import { ChangeLogoButton } from "./change-logo-button";
import { DeleteLogoButton } from "./delete-logo-button";

/**
 * The member's company logo; a logo opens full size in a dialog when
 * clicked, where it can be changed or removed (the member's PATCH changes
 * its company's logo). A logo uploaded as PDF or SVG shows the image drawn
 * from it and links the uploaded file. Without one, a logo is added through
 * Düzenle.
 */
export function MemberLogo({
  member,
  company,
}: {
  member: MemberDetails;
  company: MemberCompany;
}) {
  const [open, setOpen] = useState(false);
  const { title, logo } = company;

  if (!logo) return <CompanyLogo title={title} size="lg" />;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="Logoyu büyüt"
        render={
          <button
            type="button"
            className="shrink-0 cursor-zoom-in rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <CompanyLogo title={title} logo={logo} size="lg" />
      </DialogTrigger>
      <DialogContent className="w-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{title}</DialogTitle>
        </DialogHeader>
        <Image
          src={logoUrl(logo)}
          alt={`${title} logosu`}
          // real size comes from the file; CSS only caps it to the viewport
          width={0}
          height={0}
          unoptimized
          className="mx-auto h-auto max-h-[65vh] w-auto max-w-full rounded-md border bg-white object-contain"
        />
        <DialogFooter>
          {company.logoOriginal && (
            <a
              href={logoUrl(company.logoOriginal)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "sm:mr-auto",
              )}
            >
              <FileText />
              Orijinal {logoOriginalKind(company.logoOriginal)}
            </a>
          )}
          <DeleteLogoButton
            member={member}
            company={company}
            onDeleted={() => setOpen(false)}
          />
          <ChangeLogoButton member={member} company={{ ...company, logo }} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
