"use client";

import Image from "next/image";
import { useState } from "react";
import { RepresentativeAvatar } from "@/components/representative-avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { logoUrl } from "@/lib/fetches/member";
import type { RepresentativeDetails } from "@/lib/fetches/representative";
import { ChangePhotoButton } from "./change-photo-button";
import { DeletePhotoButton } from "./delete-photo-button";

/**
 * The yetkili's avatar; a photo opens full size in a dialog when clicked,
 * where it can be changed or removed. Without one, a photo is added through
 * Düzenle.
 */
export function RepresentativePhoto({
  representative,
}: {
  representative: RepresentativeDetails;
}) {
  const [open, setOpen] = useState(false);
  const { name, photo } = representative;

  if (!photo) return <RepresentativeAvatar name={name} size="lg" />;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="Fotoğrafı büyüt"
        render={
          <button
            type="button"
            className="shrink-0 cursor-zoom-in rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <RepresentativeAvatar name={name} photo={photo} size="lg" />
      </DialogTrigger>
      <DialogContent className="w-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{name}</DialogTitle>
        </DialogHeader>
        <Image
          src={logoUrl(photo)}
          alt={`${name} fotoğrafı`}
          // real size comes from the file; CSS only caps it to the viewport
          width={0}
          height={0}
          unoptimized
          className="mx-auto h-auto max-h-[65vh] w-auto max-w-full rounded-md border object-contain"
        />
        <DialogFooter>
          <DeletePhotoButton
            representative={representative}
            onDeleted={() => setOpen(false)}
          />
          <ChangePhotoButton representative={{ ...representative, photo }} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
