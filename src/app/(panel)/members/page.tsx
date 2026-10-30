import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getMembers } from "@/lib/fetches/member";
import { getSectors } from "@/lib/fetches/sector";
import { getQueryClient } from "@/lib/query-client";
import { getSavedColumnVisibility } from "@/lib/saved-column-visibility";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Members } from "./members";

export default async function MembersPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const savedColumnVisibility = await getSavedColumnVisibility("members");

  // prefetch (the sectors are for the filter)
  await Promise.all([
    queryClient
      .query({
        queryKey: ["members"],
        queryFn: () => getMembers(options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["sectors"],
        queryFn: () => getSectors(options),
      })
      .catch(console.error),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Members savedColumnVisibility={savedColumnVisibility} />
    </HydrationBoundary>
  );
}
