import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSectors } from "@/lib/fetches/sector";
import { getQueryClient } from "@/lib/query-client";
import { getSavedColumnVisibility } from "@/lib/saved-column-visibility";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Sectors } from "./sectors";

export default async function SettingsPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const savedColumnVisibility = await getSavedColumnVisibility("sectors");

  // prefetch
  await queryClient
    .query({
      queryKey: ["sectors"],
      queryFn: () => getSectors(options),
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Sectors savedColumnVisibility={savedColumnVisibility} />
    </HydrationBoundary>
  );
}
