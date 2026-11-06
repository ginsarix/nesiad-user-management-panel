"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createSector, type Sector, updateSector } from "@/lib/fetches/sector";
import { type SectorFormValues, sectorSchema } from "@/lib/zod-schemas/sector";

/** Adds a sector without one, renames it with one */
export function SectorDialog({
  sector,
  open,
  onOpenChange,
}: {
  sector?: Sector;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {sector ? "Sektörü Düzenle" : "Yeni Sektör"}
          </DialogTitle>
        </DialogHeader>
        {/* the content unmounts when closed, so each opening starts fresh */}
        <SectorForm sector={sector} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SectorForm({
  sector,
  onSaved,
}: {
  sector?: Sector;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm({
    resolver: zodResolver(sectorSchema),
    defaultValues: { name: sector?.name ?? "" },
  });
  const { errors } = form.formState;

  const { mutate, isPending } = useMutation({
    mutationFn: (values: SectorFormValues) =>
      sector ? updateSector(sector.id, values) : createSector(values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sectors"] }),
        // members show the sector's name
        queryClient.invalidateQueries({ queryKey: ["members"] }),
      ]);
      onSaved();
    },
    // e.g. "Bu isimde bir sektör zaten var"
    onError: (error) => form.setError("name", { message: error.message }),
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => mutate(values))}
      className="flex flex-col gap-4"
      noValidate
    >
      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor="sector-name">Sektör adı</FieldLabel>
        <Input
          id="sector-name"
          autoComplete="off"
          autoFocus
          aria-invalid={!!errors.name}
          {...form.register("name")}
        />
        <FieldError errors={[errors.name]} />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </DialogFooter>
    </form>
  );
}
