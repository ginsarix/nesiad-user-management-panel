"use client";

import { useQuery } from "@tanstack/react-query";
import { getCashAccount } from "@/lib/fetches/cash-account";
import { CashAccountForm } from "../../_components/cash-account-form";

export function EditCashAccount({ id }: { id: number }) {
  const { data: account, isError } = useQuery({
    queryKey: ["cash-accounts", id],
    queryFn: () => getCashAccount(id),
  });

  if (isError) {
    return (
      <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        Hesap bilgileri yüklenirken bir hata oluştu.
      </p>
    );
  }

  return account ? <CashAccountForm account={account} /> : null;
}
