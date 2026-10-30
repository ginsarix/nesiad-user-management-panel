import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSectors } from "@/lib/fetches/sector";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { MemberForm } from "../_components/member-form";

export default async function NewMemberPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch (the sectors to pick from)
  await queryClient
    .query({
      queryKey: ["sectors"],
      queryFn: () => getSectors(options),
    })
    .catch(console.error);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MemberForm />
    </HydrationBoundary>
  );
}
