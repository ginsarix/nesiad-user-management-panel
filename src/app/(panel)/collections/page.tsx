import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { parseCollectionFilters } from "@/lib/collection-filters";
import { getCollections } from "@/lib/fetches/collection";
import { getQueryClient } from "@/lib/query-client";
import { getSavedColumnVisibility } from "@/lib/saved-column-visibility";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { prefetchFormLists } from "./_components/prefetch-form-lists";
import { Collections } from "./collections";

export default async function CollectionsPage({
  searchParams,
}: PageProps<"/collections">) {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  const savedColumnVisibility = await getSavedColumnVisibility("collections");

  // the same filters the client reads from the URL
  const params = await searchParams;
  const filters = parseCollectionFilters({
    get: (name) => {
      const value = params[name];
      return typeof value === "string" ? value : null;
    },
  });

  // prefetch the list and the filters' choices
  await Promise.all([
    queryClient
      .query({
        queryKey: ["collections", "list", filters],
        queryFn: () => getCollections(filters, options),
      })
      .catch(console.error),
    prefetchFormLists(queryClient, options),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Collections savedColumnVisibility={savedColumnVisibility} />
    </HydrationBoundary>
  );
}
