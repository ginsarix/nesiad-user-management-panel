import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
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

  // prefetch
  const representative = await queryClient
    .query({
      queryKey: ["representatives", id],
      queryFn: () => getRepresentative(id, options),
    })
    .catch(console.error);

  if (representative === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RepresentativeDetails id={id} />
    </HydrationBoundary>
  );
}
