import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { PaymentForm } from "../_components/payment-form";
import {
  counterpartyParam,
  prefetchFormLists,
} from "../_components/prefetch-form-lists";

export default async function NewPaymentPage({
  searchParams,
}: PageProps<"/payments/new">) {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // `?counterparty=12` from a cari page's "Ödeme Ekle"
  const fromCounterpartyId = counterpartyParam(
    (await searchParams).counterparty,
  );

  await prefetchFormLists(queryClient, options);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PaymentForm fromCounterpartyId={fromCounterpartyId} />
    </HydrationBoundary>
  );
}
