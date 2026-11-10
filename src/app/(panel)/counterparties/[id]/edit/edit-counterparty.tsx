"use client";

import { useQuery } from "@tanstack/react-query";
import { getCounterparty } from "@/lib/fetches/counterparty";
import { CounterpartyForm } from "../../_components/counterparty-form";

export function EditCounterparty({ id }: { id: number }) {
  const { data: counterparty, isError } = useQuery({
    queryKey: ["counterparties", id],
    queryFn: () => getCounterparty(id),
  });

  if (isError) {
    return (
      <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        Cari bilgileri yüklenirken bir hata oluştu.
      </p>
    );
  }

  return counterparty ? <CounterpartyForm counterparty={counterparty} /> : null;
}
