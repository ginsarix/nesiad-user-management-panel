import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getMembers } from "@/lib/fetches/member";
import { getQueryClient } from "@/lib/query-client";
import { Members } from "./members";

export default async function PostsPage() {
  const queryClient = getQueryClient();

  // prefetch
  await queryClient
    .query({
      queryKey: ["members"],
      queryFn: getMembers,
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Members />
    </HydrationBoundary>
  );
}
