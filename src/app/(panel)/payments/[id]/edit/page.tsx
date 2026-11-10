import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getPayment } from "@/lib/fetches/payment";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import {
  counterpartyParam,
  prefetchFormLists,
} from "../../_components/prefetch-form-lists";
import { EditPayment } from "./edit-payment";

export default async function EditPaymentPage({
  params,
  searchParams,
}: PageProps<"/payments/[id]/edit">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  // `?counterparty=12` when opened from a cari page: return there
  const fromCounterpartyId = counterpartyParam(
    (await searchParams).counterparty,
  );

  // prefetch
  const [payment] = await Promise.all([
    queryClient
      .query({
        queryKey: ["payments", "detail", id],
        queryFn: () => getPayment(id, options),
      })
      .catch(console.error),
    prefetchFormLists(queryClient, options),
  ]);

  if (payment === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditPayment id={id} fromCounterpartyId={fromCounterpartyId} />
    </HydrationBoundary>
  );
}
