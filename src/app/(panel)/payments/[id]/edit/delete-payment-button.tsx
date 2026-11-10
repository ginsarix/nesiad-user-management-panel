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
import { isoToDisplay } from "@/lib/dates";
import { deletePayment, type Payment } from "@/lib/fetches/payment";
import { formatAmount } from "@/lib/money";

export function DeletePaymentButton({
  payment,
  backHref,
}: {
  payment: Payment;
  backHref: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => deletePayment(payment.id),
    onSuccess: async () => {
      await Promise.all([
        // not this payment's own query: refetching it now would just 404
        queryClient.invalidateQueries({ queryKey: ["payments", "list"] }),
        queryClient.invalidateQueries({ queryKey: ["counterparties"] }),
        queryClient.invalidateQueries({ queryKey: ["parameters"] }),
      ]);
      router.push(backHref);
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
          <Button type="button" variant="destructive">
            <Trash2 />
            Sil
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bu ödeme silinsin mi?</AlertDialogTitle>
          <AlertDialogDescription>
            {payment.counterpartyTitle} carisine {isoToDisplay(payment.date)}{" "}
            tarihli {formatAmount(payment.amount)} ödeme kalıcı olarak silinir.
            Bu işlem geri alınamaz.
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
      </AlertDialogContent>
    </AlertDialog>
  );
}
