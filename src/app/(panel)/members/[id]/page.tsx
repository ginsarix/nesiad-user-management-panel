import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getMember } from "@/lib/fetches/member";
import { getQueryClient } from "@/lib/query-client";
import { MemberDetails } from "./member-details";

export default async function MemberPage({
  params,
}: PageProps<"/members/[id]">) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const queryClient = getQueryClient();

  // prefetch
  const member = await queryClient
    .query({
      queryKey: ["members", id],
      queryFn: () => getMember(id),
    })
    .catch(console.error);

  if (member === null) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MemberDetails id={id} />
    </HydrationBoundary>
  );
}
