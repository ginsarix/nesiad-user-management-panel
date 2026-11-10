"use client";

import { useQuery } from "@tanstack/react-query";
import { getPayment } from "@/lib/fetches/payment";
import { PaymentForm } from "../../_components/payment-form";

export function EditPayment({
  id,
  fromCounterpartyId,
}: {
  id: number;
  fromCounterpartyId?: number;
}) {
  const { data: payment, isError } = useQuery({
    queryKey: ["payments", "detail", id],
    queryFn: () => getPayment(id),
  });

  if (isError) {
    return (
      <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        Ödeme bilgileri yüklenirken bir hata oluştu.
      </p>
    );
  }

  return payment ? (
    <PaymentForm payment={payment} fromCounterpartyId={fromCounterpartyId} />
  ) : null;
}
