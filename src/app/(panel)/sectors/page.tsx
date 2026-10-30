import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSectors } from "@/lib/fetches/sector";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Sectors } from "./sectors";

export default async function SectorsPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch
  await queryClient
    .query({
      queryKey: ["sectors"],
      queryFn: () => getSectors(options),
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Sectors />
    </HydrationBoundary>
  );
}
