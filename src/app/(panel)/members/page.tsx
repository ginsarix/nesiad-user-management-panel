import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getMembers } from "@/lib/fetches/member";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { Members } from "./members";

export default async function MembersPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch
  await queryClient
    .query({
      queryKey: ["members"],
      queryFn: () => getMembers(options),
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Members />
    </HydrationBoundary>
  );
}
