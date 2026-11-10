import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getCollection } from "@/lib/fetches/collection";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import {
  idParam,
  prefetchFormLists,
} from "../../_components/prefetch-form-lists";
import { EditCollection } from "./edit-collection";

export default async function EditCollectionPage({
  params,
  searchParams,
}: PageProps<"/collections/[id]/edit">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();
  // opened from a member or proje page: return there
  const query = await searchParams;
  const from = {
    member: idParam(query.member),
    project: idParam(query.project),
  };

  // prefetch
  const [collection] = await Promise.all([
    queryClient
      .query({
        queryKey: ["collections", "detail", id],
        queryFn: () => getCollection(id, options),
      })
      .catch(console.error),
    prefetchFormLists(queryClient, options),
  ]);

  if (collection === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditCollection id={id} from={from} />
    </HydrationBoundary>
  );
}
