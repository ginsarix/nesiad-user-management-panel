import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getMembers } from "@/lib/fetches/member";
import { getRepresentative } from "@/lib/fetches/representative";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { EditRepresentative } from "./edit-representative";

export default async function EditRepresentativePage({
  params,
}: PageProps<"/representatives/[id]/edit">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch (the members to link too)
  const [representative] = await Promise.all([
    queryClient
      .query({
        queryKey: ["representatives", id],
        queryFn: () => getRepresentative(id, options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["members"],
        queryFn: () => getMembers(options),
      })
      .catch(console.error),
  ]);

  if (representative === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditRepresentative id={id} />
    </HydrationBoundary>
  );
}
