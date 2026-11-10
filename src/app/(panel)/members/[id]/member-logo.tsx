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
import { logoUrl, type MemberDetails } from "@/lib/fetches/member";
import { logoOriginalKind } from "@/lib/logo-original";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "../_components/member-info";
import { ChangeLogoButton } from "./change-logo-button";
import { DeleteLogoButton } from "./delete-logo-button";

/**
 * The member's avatar; a logo opens full size in a dialog when clicked. A
 * logo uploaded as PDF or SVG shows the image drawn from it and links the
 * uploaded file.
 */
export function MemberLogo({ member }: { member: MemberDetails }) {
  const [open, setOpen] = useState(false);
  const { title, logo } = member;

  if (!logo) return <MemberAvatar title={title} size="lg" />;

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
        <MemberAvatar title={title} logo={logo} size="lg" />
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
          {member.logoOriginal && (
            <a
              href={logoUrl(member.logoOriginal)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "sm:mr-auto",
              )}
            >
              <FileText />
              Orijinal {logoOriginalKind(member.logoOriginal)}
            </a>
          )}
          <DeleteLogoButton member={member} onDeleted={() => setOpen(false)} />
          <ChangeLogoButton member={{ ...member, logo }} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
