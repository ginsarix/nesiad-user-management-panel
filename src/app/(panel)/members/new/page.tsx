import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getMembers } from "@/lib/fetches/member";
import { getQueryClient } from "@/lib/query-client";
import { MemberForm } from "../_components/member-form";

export default async function NewMemberPage() {
  const queryClient = getQueryClient();

  // prefetch (for sector suggestions)
  await queryClient
    .query({
      queryKey: ["members"],
      queryFn: getMembers,
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MemberForm />
    </HydrationBoundary>
  );
}
