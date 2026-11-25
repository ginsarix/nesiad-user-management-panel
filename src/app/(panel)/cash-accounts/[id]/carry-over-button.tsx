"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
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
import { type CashAccount, carryOver } from "@/lib/fetches/cash-account";
import { formatAmount } from "@/lib/money";

type Period = CashAccount["periods"][number];

/**
 * "Devir et": asks first, showing the destination's Başlangıç Bakiyesi
 * before and after, then carries the source's Bakiye into it
 */
export function CarryOverButton({
  accountId,
  from,
  to,
  label = "Devir et",
  size = "default",
}: {
  accountId: number;
  from: Period;
  to: Period;
  label?: string;
  size?: "default" | "sm";
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () =>
      carryOver(accountId, { fromPeriodId: from.id, toPeriodId: to.id }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cash-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
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
          <Button variant="outline" size={size}>
            <ArrowRightLeft />
            {label}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isoToDisplay(from.startDate)} dönemi {isoToDisplay(to.startDate)}{" "}
            dönemine devredilsin mi?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isoToDisplay(to.startDate)} başlangıç bakiyesi:{" "}
            <span className="tabular-nums">
              {formatAmount(to.openingBalance)} → {formatAmount(from.balance)}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error.message}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={() => mutate()}>
            {isPending ? "Devrediliyor…" : "Devir et"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
