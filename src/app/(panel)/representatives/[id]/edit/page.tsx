import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getRepresentative } from "@/lib/fetches/representative";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { prefetchRepresentativeFormOptions } from "../../_components/prefetch-form-options";
import { EditRepresentative } from "./edit-representative";

export default async function EditRepresentativePage({
  params,
}: PageProps<"/representatives/[id]/edit">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch (what the pickers list too)
  const [representative] = await Promise.all([
    queryClient
      .query({
        queryKey: ["representatives", id],
        queryFn: () => getRepresentative(id, options),
      })
      .catch(console.error),
    prefetchRepresentativeFormOptions(queryClient, options),
  ]);

  if (representative === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditRepresentative id={id} />
    </HydrationBoundary>
  );
}
