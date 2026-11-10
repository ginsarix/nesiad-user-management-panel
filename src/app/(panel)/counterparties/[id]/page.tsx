import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getCounterparty } from "@/lib/fetches/counterparty";
import { getPayments } from "@/lib/fetches/payment";
import { NO_PAYMENT_FILTERS } from "@/lib/payment-filters";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { CounterpartyDetails } from "./counterparty-details";

export default async function CounterpartyPage({
  params,
}: PageProps<"/counterparties/[id]">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const filters = { ...NO_PAYMENT_FILTERS, counterparty: id };

  // prefetch the cari and its payments
  const [counterparty] = await Promise.all([
    queryClient
      .query({
        queryKey: ["counterparties", id],
        queryFn: () => getCounterparty(id, options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["payments", "list", filters],
        queryFn: () => getPayments(filters, options),
      })
      .catch(console.error),
  ]);

  if (counterparty === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CounterpartyDetails id={id} />
    </HydrationBoundary>
  );
}
