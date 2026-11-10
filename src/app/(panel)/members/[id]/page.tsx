import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { NO_COLLECTION_FILTERS } from "@/lib/collection-filters";
import { getCollections } from "@/lib/fetches/collection";
import { getMember } from "@/lib/fetches/member";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { MemberDetails } from "./member-details";

export default async function MemberPage({
  params,
}: PageProps<"/members/[id]">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  const filters = { ...NO_COLLECTION_FILTERS, member: id };

  // prefetch the member and its tahsilatlar
  const [member] = await Promise.all([
    queryClient
      .query({
        queryKey: ["members", id],
        queryFn: () => getMember(id, options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["collections", "list", filters],
        queryFn: () => getCollections(filters, options),
      })
      .catch(console.error),
  ]);

  if (member === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MemberDetails id={id} />
    </HydrationBoundary>
  );
}
