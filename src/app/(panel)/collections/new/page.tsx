import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { CollectionForm } from "../_components/collection-form";
import { idParam, prefetchFormLists } from "../_components/prefetch-form-lists";

export default async function NewCollectionPage({
  searchParams,
}: PageProps<"/collections/new">) {
  await requireSession();
  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // `?representative=12` / `?project=3` from a yetkili's or proje's "Tahsilat Ekle"
  const params = await searchParams;
  const from = {
    representative: idParam(params.representative),
    project: idParam(params.project),
  };

  await prefetchFormLists(queryClient, options);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CollectionForm from={from} />
    </HydrationBoundary>
  );
}
