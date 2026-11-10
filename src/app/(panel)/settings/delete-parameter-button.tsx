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
import { deleteParameter, type Parameter } from "@/lib/fetches/parameter";
import { PARAMETER_KIND_LABELS } from "@/lib/parameters";

export function DeleteParameterButton({ parameter }: { parameter: Parameter }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const label = PARAMETER_KIND_LABELS[parameter.kind];

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => deleteParameter(parameter.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["parameters"] });
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
            aria-label={`${label}: ${parameter.name} sil`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
        }
      />
      <AlertDialogContent>
        {parameter.paymentCount > 0 ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>“{parameter.name}” silinemez</AlertDialogTitle>
              <AlertDialogDescription>
                Bu kayıt {parameter.paymentCount} ödemede kullanılıyor. Silmek
                için önce bu ödemelerin {label} alanını değiştirin.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Tamam</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                “{parameter.name}” silinsin mi?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {label} listesinden kalıcı olarak silinir. Bu işlem geri
                alınamaz.
              </AlertDialogDescription>
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
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
