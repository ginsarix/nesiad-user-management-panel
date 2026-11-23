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
  type CashAccount,
  deleteCashAccount,
} from "@/lib/fetches/cash-account";
import { listHref } from "@/lib/list-href";

/** "2 ödeme ve 1 tahsilat" */
function recordsText({ paymentCount, collectionCount }: CashAccount) {
  return [
    paymentCount > 0 && `${paymentCount} ödeme`,
    collectionCount > 0 && `${collectionCount} tahsilat`,
  ]
    .filter(Boolean)
    .join(" ve ");
}

/** An account with ödemeler or tahsilatlar can't be deleted; the dialog says why instead */
export function DeleteCashAccountButton({ account }: { account: CashAccount }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const inUse = account.paymentCount > 0 || account.collectionCount > 0;

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => deleteCashAccount(account.id),
    onSuccess: async () => {
      // only the list: refetching this account now would just 404
      await queryClient.invalidateQueries({
        queryKey: ["cash-accounts"],
        exact: true,
      });
      router.push(listHref("/cash-accounts"));
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
        {inUse ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Bu hesap silinemez</AlertDialogTitle>
              <AlertDialogDescription>
                “{account.name}” hesabına ait {recordsText(account)} var. Silmek
                yerine hesabı pasif yapabilirsiniz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Tamam</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>“{account.name}” silinsin mi?</AlertDialogTitle>
              <AlertDialogDescription>
                Hesap kalıcı olarak silinir. Bu işlem geri alınamaz.
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
