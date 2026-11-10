import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getCounterparties } from "@/lib/fetches/counterparty";
import { getQueryClient } from "@/lib/query-client";
import { getSavedColumnVisibility } from "@/lib/saved-column-visibility";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Counterparties } from "./counterparties";

export default async function CounterpartiesPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const savedColumnVisibility =
    await getSavedColumnVisibility("counterparties");

  // prefetch
  await queryClient
    .query({
      queryKey: ["counterparties"],
      queryFn: () => getCounterparties(options),
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Counterparties savedColumnVisibility={savedColumnVisibility} />
    </HydrationBoundary>
  );
}
