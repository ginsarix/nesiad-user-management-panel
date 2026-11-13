"use client";

import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ImageUp } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError } from "@/components/ui/field";
import { logoUrl } from "@/lib/fetches/member";
import {
  type RepresentativeDetails,
  setRepresentativePhoto,
} from "@/lib/fetches/representative";
import { PhotoFileError, resizePhoto } from "@/lib/photo-upload";
import { PhotoDropZone } from "../_components/photo-drop-zone";

/** Every page that shows a yetkili's photo */
export function invalidatePhotoQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["representatives"] }),
    // member pages list their yetkililer
    queryClient.invalidateQueries({ queryKey: ["members"] }),
    // Organizasyon group pages list their people
    queryClient.invalidateQueries({ queryKey: ["organizations"] }),
  ]);
}

export function ChangePhotoButton({
  representative,
}: {
  representative: RepresentativeDetails & { photo: string };
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <ImageUp />
            Fotoğraf Değiştir
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fotoğraf Değiştir</DialogTitle>
        </DialogHeader>
        {/* the content unmounts when closed, so each opening starts fresh */}
        <ChangePhotoForm
          representative={representative}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ChangePhotoForm({
  representative,
  onSaved,
}: {
  representative: RepresentativeDetails & { photo: string };
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  // only the latest pick may land when an earlier one finishes later
  const latestPick = useRef(0);

  const { mutate, isPending, error } = useMutation({
    mutationFn: (file: File) => setRepresentativePhoto(representative.id, file),
    onSuccess: async () => {
      await invalidatePhotoQueries(queryClient);
      onSaved();
    },
  });

  const pick = async (file: File | null) => {
    const pickId = ++latestPick.current;
    setPickError(null);
    setPhoto(null);
    if (!file) {
      setBusy(false);
      return;
    }

    setBusy(true);
    try {
      const resized = await resizePhoto(file);
      if (pickId === latestPick.current) setPhoto(resized);
    } catch (error) {
      if (pickId !== latestPick.current) return;
      if (!(error instanceof PhotoFileError)) throw error;
      setPickError(error.message);
    } finally {
      if (pickId === latestPick.current) setBusy(false);
    }
  };

  const message = pickError ?? error?.message;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (photo) mutate(photo);
        else if (!busy) setPickError("Yeni bir fotoğraf seçin");
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <Field data-invalid={!!message}>
        <PhotoDropZone
          id="new-photo"
          file={photo}
          currentUrl={logoUrl(representative.photo)}
          busy={busy}
          onPick={pick}
          // back to the current photo
          onRemove={photo ? () => pick(null) : undefined}
        />
        {message && <FieldError>{message}</FieldError>}
      </Field>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          İptal
        </DialogClose>
        <Button type="submit" disabled={isPending || busy}>
          {isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </DialogFooter>
    </form>
  );
}
