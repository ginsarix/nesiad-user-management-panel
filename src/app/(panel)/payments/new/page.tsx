import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { PaymentForm } from "../_components/payment-form";
import { idParam, prefetchFormLists } from "../_components/prefetch-form-lists";

export default async function NewPaymentPage({
  searchParams,
}: PageProps<"/payments/new">) {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // `?counterparty=12` / `?cashAccount=3` from a cari's or Kasa - Banka's "Ödeme Ekle"
  const query = await searchParams;
  const fromCounterpartyId = idParam(query.counterparty);
  const fromCashAccountId = idParam(query.cashAccount);

  await prefetchFormLists(queryClient, options);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PaymentForm
        fromCounterpartyId={fromCounterpartyId}
        fromCashAccountId={fromCashAccountId}
      />
    </HydrationBoundary>
  );
}
