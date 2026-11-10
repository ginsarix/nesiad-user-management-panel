"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
  type Counterparty,
  deleteCounterparty,
} from "@/lib/fetches/counterparty";
import { listHref } from "@/lib/list-href";

/** A cari with payments can't be deleted; the dialog says why instead */
export function DeleteCounterpartyButton({
  counterparty,
}: {
  counterparty: Counterparty;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const hasPayments = counterparty.paymentCount > 0;

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => deleteCounterparty(counterparty.id),
    onSuccess: async () => {
      // only the list: refetching this cari now would just 404
      await queryClient.invalidateQueries({
        queryKey: ["counterparties"],
        exact: true,
      });
      router.push(listHref("/counterparties"));
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
          <Button variant="destructive">
            <Trash2 />
            Sil
          </Button>
        }
      />
      <AlertDialogContent>
        {hasPayments ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Bu cari silinemez</AlertDialogTitle>
              <AlertDialogDescription>
                “{counterparty.title}” carisine ait {counterparty.paymentCount}{" "}
                ödeme var. Cariyi silmek için önce ödemelerini silin.
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
                “{counterparty.title}” silinsin mi?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Cari kalıcı olarak silinir. Bu işlem geri alınamaz.
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
