import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getPayments } from "@/lib/fetches/payment";
import { parsePaymentFilters } from "@/lib/payment-filters";
import { getQueryClient } from "@/lib/query-client";
import { getSavedColumnVisibility } from "@/lib/saved-column-visibility";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { prefetchFormLists } from "./_components/prefetch-form-lists";
import { Payments } from "./payments";

export default async function PaymentsPage({
  searchParams,
}: PageProps<"/payments">) {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const savedColumnVisibility = await getSavedColumnVisibility("payments");

  // the same filters the client reads from the URL
  const params = await searchParams;
  const filters = parsePaymentFilters({
    get: (name) => {
      const value = params[name];
      return typeof value === "string" ? value : null;
    },
  });

  // prefetch the list and the filters' choices
  await Promise.all([
    queryClient
      .query({
        queryKey: ["payments", "list", filters],
        queryFn: () => getPayments(filters, options),
      })
      .catch(console.error),
    prefetchFormLists(queryClient, options),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Payments savedColumnVisibility={savedColumnVisibility} />
    </HydrationBoundary>
  );
}
