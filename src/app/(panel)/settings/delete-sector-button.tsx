"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { deleteSector, type Sector } from "@/lib/fetches/sector";

export function DeleteSectorButton({ sector }: { sector: Sector }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => deleteSector(sector.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sectors"] }),
        // its members are left without a sector
        queryClient.invalidateQueries({ queryKey: ["members"] }),
      ]);
      setOpen(false);
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) reset();
      }}
    >
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${sector.name} sektörünü sil`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          {sector.memberCount > 0 ? (
            <>
              <AlertDialogTitle>
                Bu sektöre bağlı üyeler var, silmek istediğinize emin misiniz?
              </AlertDialogTitle>
              <AlertDialogDescription>
                “{sector.name}” sektörüne bağlı {sector.memberCount} üye var.
                Sektör silinirse bu üyelerin sektör bilgisi boş kalır; üyeler
                silinmez. Bu işlem geri alınamaz.
              </AlertDialogDescription>
            </>
          ) : (
            <>
              <AlertDialogTitle>“{sector.name}” silinsin mi?</AlertDialogTitle>
              <AlertDialogDescription>
                Sektör kalıcı olarak silinir. Bu işlem geri alınamaz.
              </AlertDialogDescription>
            </>
          )}
        </AlertDialogHeader>
        {error && <FieldError>{error.message}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={() => mutate()}
          >
            {isPending ? "Siliniyor…" : "Sil"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
