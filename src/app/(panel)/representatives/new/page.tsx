import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { prefetchRepresentativeFormOptions } from "../_components/prefetch-form-options";
import { RepresentativeForm } from "../_components/representative-form";

export default async function NewRepresentativePage({
  searchParams,
}: PageProps<"/representatives/new">) {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // `?member=12` from a member page's "Yetkili ekle"
  const { member } = await searchParams;
  const memberId = Number(member);
  const fromMemberId =
    Number.isSafeInteger(memberId) && memberId > 0 ? memberId : undefined;

  // prefetch (what the pickers list)
  await prefetchRepresentativeFormOptions(queryClient, options);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RepresentativeForm fromMemberId={fromMemberId} />
    </HydrationBoundary>
  );
}
