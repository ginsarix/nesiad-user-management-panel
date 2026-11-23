"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CirclePause } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type CashAccount,
  updateCashAccount,
} from "@/lib/fetches/cash-account";

/** "Pasife al" / "Aktife al" in one click; reversible, so no confirmation */
export function ToggleActiveButton({ account }: { account: CashAccount }) {
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      updateCashAccount(account.id, {
        name: account.name,
        openingBalance: account.openingBalance,
        active: !account.active,
      }),
    // the Ödeme and Tahsilat forms only offer Aktif accounts
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["cash-accounts"] }),
    onError: (error) => window.alert(error.message),
  });

  return (
    <Button variant="outline" disabled={isPending} onClick={() => mutate()}>
      {account.active ? <CirclePause /> : <CircleCheck />}
      {account.active ? "Pasife al" : "Aktife al"}
    </Button>
  );
}
