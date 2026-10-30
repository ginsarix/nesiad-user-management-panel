import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getMember } from "@/lib/fetches/member";
import { getSectors } from "@/lib/fetches/sector";
import { getQueryClient } from "@/lib/query-client";
import { forwardedRequestOptions, requireSession } from "@/lib/session";
import { EditMember } from "./edit-member";

export default async function EditMemberPage({
  params,
}: PageProps<"/members/[id]/edit">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const options = await forwardedRequestOptions();
  const queryClient = getQueryClient();

  // prefetch (the sectors to pick from too)
  const [member] = await Promise.all([
    queryClient
      .query({
        queryKey: ["members", id],
        queryFn: () => getMember(id, options),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["sectors"],
        queryFn: () => getSectors(options),
      })
      .catch(console.error),
  ]);

  if (member === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditMember id={id} />
    </HydrationBoundary>
  );
}
