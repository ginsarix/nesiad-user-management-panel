import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getParameters } from "@/lib/fetches/parameter";
import { getSectors } from "@/lib/fetches/sector";
import { getQueryClient } from "@/lib/query-client";
import { getSavedColumnVisibility } from "@/lib/saved-column-visibility";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Settings } from "./settings";

export default async function SettingsPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const savedSectorColumnVisibility = await getSavedColumnVisibility("sectors");

  // prefetch
  await Promise.all([
    queryClient
      .query({
        queryKey: ["sectors"],
        queryFn: () => getSectors(options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["parameters"],
        queryFn: () => getParameters(options),
      })
      .catch(console.error),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Settings savedSectorColumnVisibility={savedSectorColumnVisibility} />
    </HydrationBoundary>
  );
}
