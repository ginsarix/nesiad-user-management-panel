import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { MemberForm } from "../_components/member-form";
import { prefetchMemberFormOptions } from "../_components/prefetch-member-form";

export default async function NewMemberPage() {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch (what the pickers list)
  await prefetchMemberFormOptions(queryClient, options);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MemberForm />
    </HydrationBoundary>
  );
}
