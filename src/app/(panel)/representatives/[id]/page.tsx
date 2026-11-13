import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { NO_COLLECTION_FILTERS } from "@/lib/collection-filters";
import { getCollections } from "@/lib/fetches/collection";
import { getRepresentative } from "@/lib/fetches/representative";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { RepresentativeDetails } from "./representative-details";

export default async function RepresentativePage({
  params,
}: PageProps<"/representatives/[id]">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  const filters = { ...NO_COLLECTION_FILTERS, representative: id };

  // prefetch the yetkili and its tahsilatlar
  const [representative] = await Promise.all([
    queryClient
      .query({
        queryKey: ["representatives", id],
        queryFn: () => getRepresentative(id, options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["collections", "list", filters],
        queryFn: () => getCollections(filters, options),
      })
      .catch(console.error),
  ]);

  if (representative === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RepresentativeDetails id={id} />
    </HydrationBoundary>
  );
}
