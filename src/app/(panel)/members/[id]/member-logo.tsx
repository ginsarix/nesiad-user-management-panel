"use client";

import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { logoUrl } from "@/lib/fetches/member";
import { MemberAvatar } from "../_components/member-info";

/** The member's avatar; a logo opens full size in a dialog when clicked */
export function MemberLogo({
  title,
  logo,
}: {
  title: string;
  logo: string | null;
}) {
  if (!logo) return <MemberAvatar title={title} size="lg" />;

  return (
    <Dialog>
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
          className="mx-auto h-auto max-h-[75vh] w-auto max-w-full rounded-md border bg-white object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
