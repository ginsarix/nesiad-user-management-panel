import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getMember, getMembers } from "@/lib/fetches/member";
import { getQueryClient } from "@/lib/query-client";
import { EditMember } from "./edit-member";

export default async function EditMemberPage({
  params,
}: PageProps<"/members/[id]/edit">) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const queryClient = getQueryClient();

  // prefetch (the member list is for sector suggestions)
  const [member] = await Promise.all([
    queryClient
      .query({
        queryKey: ["members", id],
        queryFn: () => getMember(id),
      })
      .catch(console.error),
    queryClient
      .query({
        queryKey: ["members"],
        queryFn: getMembers,
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
