import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getRepresentatives } from "@/lib/fetches/representative";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Representatives } from "./representatives";

export default async function RepresentativesPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch
  await queryClient
    .query({
      queryKey: ["representatives"],
      queryFn: () => getRepresentatives(options),
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Representatives />
    </HydrationBoundary>
  );
}
